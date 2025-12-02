let currentView = "capsule";
let currentSort = "az";
let currentGroup = "none";
let searchTerm = "";

function render() {
  // rawData is defined in the inline <script> tag in the HTML and should be available globally
  // We use the spread operator to create a mutable copy for sorting/filtering
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
    // Sort by platform first, then by name
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

    // Iterate through sorted platforms (keys) to maintain order
    for (const platform of Object.keys(groups).sort()) {
      html += `<div class="group-title">${platform}</div>`;
      html += renderCards(groups[platform]);
    }

  } else {
    // No grouping, just render all cards
    html = renderCards(data);
  }

  // Inject the final HTML into the container
  document.getElementById("libraryContainer").innerHTML =
    `<div class="library-grid">${html}</div>`;
}

/**
 * Generates the HTML card structure for a given list of games.
 * @param {Array} list - The list of game objects to render.
 */
function renderCards(list) {
  return list
    .map(g => `
      <div class="game-card">
        <div class="capsule" data-card-type="capsule" style="display:${currentView === 'capsule' ? 'flex' : 'none'}">
          ${g.gridUrl ? `<img src="${g.gridUrl}" alt="${g.name} Capsule Art">` : `<span>${g.name}</span>`}
        </div>

        <div class="widecapsule" data-card-type="wide" style="display:${currentView === 'wide' ? 'flex' : 'none'}">
          ${g.wideGridUrl ? `<img src="${g.wideGridUrl}" alt="${g.name} Wide Art">` : `<span>${g.name}</span>`}
        </div>
      </div>
  `).join("");
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
  // Wait a moment after input stops before rendering for better performance
  // (though immediate rendering is fine for small datasets)
  searchTerm = e.target.value;
  render();
});

// Initial render call to display the library on page load
// This assumes 'rawData' is available when this script executes.
window.onload = render;