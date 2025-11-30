// fetch_covers.js - NodeJS CommonJS prototype for PSN library covers
// Reads full_library.json, fetches SteamGridDB images, outputs full_library_images.json, and HTML preview

const fs = require('fs');
const path = require('path');

// Import the ESM module as CommonJS
const SGDB = require('steamgriddb').default;

// ---------------- CONFIG ----------------
const API_KEY = process.env.STEAMGRIDDB_API_KEY;
if (!API_KEY) throw new Error('Set STEAMGRIDDB_API_KEY in your environment first.');

const FULL_LIBRARY_JSON = path.join(__dirname, 'full_library.json');
const OUTPUT_JSON = path.join(__dirname, 'full_library_images.json');
const OUTPUT_HTML = path.join(__dirname, 'full_library_images.html');

// ---------------- HELPERS ----------------
function normalize(name) {
  if (!name) return '';
  return String(name)
    .replace(/\(TM\)|™|®/gi, '')
    .replace(/\b(edition|remastered|definitive|complete|ultimate)\b/gi, '')
    .replace(/[^a-z0-9]+/gi, '')
    .toLowerCase()
    .trim();
}

// ---------------- MAIN ----------------
(async function () {
  if (!fs.existsSync(FULL_LIBRARY_JSON)) {
    console.error('full_library.json not found.');
    process.exit(1);
  }

  const fullLibrary = JSON.parse(fs.readFileSync(FULL_LIBRARY_JSON, 'utf8'));
  const client = new SGDB({ key: API_KEY });
  const libraryWithImages = [];

  for (const game of fullLibrary) {
    const normName = normalize(game.name);
    let gridUrl = '';
    let wideGridUrl = '';
    let steamGridDbId = null;

    try {
      // Step 1: search for the game
      const searchResults = await client.searchGame(game.name);
      if (searchResults && searchResults.length > 0) {
        const bestMatch = searchResults[0]; // take the first match
        steamGridDbId = bestMatch.id;

        // Helper function to fetch first grid URL for a given dimension
        async function fetchFirstGrid(dimensions, fallback) {
          let grids = await client.getGridsById(steamGridDbId, undefined, [dimensions], undefined, undefined, false, false);
          if (!grids.length && fallback) {
            grids = await client.getGridsById(steamGridDbId, undefined, [fallback], undefined, undefined, false, false);
          }
          return grids.length ? grids[0].url : '';
        }

        // Step 2: get normal grid
        gridUrl = await fetchFirstGrid('600x900');

        // Step 3: get wide grid, fallback if missing
        wideGridUrl = await fetchFirstGrid('920x430', '460x215');
      }
    } catch (err) {
      console.error(`Error fetching images for "${game.name}":`, err.message);
    }

    libraryWithImages.push(Object.assign({}, game, {
      normalizedName: normName,
      gridUrl,
      wideGridUrl,
      steamGridDbId
    }));

    process.stdout.write('.');
  }

  console.log('\nDone fetching images.');

  // Write JSON
  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(libraryWithImages, null, 2), 'utf8');
  console.log(`Saved JSON to ${OUTPUT_JSON}`);

  // Generate simple HTML preview with scaled images
  const htmlRows = libraryWithImages.map(g => {
    const gridSrc = g.gridUrl || '';
    const wideSrc = g.wideGridUrl || '';
    return `<div style="display:inline-block;margin:6px;text-align:center;">
      <div style="width:150px;height:225px;background:#eee;display:flex;align-items:center;justify-content:center;">
        ${gridSrc ? `<img src="${gridSrc}" style="max-width:50%;max-height:50%"/>` : `<span>${g.name}</span>`}
      </div>
      <div style="width:200px;height:94px;background:#ddd;display:flex;align-items:center;justify-content:center;margin-top:4px;">
        ${wideSrc ? `<img src="${wideSrc}" style="max-width:50%;max-height:50%"/>` : `<span>${g.name}</span>`}
      </div>
      <div style="font-size:12px;margin-top:2px;">${g.platform || ''}</div>
    </div>`;
  }).join('\n');

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>PSN Library Covers</title>

<style>
  body {
    font-family: sans-serif;
    background: #1b1b1b;
    color: #fff;
    margin: 0;
    padding: 20px;
  }

  h2 {
    margin-top: 0;
  }

  .toolbar {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 20px;
    flex-wrap: wrap;
  }

  .toolbar input {
    padding: 8px 10px;
    border-radius: 6px;
    border: 1px solid #444;
    background: #2a2a2a;
    color: #fff;
    width: 220px;
  }

  .toolbar select,
  .toolbar button {
    background: #333;
    color: #fff;
    border: 1px solid #555;
    padding: 8px 14px;
    border-radius: 6px;
    cursor: pointer;
  }

  .toolbar button.active {
    background: #4c8bf5;
    border-color: #4c8bf5;
  }

  .library-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
  }

  .group-title {
    width: 100%;
    margin: 30px 0 10px;
    font-size: 20px;
    font-weight: bold;
    opacity: 0.85;
    border-bottom: 1px solid #444;
    padding-bottom: 4px;
  }

  .game-card {
    width: 150px;
    display: flex;
    flex-direction: column;
    align-items: center;
    transition: transform 0.15s ease, box-shadow 0.15s ease;
  }

  .game-card:hover {
    transform: scale(1.06);
    box-shadow: 0 0 10px #000a;
  }

  .capsule,
  .widecapsule {
    background: #2c2c2c;
    border-radius: 6px;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .capsule {
    width: 150px;
    height: 225px;
  }

  .widecapsule {
    width: 300px;
    height: 150px;
  }

  .capsule img,
  .widecapsule img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  /* Hidden wide view by default */
  .widecapsule {
    display: none;
  }
</style>
</head>
<body>

<h2>PSN Library Image Grid</h2>

<div class="toolbar">
  <button id="btnCapsule" class="active">📘 Capsule View</button>
  <button id="btnWide">📺 Wide View</button>

  <select id="sortSelect">
    <option value="az">Sort: A → Z</option>
    <option value="za">Sort: Z → A</option>
    <option value="platform">Sort: Platform</option>
  </select>

  <select id="groupSelect">
    <option value="none">Group: None</option>
    <option value="platform">Group: Platform</option>
  </select>

  <input type="text" id="searchBox" placeholder="Search…" />
</div>

<div id="libraryContainer"></div>

<script>
  const rawData = ${JSON.stringify(libraryWithImages)};
  
  let currentView = "capsule";
  let currentSort = "az";
  let currentGroup = "none";
  let searchTerm = "";

  function render() {
    let data = [...rawData];

    // -------- FILTER --------
    if (searchTerm.trim() !== "") {
      const term = searchTerm.toLowerCase();
      data = data.filter(g =>
        g.name.toLowerCase().includes(term) ||
        g.platform?.toLowerCase().includes(term)
      );
    }

    // -------- SORT --------
    if (currentSort === "az") {
      data.sort((a, b) => a.name.localeCompare(b.name));
    } else if (currentSort === "za") {
      data.sort((a, b) => b.name.localeCompare(a.name));
    } else if (currentSort === "platform") {
      data.sort((a, b) =>
        (a.platform || "").localeCompare(b.platform || "") ||
        a.name.localeCompare(b.name)
      );
    }

    // -------- GROUP --------
    let html = "";

    if (currentGroup === "platform") {
      const groups = {};
      for (const g of data) {
        const key = g.platform || "Unknown";
        if (!groups[key]) groups[key] = [];
        groups[key].push(g);
      }

      for (const platform of Object.keys(groups).sort()) {
        html += \`<div class="group-title">\${platform}</div>\`;
        html += renderCards(groups[platform]);
      }

    } else {
      html = renderCards(data);
    }

    document.getElementById("libraryContainer").innerHTML =
      \`<div class="library-grid">\${html}</div>\`;
  }

  function renderCards(list) {
    return list
      .map(g => \`
        <div class="game-card">
          <div class="capsule" data-card-type="capsule" style="display:\${currentView === 'capsule' ? 'flex' : 'none'}">
            \${g.gridUrl ? \`<img src="\${g.gridUrl}">\` : \`<span>\${g.name}</span>\`}
          </div>

          <div class="widecapsule" data-card-type="wide" style="display:\${currentView === 'wide' ? 'flex' : 'none'}">
            \${g.wideGridUrl ? \`<img src="\${g.wideGridUrl}">\` : \`<span>\${g.name}</span>\`}
          </div>
        </div>
    \`).join("");
  }

  // -------- UI HANDLERS --------
  document.getElementById("btnCapsule").addEventListener("click", () => {
    currentView = "capsule";
    document.getElementById("btnCapsule").classList.add("active");
    document.getElementById("btnWide").classList.remove("active");
    render();
  });

  document.getElementById("btnWide").addEventListener("click", () => {
    currentView = "wide";
    document.getElementById("btnWide").classList.add("active");
    document.getElementById("btnCapsule").classList.remove("active");
    render();
  });

  document.getElementById("sortSelect").addEventListener("change", e => {
    currentSort = e.target.value;
    render();
  });

  document.getElementById("groupSelect").addEventListener("change", e => {
    currentGroup = e.target.value;
    render();
  });

  document.getElementById("searchBox").addEventListener("input", e => {
    searchTerm = e.target.value;
    render();
  });

  render();
</script>

</body>
</html>`;

  fs.writeFileSync(OUTPUT_HTML, htmlContent, 'utf8');
  console.log(`Saved HTML preview to ${OUTPUT_HTML}`);
})();
