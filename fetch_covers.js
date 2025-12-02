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
    let gridUrl = '';
    let wideGridUrl = '';
    let steamGridDbId = null;

    try {
      // Step 1: search for the game
      const searchResults = await client.searchGame(game.displayName);
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

<!-- Link to external stylesheet -->
<link rel="stylesheet" href="style.css">

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
  // ONLY the JSON embedding line remains here for Node.js interpolation
  const rawData = ${JSON.stringify(libraryWithImages)};
</script>

<!-- Link to external JavaScript file -->
<script src="library.js"></script>

</body>
</html>`;

  fs.writeFileSync(OUTPUT_HTML, htmlContent, 'utf8');
  console.log(`Saved HTML preview to ${OUTPUT_HTML}`);
})();
