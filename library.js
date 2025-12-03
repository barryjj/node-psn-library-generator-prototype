let currentView = "capsule";
let currentSort = "az";
let currentGroup = "none";
let searchTerm = "";
let currentPlatforms = "all"

function render() {
  // rawData is defined in the inline <script> tag in the HTML and should be available globally
  // We use the spread operator to create a mutable copy for sorting/filtering
  let data = [...rawData];

  // -------- SEARCH FILTER --------
  if (searchTerm.trim() !== "") {
    const term = searchTerm.toLowerCase();
    data = data.filter(g =>
      g.name.toLowerCase().includes(term) ||
      g.platform?.toLowerCase().includes(term)
    );
  }

  // --- PLATFORM FILTER (Corrected Block for ALL/NONE/SOME) ---
  if (currentPlatforms !== "all") {
      
      const selectedKeys = Array.isArray(currentPlatforms) ? currentPlatforms : [];
      
      if (selectedKeys.length === 0) {
          // FIX: If the selected array is empty (Platforms: None), hide all games.
          data = []; 
      } else {
          // Case: Specific platforms selected (non-empty array).
          const selectedPlatformsSet = new Set(selectedKeys);
          
          data = data.filter(g => {
              const gamePlatform = g.platform;
              
              if (!gamePlatform) {
                  return false; 
              }
              
              // Split the comma-separated platform string (e.g., "PS5,PSPC") 
              const platformsOnGame = gamePlatform.split(',').map(p => p.trim());
              
              // Keep the game if ANY of its platforms are selected.
              return platformsOnGame.some(p => selectedPlatformsSet.has(p));
          });
      }
  }
  // -----------------------------------


  // -------- SORT --------
  if (currentSort === "az") {
    data.sort((a, b) => a.name.localeCompare(b.name));
  } else if (currentSort === "za") {
    data.sort((a, b) => b.name.localeCompare(b.name));
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
      html += `<div class="group-title">${platform} (${groups[platform].length})</div>`;
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
  searchTerm = e.target.value;
  render();
});

// --- PLATFORM FILTER LISTENER ---
document.getElementById("platform-filter-content").addEventListener("change", e => {
    if (e.target.type === 'checkbox') {
        const dropdownScript = document.querySelector('script').getPlatformFunctions();
        
        // This function updates the global 'currentPlatforms' state
        dropdownScript.updateFilterDisplay();
        
        // Trigger a full re-render based on the new state
        render();
    }
});


//dropddown bs
/**
 * Platform Filter Dropdown Logic
 * This script initializes and controls the behavior of the platform filter dropdown.
 */
