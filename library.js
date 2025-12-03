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


//dropddown bs
/**
 * Platform Filter Dropdown Logic
 * * This script initializes a dropdown filter using a hardcoded mapping 
 * between user-facing display names and internal platform keys.
 * It must be placed in a file or script block that runs after the DOM elements 
 * with IDs 'platform-filter-btn' and 'platform-filter-content' have been loaded.
 */
document.addEventListener('DOMContentLoaded', () => {
    const toggleButton = document.getElementById('platform-filter-btn');
    const dropdownContent = document.getElementById('platform-filter-content');

    // ====================================================================
    // >>> PLATFORM MAPPING DATA <<<
    // Maps display names to internal data keys for filtering.
    // Display Name (for UI) -> Key (for database/data filtering)
    // ====================================================================
    const PLATFORM_MAPPING = [
        { display: "PC", key: "PSPC" },
        { display: "PS5", key: "PS5" },
        { display: "PS4", key: "PS4" },
        { display: "PS3", key: "PS3" },
        { display: "Vita", key: "PSVITA" },
    ];


    if (toggleButton && dropdownContent) {
        
        /**
         * Returns an array of the internal keys (the filter values) for all currently checked items.
         * This array should be used to filter your main dataset.
         * @returns {string[]} Array of internal platform keys (e.g., ["PSPC", "PSVITA"])
         */
        function getSelectedPlatforms() {
            // Select all checked boxes
            const checked = dropdownContent.querySelectorAll('input[type="checkbox"]:checked');
            // Map them to their internal key (data-key)
            return Array.from(checked).map(cb => cb.dataset.key); 
        }

        /**
         * Updates the display text of the filter button based on current selections.
         */
        function updateFilterDisplay() {
            const checked = dropdownContent.querySelectorAll('input[type="checkbox"]:checked');
            const selectedCount = checked.length;
            
            // If zero are checked, or all available are checked, display "All"
            if (selectedCount === 0 || selectedCount === PLATFORM_MAPPING.length) {
                toggleButton.textContent = 'Platforms: All';
            } else {
                // Collect the user-friendly display names for the button text
                const selectedDisplayNames = Array.from(checked).map(cb => cb.dataset.display);
                
                // Display up to 3 names, otherwise show a count
                if (selectedDisplayNames.length <= 3) {
                    toggleButton.textContent = `Platforms: ${selectedDisplayNames.join(', ')}`;
                } else {
                    toggleButton.textContent = `Platforms: ${selectedDisplayNames.length} selected`;
                }
            }
        }

        /**
         * Dynamically generates the checkboxes based on the PLATFORM_MAPPING.
         */
        function renderPlatformCheckboxes(platforms) {
            dropdownContent.innerHTML = ''; // Clear previous content

            const fragment = document.createDocumentFragment();

            platforms.forEach(platform => {
                const label = document.createElement('label');
                
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                // Store BOTH the filter key and the display name
                checkbox.dataset.key = platform.key; 
                checkbox.dataset.display = platform.display;
                
                // Set all platforms to be checked by default for "Platforms: All" behavior
                checkbox.checked = true;

                label.appendChild(checkbox);
                label.appendChild(document.createTextNode(` ${platform.display}`));

                fragment.appendChild(label);
            });

            dropdownContent.appendChild(fragment);
            
            // Add a single listener to the container to detect changes on any checkbox
            dropdownContent.addEventListener('change', (event) => {
                if (event.target.type === 'checkbox') {
                    updateFilterDisplay();
                    
                    // --- INTEGRATION POINT: CALL YOUR DATA FILTERING FUNCTION HERE ---
                    // Example usage: 
                    // filterMainData(getSelectedPlatforms());
                    console.log("Checkbox changed. New filter keys:", getSelectedPlatforms());
                }
            });
            
            // Initialize display text after rendering
            updateFilterDisplay();
        }
        
        /**
         * Toggles the visibility and ARIA states of the platform filter dropdown.
         */
        function toggleDropdown() {
            const isExpanded = toggleButton.getAttribute('aria-expanded') === 'true';
            
            // This assumes you have a CSS class 'show' (or similar) to make the dropdown visible
            dropdownContent.classList.toggle('show'); 
            
            toggleButton.setAttribute('aria-expanded', String(!isExpanded));
            dropdownContent.setAttribute('aria-hidden', String(isExpanded));
        }
        
        // --- Initialization ---

        // 1. Load and render the platforms using the hardcoded mapping
        renderPlatformCheckboxes(PLATFORM_MAPPING);

        // 2. Listener for the button click (toggle)
        toggleButton.addEventListener('click', (event) => {
            event.stopPropagation();
            toggleDropdown();
        });

        // 3. Listener for closing the dropdown when clicking anywhere else on the page
        document.addEventListener('click', (event) => {
            if (dropdownContent.classList.contains('show') && 
                !dropdownContent.contains(event.target) && 
                event.target !== toggleButton) {
                
                // Close the dropdown
                dropdownContent.classList.remove('show');
                toggleButton.setAttribute('aria-expanded', 'false');
                dropdownContent.setAttribute('aria-hidden', 'true');
            }
        });
        
        // 4. Prevent the dropdown from closing when clicking inside it 
        dropdownContent.addEventListener('click', (event) => {
            event.stopPropagation();
        });
    } else {
        console.error("Platform filter elements not found. Ensure the HTML contains elements with IDs 'platform-filter-btn' and 'platform-filter-content'.");
    }
});











// Initial render call to display the library on page load
// This assumes 'rawData' is available when this script executes.
window.onload = render;