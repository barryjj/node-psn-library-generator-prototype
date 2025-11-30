// main.js - PSN POC with persistent token storage, refresh, distilled played games, debug purchased fetch, and merged full library
// Saves config & raw responses to project root (process.cwd())

const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const psn = require('psn-api');

const CONFIG_NAME = 'psn_config.json';
const PROFILE_RAW = 'profile_data_raw.json';
const PLAYED_RAW = 'get_user_played_raw.json';
const PLAYED_DISTILLED = 'get_user_played.json';
const PURCHASED_RAW = 'get_purchased_raw.json';
const TITLES_RAW = 'get_user_titles_raw.json';
const FULL_LIBRARY = 'full_library.json';
const MERGE_LOG = 'merge_log.json';

let mainWindow;
let configPath = path.join(process.cwd(), CONFIG_NAME);
let stored = { username: null, tokens: null }; // in-memory

// Helpers
function appendStatus(text) {
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('status-update', text);
  }
  console.log(text);
}

function saveConfig(cfg) {
  fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2), 'utf8');
  stored = { username: cfg.username, tokens: cfg.tokens };
}

function loadConfig() {
  if (!fs.existsSync(configPath)) return null;
  try {
    const c = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    stored = { username: c.username, tokens: c.tokens };
    return c;
  } catch (e) {
    appendStatus(`Failed to read config: ${e.message}`);
    return null;
  }
}