document.addEventListener('DOMContentLoaded', () => {
    const toggleButton = document.getElementById('platform-filter-btn');
    const dropdownContent = document.getElementById('platform-filter-content');

    // ====================================================================
    // >>> PLATFORM MAPPING DATA <<<
    // Maps display names to internal data keys for filtering.
    // ====================================================================
    const PLATFORM_MAPPING = [
        { display: "PC", key: "PSPC" },
        { display: "PS5", key: "PS5" },
        { display: "PS4", key: "PS4" },
        { display: "PS3", key: "PS3" },
        { display: "Vita", key: "PSVITA" },
    ];
    
    // Total count of individual platforms (excluding the 'All' checkbox)
    const totalPlatformsCount = PLATFORM_MAPPING.length;


    if (toggleButton && dropdownContent) {
        
        /**
         * Returns an array of the internal keys (the filter values) for all currently checked items.
         */
        function getSelectedPlatforms() {
            // Select all checked boxes that are NOT the 'All' checkbox
            const checked = dropdownContent.querySelectorAll('input[type="checkbox"][data-key]:checked');
            return Array.from(checked).map(cb => cb.dataset.key); 
        }

        /**
         * Updates the display text of the filter button and updates the global 'currentPlatforms'.
         */
        function updateFilterDisplay() {
            const selectedKeys = getSelectedPlatforms();
            const selectedCount = selectedKeys.length;
            
            const allCheckbox = dropdownContent.querySelector('input[data-all-toggle]');
            
            // 1. Update the state of the 'All' checkbox
            if (allCheckbox) {
                // If 0 or N platforms are checked, the 'All' box state needs to be updated.
                // We only check 'All' if the count matches the total number of platforms.
                allCheckbox.checked = selectedCount === totalPlatformsCount;
            }
            
            // 2. Update the button text & global state
            if (selectedCount === 0) {
                // Case: None selected.
                toggleButton.textContent = 'Platforms: None';
                currentPlatforms = []; 
            } else if (selectedCount === totalPlatformsCount) {
                // Case: All selected.
                toggleButton.textContent = 'Platforms: All';
                currentPlatforms = 'all'; 
            } else {
                // Case: Some selected (1 to N-1).
                const selectedDisplayNames = Array.from(dropdownContent.querySelectorAll('input[type="checkbox"][data-key]:checked')).map(cb => cb.dataset.display);
                
                if (selectedDisplayNames.length <= 3) {
                    toggleButton.textContent = `Platforms: ${selectedDisplayNames.join(', ')}`;
                } else {
                    toggleButton.textContent = `Platforms: ${selectedDisplayNames.length} selected`;
                }
                currentPlatforms = selectedKeys; // Set global to the array of selected keys
            }
        }
        
        /**
         * Handles the click on the 'All' checkbox, checking or unchecking all other boxes.
         */
        function handleAllToggle(isChecked) {
            const platformCheckboxes = dropdownContent.querySelectorAll('input[type="checkbox"][data-key]');
            
            platformCheckboxes.forEach(cb => {
                cb.checked = isChecked;
            });
            
            // Explicitly call update/render to ensure immediate state change and UI refresh
            updateFilterDisplay();
            render();
        }

        /**
         * Dynamically generates the checkboxes based on the PLATFORM_MAPPING.
         */
        function renderPlatformCheckboxes(platforms) {
            dropdownContent.innerHTML = ''; // Clear previous content

            const fragment = document.createDocumentFragment();
            
            // --- 1. Add 'All' Checkbox ---
            const allLabel = document.createElement('label');
            allLabel.classList.add('dropdown-all-option');
            
            const allCheckbox = document.createElement('input');
            allCheckbox.type = 'checkbox';
            allCheckbox.checked = true; // Default to checked
            allCheckbox.dataset.allToggle = 'true'; // Marker for the 'All' box
            allCheckbox.addEventListener('change', (event) => {
                handleAllToggle(event.target.checked);
            });

            allLabel.appendChild(allCheckbox);
            allLabel.appendChild(document.createTextNode(` All Platforms`));
            fragment.appendChild(allLabel);
            fragment.appendChild(document.createElement('hr'));

            // --- 2. Add Individual Platform Checkboxes ---
            platforms.forEach(platform => {
                const label = document.createElement('label');
                
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.dataset.key = platform.key; 
                checkbox.dataset.display = platform.display;
                
                checkbox.checked = true; // All are checked by default

                label.appendChild(checkbox);
                label.appendChild(document.createTextNode(` ${platform.display}`));

                fragment.appendChild(label);
            });

            dropdownContent.appendChild(fragment);
            
            updateFilterDisplay();
        }
        
        /**
         * Toggles the visibility and ARIA states of the platform filter dropdown.
         */
        function toggleDropdown() {
            const isExpanded = toggleButton.getAttribute('aria-expanded') === 'true';
            
            dropdownContent.classList.toggle('show'); 
            
            toggleButton.setAttribute('aria-expanded', String(!isExpanded));
            dropdownContent.setAttribute('aria-hidden', String(isExpanded));
        }
        
        // --- Initialization ---
        renderPlatformCheckboxes(PLATFORM_MAPPING);

        toggleButton.addEventListener('click', (event) => {
            event.stopPropagation();
            toggleDropdown();
        });

        document.addEventListener('click', (event) => {
            if (dropdownContent.classList.contains('show') && 
                !dropdownContent.contains(event.target) && 
                event.target !== toggleButton) {
                
                dropdownContent.classList.remove('show');
                toggleButton.setAttribute('aria-expanded', 'false');
                dropdownContent.setAttribute('aria-hidden', 'true');
            }
        });
        
        dropdownContent.addEventListener('click', (event) => {
            event.stopPropagation();
        });
        
        // --- Expose necessary functions globally for the UI Handler section ---
        document.querySelector('script').getPlatformFunctions = () => ({
            getSelectedPlatforms: getSelectedPlatforms,
            updateFilterDisplay: updateFilterDisplay,
        });
    } else {
        console.error("Platform filter elements not found. Ensure the HTML contains elements with IDs 'platform-filter-btn' and 'platform-filter-content'.");
    }
});


// Initial render call to display the library on page load
window.onload = render;