function writeRaw(filename, data) {
  try {
    fs.writeFileSync(path.join(process.cwd(), filename), JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    appendStatus(`Failed to write ${filename}: ${e.message}`);
  }
}

function appendPurchasedPage(page) {
  const p = path.join(process.cwd(), PURCHASED_RAW);
  let cur = [];
  try {
    if (fs.existsSync(p)) cur = JSON.parse(fs.readFileSync(p, 'utf8')) || [];
  } catch (e) {
    appendStatus('Warning: failed to read existing purchased file, overwriting.');
    cur = [];
  }
  cur = cur.concat(page);
  try {
    fs.writeFileSync(p, JSON.stringify(cur, null, 2), 'utf8');
  } catch (e) {
    appendStatus('Failed to append purchased page: ' + e.message);
  }
}

// token helpers
function tokenExpiresAt(tokens) {
  if (!tokens || !tokens.lastFetched || !tokens.expiresIn) return 0;
  return tokens.lastFetched + tokens.expiresIn * 1000;
}
function refreshExpiresAt(tokens) {
  if (!tokens || !tokens.lastFetched || !tokens.refreshTokenExpiresIn) return 0;
  return tokens.lastFetched + tokens.refreshTokenExpiresIn * 1000;
}
function isAccessExpired(tokens) {
  return Date.now() >= tokenExpiresAt(tokens);
}
function isRefreshExpired(tokens) {
  return Date.now() >= refreshExpiresAt(tokens);
}

// refresh tokens using psn-api
async function refreshTokensIfNeeded(tokens) {
  if (!tokens) throw new Error('No tokens to refresh.');
  if (!isAccessExpired(tokens)) return tokens;

  appendStatus('Access token expired — attempting refresh with refresh token...');
  if (!tokens.refreshToken) throw new Error('No refreshToken present to refresh.');
  if (isRefreshExpired(tokens)) throw new Error('Refresh token expired — please re-run Save Info with a fresh NPSSO.');

  try {
    const newAuth = await psn.exchangeRefreshTokenForAuthTokens(tokens.refreshToken);
    newAuth.lastFetched = Date.now();
    appendStatus('Token refresh succeeded — storing updated tokens.');
    const cfg = { username: stored.username, tokens: newAuth };
    saveConfig(cfg);
    return newAuth;
  } catch (err) {
    throw new Error('Token refresh failed: ' + (err.message || String(err)));
  }
}

// distill user played games
function distillPlayedGames(rawGames) {
  return (rawGames || []).map((g) => {
    const concept = g.concept || {};
    const mediaImages = (concept.media?.images || []).reduce((acc, img) => {
      if (img.type === 'GAMEHUB_COVER_ART') acc.cover = img.url;
      else if (img.type === 'MASTER') acc.master = img.url;
      else if (img.type === 'HERO_CHARACTER') acc.hero = img.url;
      return acc;
    }, {});
    return {
      titleId: g.titleId,
      conceptId: concept.id,
      name: g.name,
      category: g.category,
      genres: concept.genres || [],
      images: mediaImages,
      playCount: g.playCount,
      firstPlayed: g.firstPlayedDateTime,
      lastPlayed: g.lastPlayedDateTime,
      playDuration: g.playDuration
    };
  });
}

// ------------------ MERGE HELPERS & MERGE FUNCTION ------------------

// normalize a name string for loose matching
// function normalize(name) {
//   if (!name) return '';
//   return String(name)
//     .replace(/\(TM\)|™|®/gi, '')      // strip trademarks
//     .replace(/\b(edition|remastered|definitive|complete|ultimate)\b/gi, '') // common suffix noise
//     .replace(/[^a-z0-9]+/gi, '')      // remove non-alphanum
//     .toLowerCase()
//     .trim();
// }

// Normalize a name string for merging
function normalizedName(name) {
  if (!name) return '';
  return String(name)
    .replace(/\(TM\)|™|®/gi, '')      // strip trademarks
    .replace(/[^a-z0-9]+/gi, '')      // remove non-alphanum
    .toLowerCase()
    .trim();
}

// Display-friendly name (for UI and searches)
function displayName(name) {
  if (!name) return '';
  return String(name)
    .replace(/\(TM\)|™|®/gi, '')      // strip trademarks only
    .trim();
}

function normalizePlatformCasing(platform) {
    if (typeof platform === 'string' && platform.trim() !== '') {
        return platform.toUpperCase();
    }
    return platform;
}

// --- ADJUSTED DEMO FILTERING FUNCTION ---
// Detects demo/beta/trial versions based on name or the specific ID patterns (including the ...DEMO00000 case).
function isDemoGame(entry) {
  if (!entry) return false;

  const name = entry.name || entry.trophyTitleName || entry.titleName || '';
  const lcName = name.toLowerCase();

  // Check name for demo, beta, or trial version (using word boundaries)
  if (/\b(demo|beta|trial version)\b/i.test(lcName)) {
      console.debug(`[DEMO FILTER] Name match found for: ${name}`);
      return true;
  }

  // Check productId or entitlementId for DEMO patterns:
  // 1. DEMO followed by digits (DEMO00000)
  // 2. The word DEMO at the end of the ID string (MEMORYRETAILDEMO)
  const pid = entry.productId || '';
  const eid = entry.entitlementId || '';

  if (/(DEMO\d+|DEMO)$/i.test(pid) || /(DEMO\d+|DEMO)$/i.test(eid)) {
      console.debug(`[DEMO FILTER] ID pattern match found in: ${pid || eid}`);
      return true;
  }

  return false;
}

// extract normalized platform ('ps4'|'ps5'|null) from various item shapes
function platformOf(item) {
  if (!item) return null;
  if (item.platform) return String(item.platform).toLowerCase().includes('ps5') ? 'ps5' : String(item.platform).toLowerCase().includes('ps4') ? 'ps4' : null;
  if (item.trophyTitlePlatform) return String(item.trophyTitlePlatform).toLowerCase().includes('ps5') ? 'ps5' : String(item.trophyTitlePlatform).toLowerCase().includes('ps4') ? 'ps4' : null;
  if (item.category) return String(item.category).toLowerCase().includes('ps5') ? 'ps5' : String(item.category).toLowerCase().includes('ps4') ? 'ps4' : null;
  return null;
}

// require platforms to be compatible before a name-based merge if either side has platform info
function platformsCompatible(aItem, bItem) {
  const a = platformOf(aItem);
  const b = platformOf(bItem);
  if (!a && !b) return true;
  if (a && b) return a === b;
  return true;
}

// Try to find an existing map entry by scanning through lib values matching any of the ids in idList
function findByAnyId(libValues, idList) {
  if (!Array.isArray(idList) || idList.length === 0) return null;
  for (const id of idList) {
    if (!id) continue;
    const found = libValues.find(v => v && (v.titleId === id || v.npCommunicationId === id || v.productId === id));
    if (found) return found;
  }
  return null;
}

// Core merge: id-first, concept/titleIds-aware, then name+platform+demo fallback. Logs fallback merges.
// --- CORE MERGE FUNCTION WITH PRE-FILTERING ---
function mergeLibrary(purchased, titles, played) {
  const mergeLog = [];

  // **STAGE 1: PRE-FILTERING DEMOS**
  const filteredPurchased = (purchased || []).filter(p => !isDemoGame(p));
  const filteredTitles = (titles || []).filter(t => !isDemoGame(t));
  const filteredPlayed = (played || []).filter(p => !isDemoGame(p));

  // Logging using console.error for visibility
  console.error(`[FILTER STATS] Removed ${purchased.length - filteredPurchased.length} Purchased Demos.`);
  console.error(`[FILTER STATS] Removed ${titles.length - filteredTitles.length} Titles Demos.`);
  console.error(`[FILTER STATS] Removed ${played.length - filteredPlayed.length} Played Demos.`);

  const libMap = new Map(); // key -> merged entry

  const libValues = () => Array.from(libMap.values());

  // Step 1: purchased (Sets the reliable foundation)
  filteredPurchased.forEach(p => {
    const key = p.titleId || p.npCommunicationId || p.productId || p.name;
    const entry = Object.assign({}, p);
    entry.source = Array.from(new Set([...(entry.source || []), 'purchased']));

    entry.normalizedName = normalizedName(entry.name);
    entry.displayName = displayName(entry.name);
    
    // **APPLY NORMALIZATION HERE**
    if (entry.platform) {
        entry.platform = normalizePlatformCasing(entry.platform);
    }
    
    libMap.set(key, entry);
  });

  // Step 2: titles (Merges trophy data into purchased/existing entries)
  const currentLibValuesForTitles = libValues();

  filteredTitles.forEach(t => {
    const candidateIds = [t.npCommunicationId, t.titleId, t.productId].filter(Boolean);
    let existing = findByAnyId(currentLibValuesForTitles, candidateIds);

    if (!existing && t.titleId) {
      existing = currentLibValuesForTitles.find(v => v.concept?.titleIds?.includes(t.titleId));
    }

    if (!existing) {
      const tNorm = normalizedName(t.trophyTitleName || t.titleName || t.name);

      existing = currentLibValuesForTitles.find(v => {
        const vNorm = normalizedName(v.name || v.titleName || v.trophyTitleName);
        if (!vNorm || vNorm !== tNorm) return false;
        if (!platformsCompatible(v, t)) return false;
        return true;
      });
    }

    const key = existing?.titleId || existing?.npCommunicationId || t.npCommunicationId || t.titleId || t.trophyTitleName || t.titleName || t.name;

    const merged = Object.assign({}, existing || {}, {
      titleId: existing?.titleId || t.titleId,
      npCommunicationId: existing?.npCommunicationId || t.npCommunicationId,
      productId: existing?.productId || t.productId,

      name: t.trophyTitleName || existing?.name || t.titleName || t.name,
      trophies: t.definedTrophies || existing?.trophies,
      trophyProgress: (t.progress != null) ? t.progress : existing?.trophyProgress,
      images: Object.assign({}, existing?.images || {}, { cover: existing?.images?.cover || t.trophyTitleIconUrl || null }),
      source: Array.from(new Set([...(existing?.source || []), 'titles']))
    });

    // **APPLY NORMALIZATION HERE**
    if (t.trophyTitlePlatform) {
        merged.platform = normalizePlatformCasing(t.trophyTitlePlatform);
    } else if (existing?.platform) {
        merged.platform = normalizePlatformCasing(existing.platform);
    } else if (merged.platform) {
        merged.platform = normalizePlatformCasing(merged.platform);
    }
    
    merged.normalizedName = normalizedName(merged.name);
    merged.displayName = displayName(merged.name);

    libMap.set(key, merged);
  });

  // Step 3: played (Merges play history into existing entries)
  const currentLibValuesForPlayed = libValues();

  filteredPlayed.forEach(p => {
    const pCandidateIds = [p.titleId, p.npCommunicationId, p.productId].filter(Boolean);
    let existing = findByAnyId(currentLibValuesForPlayed, pCandidateIds);

    if (!existing && p.concept?.titleIds?.length) existing = findByAnyId(currentLibValuesForPlayed, p.concept.titleIds);

    if (!existing) {
      const pNorm = normalizedName(p.name || p.titleName || p.localizedName);

      existing = currentLibValuesForPlayed.find(v => {
        const vNorm = normalizedName(v.name || v.titleName || v.trophyTitleName);
        if (!vNorm || vNorm !== pNorm) return false;
        if (!platformsCompatible(v, p)) return false;
        return true;
      });
    }

    const key = existing?.titleId || existing?.npCommunicationId || p.titleId || p.name || p.localizedName || p.titleName;

    const playedImages = (p.images && (p.images.cover || p.images.master || p.images.hero))
      || (p.concept?.media?.images || []).reduce((acc, img) => {
        if (img.type === 'GAMEHUB_COVER_ART') acc.cover = img.url;
        else if (img.type === 'MASTER') acc.master = img.url;
        else if (img.type === 'HERO_CHARACTER') acc.hero = img.url;
        return acc;
      }, {});

    const merged = Object.assign({}, existing || {}, {
      titleId: existing?.titleId || p.titleId,
      npCommunicationId: existing?.npCommunicationId || p.npCommunicationId,
      productId: existing?.productId || p.productId,

      name: p.name || p.localizedName || existing?.name || p.titleName,
      playCount: (p.playCount != null) ? p.playCount : existing?.playCount || 0,
      firstPlayed: p.firstPlayed || p.firstPlayedDateTime || existing?.firstPlayed,
      lastPlayed: p.lastPlayed || p.lastPlayedDateTime || existing?.lastPlayed,
      playDuration: p.playDuration || existing?.playDuration,

      images: Object.assign({}, existing?.images || {}, playedImages, {
          cover: existing?.images?.cover || playedImages.cover
      }),

      trophies: existing?.trophies || null,
      trophyProgress: existing?.trophyProgress || null,
      source: Array.from(new Set([...(existing?.source || []), 'played']))
    });

    // **APPLY NORMALIZATION HERE**
    if (p.platform) {
        merged.platform = normalizePlatformCasing(p.platform);
    } else if (existing?.platform) {
        merged.platform = normalizePlatformCasing(existing.platform);
    } else if (merged.platform) {
        merged.platform = normalizePlatformCasing(merged.platform);
    }

    merged.normalizedName = normalizedName(merged.name);
    merged.displayName = displayName(merged.name);

    libMap.set(key, merged);
  });
  
  // FINAL CLEANUP: Ensure all platforms in the final list are standardized
  return Array.from(libMap.values()).map(item => {
      if (item.platform) {
          item.platform = normalizePlatformCasing(item.platform);
      }
      return item;
  });
}

// ------------------ END MERGE HELPERS & MERGE FUNCTION ------------------

// fetch full library
ipcMain.handle('fetch-full-library', async () => {
  try {
    const cfg = loadConfig();
    if (!cfg || !cfg.tokens || !cfg.username) {
      appendStatus('No config found. Use Save Info first.');
      return;
    }

    const tokens = await refreshTokensIfNeeded(cfg.tokens);
    const profileResp = await psn.getProfileFromUserName(tokens, cfg.username);
    const accountId = profileResp.profile?.accountId;
    if (!accountId) {
      appendStatus('Cannot fetch library: missing accountId.');
      return;
    }

    appendStatus('Fetching purchased games...');
    try { fs.unlinkSync(path.join(process.cwd(), PURCHASED_RAW)); } catch(e){}
    let totalFetched = 0;
    let cursor = null;
    const purchasedAll = [];
    while (true) {
      const resp = await psn.getPurchasedGames(tokens, {
        platform: ['ps4','ps5'],
        size: 100,
        start: cursor || 0,
        accountId
      });
      const gameList = resp?.data?.purchasedTitlesRetrieve;
      if (!gameList || !gameList.games?.length) break;
      appendPurchasedPage(gameList.games);
      purchasedAll.push(...gameList.games);
      totalFetched += gameList.games.length;
      appendStatus(`Purchased batch: ${gameList.games.length} items (total ${totalFetched})`);
      if (gameList.games.length < 100) break;
      cursor = (cursor || 0) + 100;
      await new Promise(r => setTimeout(r, 200));
    }
    appendStatus(`Purchased fetch complete. Total items: ${totalFetched}`);

    appendStatus('Fetching user titles...');
    const { trophyTitles } = await psn.getUserTitles(tokens, accountId);
    writeRaw(TITLES_RAW, trophyTitles || []);
    appendStatus(`Titles saved: ${trophyTitles.length}`);

    appendStatus('Fetching played games...');
    const playedGamesResponse = await psn.getUserPlayedGames(tokens, accountId);
    writeRaw(PLAYED_RAW, playedGamesResponse);
    // normalize to an array for merging
    const playedGames = Array.isArray(playedGamesResponse)
                        ? playedGamesResponse
                        : (playedGamesResponse.titles || playedGamesResponse.items || []);

    appendStatus(`Played games fetched: ${playedGames.length}`);

    appendStatus('Merging library...');
    const fullLibrary = mergeLibrary(purchasedAll, trophyTitles, playedGames);
    writeRaw(FULL_LIBRARY, fullLibrary);
    appendStatus(`Full library saved: ${fullLibrary.length} entries`);

    return fullLibrary;
  } catch (err) {
    appendStatus('Fetch full library failed: ' + (err.message || String(err)));
  }
});

// Create window & build UI
function buildHtml(config) {
  const hasCfg = !!config;
  const usernameVal = hasCfg ? (config.username || '') : '';
  let tokenBlock = '';
  if (hasCfg && config.tokens) {
    const t = config.tokens;
    const atk = t.accessToken || '';
    const rtk = t.refreshToken || '';
    const atExpStr = t.lastFetched ? new Date(tokenExpiresAt(t)).toString() : 'unknown';
    const rtExpStr = t.lastFetched ? new Date(refreshExpiresAt(t)).toString() : 'unknown';
    tokenBlock = `
      <h3>Stored Token Info</h3>
      <label>Username: <input id="username_stored" value="${usernameVal}" disabled style="width:300px"/></label><br/><br/>
      <label>Access Token:</label><br/>
      <textarea id="accessToken" rows="3" style="width:100%" disabled>${atk}</textarea><br/>
      <label>Access Token Expiry:</label><br/>
      <input id="accessExp" value="${atExpStr}" disabled style="width:100%"/><br/><br/>
      <label>Refresh Token:</label><br/>
      <textarea id="refreshToken" rows="2" style="width:100%" disabled>${rtk}</textarea><br/>
      <label>Refresh Token Expiry:</label><br/>
      <input id="refreshExp" value="${rtExpStr}" disabled style="width:100%"/><br/><br/>
      <button id="editBtn">Edit (use different NPSSO)</button>
      <hr/>
    `;
  }

  return `
  <html>
    <body style="font-family:sans-serif;padding:18px;">
      <h2>PSN Token / Data POC</h2>
      ${tokenBlock}
      <div id="editArea" style="${hasCfg ? 'display:none' : ''}">
        <label>PSN Online ID (required):</label><br/>
        <input id="username" style="width:300px;padding:6px;" value="${hasCfg ? usernameVal : ''}"/><br/><br/>
        <label>NPSSO (paste here):</label><br/>
        <textarea id="npsso" rows="2" style="width:100%;font-family:monospace;"></textarea><br/><br/>
        <button id="saveBtn">Save Info (exchange NPSSO → tokens)</button>
      </div>

      <div style="margin-top:12px;">
        <button id="fetchProfileBtn">Get Profile</button>
        <button id="fetchFullLibraryBtn">Get Full Library</button>
        <button id="refreshBtn">Refresh Access Token</button>
      </div>

      <h3>Status</h3>
      <pre id="status" style="white-space:pre-wrap;border:1px solid #ddd;padding:10px;height:300px;overflow:auto;"></pre>

      <script>
        const { ipcRenderer } = require('electron');
        document.getElementById('saveBtn')?.addEventListener('click', () => {
          const u = document.getElementById('username').value.trim();
          const n = document.getElementById('npsso').value.trim();
          ipcRenderer.invoke('save-info', { username: u, npsso: n });
        });
        document.getElementById('refreshBtn')?.addEventListener('click', () => ipcRenderer.invoke('refresh-now'));
        document.getElementById('fetchProfileBtn')?.addEventListener('click', () => ipcRenderer.invoke('fetch-profile'));
        document.getElementById('fetchFullLibraryBtn')?.addEventListener('click', () => ipcRenderer.invoke('fetch-full-library'));
        document.getElementById('editBtn')?.addEventListener('click', () => {
          document.getElementById('editArea').style.display='';
          ['username_stored','accessToken','accessExp','refreshToken','refreshExp','editBtn'].forEach(id=>{
            const el=document.getElementById(id); if(el) el.remove();
          });
          document.querySelectorAll('h3').forEach(h=>{ if(h.textContent.includes('Stored Token Info')) h.remove(); });
        });
        ipcRenderer.on('status-update',(ev,text)=>{
          const pre=document.getElementById('status'); pre.textContent+=text+'\\n'; pre.scrollTop=pre.scrollHeight;
        });
      </script>
    </body>
  </html>
  `;
}

function createWindow() {
  const config = loadConfig();
  mainWindow = new BrowserWindow({
    width: 840, height: 820,
    webPreferences: { nodeIntegration:true, contextIsolation:false }
  });
  mainWindow.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(buildHtml(config)));
}

// Save Info handler
ipcMain.handle('save-info', async (evt, { username, npsso }) => {
  try {
    if (!username || !npsso) { appendStatus('ERROR: username and npsso required.'); return; }
    appendStatus('Exchanging NPSSO for access code...');
    const accessCode = await psn.exchangeNpssoForAccessCode(npsso);
    if (!accessCode) throw new Error('No access code returned');

    appendStatus('Exchanging access code for auth tokens...');
    const authorization = await psn.exchangeAccessCodeForAuthTokens(accessCode);
    authorization.lastFetched = Date.now();
    saveConfig({ username, tokens: authorization });
    appendStatus('Tokens saved.');
  } catch (err) {
    appendStatus('Save Info failed: ' + (err.message || String(err)));
  }
});

// Electron init
app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
