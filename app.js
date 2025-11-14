// --- Configuration and Global State ---

// FIX: Changed from a relative path to the absolute URL of the deployed Worker API
const API_BASE_URL = 'https://mehidistatics-api.ferhathamza17.workers.dev/api/v1'; 

// This simulates the user authentication ID provided by the environment
const userId = typeof __app_id !== 'undefined' ? `user-${__app_id}` : 'guest-user-1234'; 

// Global data stores (no more Firebase SDK required)
window.allMonthlyData = {}; 
window.DISEASES = []; 
window.LOCATIONS = []; 

const AGE_INTERVALS = [
    "0_1", "2_4", "5_9", "10_14", "15_19", "20_44", "45_64", "65_plus"
];

const REPORT_PERIODS = {
    // These will be defined in window.setupReportingFilters
    quarterly: [], semiannual: [], annual: [], monthly: [] 
};

// --- Utility Functions ---

/**
 * Generic helper to make API calls to the Worker
 */
async function makeApiCall(endpoint, method = 'GET', data = null) {
    // Construct the full URL using the absolute worker domain
    const url = `${API_BASE_URL}/user/${userId}${endpoint}`;
    const options = {
        method: method,
        headers: { 'Content-Type': 'application/json' },
    };
    if (data) {
        options.body = JSON.stringify(data);
    }
    
    try {
        const response = await fetch(url, options);
        return await response.json();
    } catch (error) {
        console.error("API Call Error:", error);
        document.getElementById('statusMessage').textContent = `API Error: ${error.message}. Check Worker deployment and URL: ${url}`;
        document.getElementById('statusMessage').className = "mb-4 p-3 rounded-lg text-sm bg-red-100 text-red-700";
        document.getElementById('statusMessage').style.display = 'block';
        return null;
    }
}


// --- Initialization ---

window.onload = async function() {
    document.getElementById('userIdDisplay').textContent = userId;
    const currentMonth = new Date().toISOString().substring(0, 7); // YYYY-MM
    document.getElementById('entryMonthSelect').value = currentMonth;
    
    // Start the app by loading the config
    await window.loadConfigAndRerender();
    
    // Set up initial event listeners
    document.getElementById('entryMonthSelect').addEventListener('change', () => window.listenForEntryDataChanges());
    document.getElementById('entryDiseaseSelect').addEventListener('change', () => window.listenForEntryDataChanges());

    // === FIX: Add event listeners for Admin buttons to ensure functionality ===
    // 1. Add Disease Button
    const addDiseaseBtn = document.getElementById('addDiseaseButton');
    if (addDiseaseBtn) addDiseaseBtn.addEventListener('click', window.addDisease);

    // 2. Add Location Button
    const addLocationBtn = document.getElementById('addLocationButton');
    if (addLocationBtn) addLocationBtn.addEventListener('click', window.addLocation);

    // 3. Commit Config Button
    const saveConfigBtn = document.getElementById('saveConfigButton');
    if (saveConfigBtn) saveConfigBtn.addEventListener('click', window.saveConfig);
    // =========================================================================
};

/**
 * Loads configuration lists (Diseases, Locations) from the Worker.
 */
window.loadConfigAndRerender = async function() {
    const result = await makeApiCall('/config');
    if (!result || result.error) return;

    const config = result.data;
    
    window.DISEASES = config.diseases || [];
    window.LOCATIONS = config.locations || [];

    console.log("Config loaded:", window.DISEASES.length, "diseases,", window.LOCATIONS.length, "locations.");

    // Re-render all parts of the UI that depend on these lists
    window.renderConfigLists();
    window.populateFilterDropdowns();
    window.renderEntryGrid();
    window.renderReportGrid();
    window.setupReportingFilters();
    window.listenForEntryDataChanges(); // Initial data load for entry view
};

/**
 * Switches between the Data Entry, Reporting, and Admin views.
 */
window.switchView = async function(view) {
    ['entry', 'reporting', 'admin'].forEach(v => {
        document.getElementById(`${v}View`).classList.add('hidden');
        document.getElementById(`${v}Tab`).classList.remove('tab-active');
        document.getElementById(`${v}Tab`).classList.add('tab-inactive');
    });

    document.getElementById(`${view}View`).classList.remove('hidden');
    document.getElementById(`${view}Tab`).classList.add('tab-active');
    document.getElementById(`${view}Tab`).classList.remove('tab-inactive');
    
    // Actions based on view switch
    if (view === 'entry') {
        await window.listenForEntryDataChanges();
    } else if (view === 'reporting') {
          await window.fetchAllMonthlyData();
    } else if (view === 'admin') {
        // Config is already loaded, just ensure it's rendered
        window.renderConfigLists();
    }
}

// --- DATA ENTRY VIEW LOGIC ---

/**
 * Fetches and displays the currently selected report data (for the ENTRY view).
 */
window.listenForEntryDataChanges = async function() {
    if (window.DISEASES.length === 0 || window.LOCATIONS.length === 0) {
        window.clearGridInputs();
        document.getElementById('statusMessage').textContent = "No Diseases or Locations defined. Use Admin Tools first.";
        document.getElementById('statusMessage').className = "mb-4 p-3 rounded-lg text-sm bg-yellow-100 text-yellow-700";
        document.getElementById('statusMessage').style.display = 'block';
        return;
    }
    
    const monthId = document.getElementById('entryMonthSelect').value; 
    const diseaseId = document.getElementById('entryDiseaseSelect').value;
    
    if (!monthId || !diseaseId) return;

    const endpoint = `/report/${diseaseId}/${monthId}`;
    const result = await makeApiCall(endpoint);

    if (!result || result.error) return;

    if (result.exists) {
        window.loadDataIntoGrid(result.data, 'dataGrid');
        document.getElementById('statusMessage').textContent = "Latest data loaded successfully for editing.";
        document.getElementById('statusMessage').className = "mb-4 p-3 rounded-lg text-sm bg-blue-100 text-blue-700";
        document.getElementById('statusMessage').style.display = 'block';
    } else {
        window.clearGridInputs();
        document.getElementById('statusMessage').textContent = "No saved data for this report. Enter counts below.";
        document.getElementById('statusMessage').className = "mb-4 p-3 rounded-lg text-sm bg-yellow-100 text-yellow-700";
        document.getElementById('statusMessage').style.display = 'block';
    }
}

/**
 * Handles the submission of the data to the Worker API.
 */
window.saveEntry = async function() {
    if (window.LOCATIONS.length === 0) {
          document.getElementById('statusMessage').textContent = "Cannot save: No locations defined. Use Admin Tools first.";
          document.getElementById('statusMessage').className = "mb-4 p-3 rounded-lg text-sm bg-red-100 text-red-700";
          return;
    }

    const monthId = document.getElementById('entryMonthSelect').value;
    const diseaseId = document.getElementById('entryDiseaseSelect').value;
    
    const payload = {
        monthId: monthId,
        disease: diseaseId,
        reporterId: userId,
        data: window.collectGridData()
    };

    const saveButton = document.getElementById('saveButton');
    saveButton.disabled = true;
    saveButton.textContent = "Saving...";

    try {
        const result = await makeApiCall('/report', 'POST', payload);
        if (result && result.success) {
            document.getElementById('statusMessage').textContent = `Report for ${diseaseId.replace(/_/g, ' ')} - ${monthId} saved successfully!`;
            document.getElementById('statusMessage').className = "mb-4 p-3 rounded-lg text-sm bg-green-100 text-green-700";
            window.fetchAllMonthlyData(); 
        } else {
            throw new Error(result ? result.error : "Unknown save error.");
        }
    } catch (e) {
        console.error("Error saving document: ", e);
        document.getElementById('statusMessage').textContent = `Error saving report: ${e.message}`;
        document.getElementById('statusMessage').className = "mb-4 p-3 rounded-lg text-sm bg-red-100 text-red-700";
    } finally {
        saveButton.disabled = false;
        saveButton.textContent = "Save Monthly Report";
    }
};

// --- REPORTING VIEW LOGIC ---

/**
 * Fetches all relevant monthly data for the reporting view and caches it from the Worker.
 */
window.fetchAllMonthlyData = async function() {
    document.getElementById('statusMessage').textContent = "Fetching all monthly data for aggregation from D1...";
    document.getElementById('statusMessage').className = "mb-4 p-3 rounded-lg text-sm bg-gray-200 text-gray-700";
    document.getElementById('statusMessage').style.display = 'block';
    
    const data = await makeApiCall('/reports');
    
    if (data && !data.error) {
        window.allMonthlyData = data;
        document.getElementById('statusMessage').textContent = `${Object.keys(window.allMonthlyData).length} monthly records cached for reporting.`;
        document.getElementById('statusMessage').className = "mb-4 p-3 rounded-lg text-sm bg-green-100 text-green-700";
        
        window.loadAggregatedReport(); // Refresh report with new data
    } else {
        window.allMonthlyData = {};
        document.getElementById('statusMessage').textContent = `Error fetching data for reports.`;
        document.getElementById('statusMessage').className = "mb-4 p-3 rounded-lg text-sm bg-red-100 text-red-700";
    }
}

// --- ADMIN TOOLS LOGIC ---

/**
 * Saves the current config (Diseases/Locations) back to the Worker API.
 */
window.saveConfig = async function() {
    const payload = {
        diseases: window.DISEASES,
        locations: window.LOCATIONS
    };

    const result = await makeApiCall('/config', 'POST', payload);

    if (result && result.success) {
        document.getElementById('statusMessage').textContent = "Configuration saved successfully.";
        document.getElementById('statusMessage').className = "mb-4 p-3 rounded-lg text-sm bg-green-100 text-green-700";
        // Re-render UI components dependent on the config
        window.renderConfigLists();
        window.populateFilterDropdowns();
        window.renderEntryGrid();
        window.renderReportGrid();
        window.listenForEntryDataChanges();
    } else {
        document.getElementById('statusMessage').textContent = `Error saving configuration: ${result ? result.details : 'Check worker logs.'}`;
        document.getElementById('statusMessage').className = "mb-4 p-3 rounded-lg text-sm bg-red-100 text-red-700";
    }
    document.getElementById('statusMessage').style.display = 'block';
}

/**
 * Renders the lists in the Admin View.
 */
window.renderConfigLists = function() {
    const diseaseListUl = document.getElementById('diseaseList');
    const locationListUl = document.getElementById('locationList');

    // Render Diseases
    diseaseListUl.innerHTML = window.DISEASES.map(d => `
        <li class="flex justify-between items-center p-2 bg-white rounded shadow-sm border border-yellow-300 text-yellow-900">
            <span class="truncate">${d}</span>
            <button onclick="deleteDisease('${d}')" class="text-red-500 hover:text-red-700 ml-4 font-bold">
                &times;
            </button>
        </li>
    `).join('');

    // Render Locations
    locationListUl.innerHTML = window.LOCATIONS.map(l => `
        <li class="flex justify-between items-center p-2 bg-white rounded shadow-sm border border-teal-300 text-teal-900">
            <span class="truncate">${l}</span>
            <button onclick="deleteLocation('${l}')" class="text-red-500 hover:text-red-700 ml-4 font-bold">
                &times;
            </button>
        </li>
    `).join('');
};

/**
 * Adds a new disease.
 */
window.addDisease = function() {
    const input = document.getElementById('newDiseaseInput');
    let name = input.value.trim();
    if (!name) return;
    
    // Clean up name and create ID
    const diseaseId = name.replace(/[^a-zA-Z0-9\s]/g, '').trim().replace(/\s+/g, '_');

    if (window.DISEASES.includes(diseaseId)) {
        // Use a standard non-alert message box for user feedback
        document.getElementById('statusMessage').textContent = "Disease already exists or generates a duplicate ID.";
        document.getElementById('statusMessage').className = "mb-4 p-3 rounded-lg text-sm bg-red-100 text-red-700";
        document.getElementById('statusMessage').style.display = 'block';
        return;
    }
    
    window.DISEASES.push(diseaseId);
    input.value = '';
    // We call saveConfig here to instantly update the backend and UI lists
    window.saveConfig();
};

/**
 * Deletes a disease.
 */
window.deleteDisease = function(id) {
    window.DISEASES = window.DISEASES.filter(d => d !== id);
    window.saveConfig();
};

/**
 * Adds a new location.
 */
window.addLocation = function() {
    const input = document.getElementById('newLocationInput');
    const name = input.value.trim();
    if (!name) return;

    if (!name.includes(':')) {
          document.getElementById('statusMessage').textContent = "Location must be in the format 'EPSP: Commune/Secteur'.";
          document.getElementById('statusMessage').className = "mb-4 p-3 rounded-lg text-sm bg-red-100 text-red-700";
          document.getElementById('statusMessage').style.display = 'block';
          return;
    }
    
    if (window.LOCATIONS.includes(name)) {
        document.getElementById('statusMessage').textContent = "Location already exists.";
        document.getElementById('statusMessage').className = "mb-4 p-3 rounded-lg text-sm bg-red-100 text-red-700";
        document.getElementById('statusMessage').style.display = 'block';
        return;
    }
    
    window.LOCATIONS.push(name);
    input.value = '';
    // We call saveConfig here to instantly update the backend and UI lists
    window.saveConfig();
};

/**
 * Deletes a location.
 */
window.deleteLocation = function(name) {
    window.LOCATIONS = window.LOCATIONS.filter(l => l !== name);
    window.saveConfig();
};

/**
 * Populates the Disease dropdowns in the Entry and Reporting views.
 */
window.populateFilterDropdowns = function() {
    const entrySelect = document.getElementById('entryDiseaseSelect');
    const reportSelect = document.getElementById('reportDiseaseSelect');

    // Helper to populate
    const populate = (select, includeAll) => {
        const currentVal = select.value;
        select.innerHTML = '';
        if (includeAll) {
            const allOption = document.createElement('option');
            allOption.value = 'all';
            allOption.textContent = 'All Diseases';
            select.appendChild(allOption);
        }
        window.DISEASES.forEach(d => {
            const option = document.createElement('option');
            option.value = d;
            option.textContent = d.replace(/_/g, ' ');
            select.appendChild(option);
        });
        // Restore selection if possible
        if (currentVal && Array.from(select.options).some(opt => opt.value === currentVal)) {
            select.value = currentVal;
        } else if (!includeAll && window.DISEASES.length > 0) {
              select.value = window.DISEASES[0];
        }
    };

    populate(entrySelect, false);
    populate(reportSelect, true);
};


// --- GRID RENDERING AND CALCULATION ---

window.setupReportingFilters = function() {
      const currentYear = new Date().getFullYear();
      const startYear = 2024; 
      
      const monthPeriods = [];
      for (let y = currentYear; y >= startYear; y--) {
          for (let m = 12; m >= 1; m--) {
              const monthStr = m.toString().padStart(2, '0');
              monthPeriods.push({
                  id: `${y}-${monthStr}`,
                  label: `${y}-${monthStr}`,
                  months: [monthStr]
              });
          }
      }
      REPORT_PERIODS.monthly = monthPeriods;
      REPORT_PERIODS.quarterly = [
          { id: "Q1", label: "Q1 (Jan-Mar)", months: ["01", "02", "03"] },
          { id: "Q2", label: "Q2 (Apr-Jun)", months: ["04", "05", "06"] },
          { id: "Q3", label: "Q3 (Jul-Sep)", months: ["07", "08", "09"] },
          { id: "Q4", label: "Q4 (Oct-Dec)", months: ["10", "11", "12"] }
      ];
      REPORT_PERIODS.semiannual = [
          { id: "S1", label: "S1 (Jan-Jun)", months: ["01", "02", "03", "04", "05", "06"] },
          { id: "S2", label: "S2 (Jul-Dec)", months: ["07", "08", "09", "10", "11", "12"] }
      ];
      REPORT_PERIODS.annual = [
          { id: "FULL", label: "Full Year", months: ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"] }
      ];
      
      updateReportFilters();
}

window.updateReportFilters = function() {
    const type = document.getElementById('reportTypeSelect').value;
    const periodSelect = document.getElementById('reportPeriodSelect');
    const currentYear = new Date().getFullYear();

    periodSelect.innerHTML = '';
    
    const periods = REPORT_PERIODS[type];
    
    if (type === 'monthly') {
          periods.forEach(p => {
              const option = document.createElement('option');
              option.value = p.id;
              option.textContent = p.label;
              periodSelect.appendChild(option);
          });
          periodSelect.value = document.getElementById('entryMonthSelect').value;
    } else {
          for (let y = currentYear; y >= 2024; y--) {
              periods.forEach(p => {
                  const option = document.createElement('option');
                  option.value = `${y}_${p.id}`;
                  option.textContent = `${y} - ${p.label}`;
                  periodSelect.appendChild(option);
              });
          }
    }
};

window.renderGridStructure = function(tableId, isInput = true) {
    const table = document.getElementById(tableId);
    if (!table) return;

    let html = '';

    if (window.LOCATIONS.length === 0) {
          table.innerHTML = `<tr><td colspan="${(AGE_INTERVALS.length * 2) + 3}" class="text-center p-8 text-gray-500">
            No locations defined. Please add locations in the Admin Tools section.
          </td></tr>`;
          return;
    }
    
    html += '<thead>';
    html += '<tr class="text-center">';
    html += '<th rowspan="2" class="sticky-col min-w-[200px] bg-gray-700">EPSP / COMMUNE</th>'; 

    AGE_INTERVALS.forEach(interval => {
        const label = interval.replace(/_/g, '-').replace('plus', '+');
        html += `<th colspan="2" class="header-bg-dark">${label}</th>`;
    });
    
    html += '<th colspan="2" class="bg-yellow-600 text-black">TOTAL</th>';
    html += '<th rowspan="2" class="bg-yellow-700 text-black min-w-[100px]">TOTAL GÉNÉRAL</th>';
    html += '</tr>';

    html += '<tr class="text-center">';
    AGE_INTERVALS.forEach(() => {
        html += '<th class="bg-gray-500 text-white">M</th><th class="bg-gray-500 text-white">F</th>';
    });
    html += '<th class="bg-yellow-600 text-black">M</th><th class="bg-yellow-600 text-black">F</th>';
    html += '</tr>';
    html += '</thead>';

    html += '<tbody>';
    window.LOCATIONS.forEach((location) => {
        const locationId = location.replace(/[^a-zA-Z0-9]/g, '_');
        html += `<tr id="row_${locationId}_${tableId}">`;
        html += `<td class="sticky-col text-sm border-r-2 border-gray-400">${location}</td>`; 

        AGE_INTERVALS.forEach(interval => {
            const keyM = `M_${interval}`;
            const keyF = `F_${interval}`;
            
            if (isInput) {
                html += `<td class="p-0"><input type="number" min="0" value="0" id="input_${locationId}_${keyM}" data-location="${locationId}" data-sex="M" data-interval="${interval}" class="data-input text-sm" oninput="window.calculateTotals('${tableId}')"></td>`;
                html += `<td class="p-0"><input type="number" min="0" value="0" id="input_${locationId}_${keyF}" data-location="${locationId}" data-sex="F" data-interval="${interval}" class="data-input text-sm" oninput="window.calculateTotals('${tableId}')"></td>`;
            } else {
                html += `<td id="report_${locationId}_${keyM}" class="text-center text-sm p-2">0</td>`;
                html += `<td id="report_${locationId}_${keyF}" class="text-center text-sm p-2">0</td>`;
            }
        });

        html += `<td id="row_total_M_${locationId}_${tableId}" class="total-cell text-sm min-w-[50px]">0</td>`;
        html += `<td id="row_total_F_${locationId}_${tableId}" class="total-cell text-sm min-w-[50px]">0</td>`;
        html += `<td id="row_total_G_${locationId}_${tableId}" class="total-cell text-sm min-w-[100px] border-l-2 border-gray-400">0</td>`;

        html += `</tr>`;
    });
    html += '</tbody>';

    html += '<tfoot>';
    html += '<tr class="bg-yellow-500 font-bold">';
    html += `<td class="sticky-col bg-yellow-500 text-black text-center text-base border-r-2 border-gray-400">TOTAL</td>`;

    AGE_INTERVALS.forEach(interval => {
        html += `<td id="col_total_M_${interval}_${tableId}" class="total-cell bg-yellow-500">0</td>`;
        html += `<td id="col_total_F_${interval}_${tableId}" class="total-cell bg-yellow-500">0</td>`;
    });
    
    html += `<td id="grand_total_M_${tableId}" class="total-cell bg-yellow-600 text-black">0</td>`;
    html += `<td id="grand_total_F_${tableId}" class="total-cell bg-yellow-600 text-black">0</td>`;
    html += `<td id="grand_total_G_${tableId}" class="total-cell bg-yellow-700 text-black text-xl border-l-2 border-gray-400">0</td>`;

    html += '</tr>';
    html += '</tfoot>';

    table.innerHTML = html;
};

window.renderEntryGrid = function() {
    window.renderGridStructure('dataGrid', true);
    window.calculateTotals('dataGrid');
};

window.renderReportGrid = function() {
    window.renderGridStructure('reportGrid', false);
    window.calculateTotals('reportGrid');
};

window.clearGridInputs = function() {
    document.querySelectorAll('#dataGrid .data-input').forEach(input => {
        input.value = 0;
    });
    window.calculateTotals('dataGrid');
};

window.loadDataIntoGrid = function(data, tableId) {
    const isInput = tableId === 'dataGrid';
    
    if (isInput) {
        window.clearGridInputs();
    } else {
          document.querySelectorAll('#reportGrid td').forEach(td => {
            if (!td.classList.contains('sticky-col') && !td.classList.contains('total-cell')) {
                td.textContent = '0';
            }
          });
    }
    
    if (!data) return;
    
    window.LOCATIONS.forEach(location => {
        const locationKey = location.replace(/[^a-zA-Z0-9]/g, '_');
        const locationData = data[locationKey];
        
        if (locationData) {
            for (const key in locationData) {
                const value = parseInt(locationData[key] || 0, 10);
                const safeValue = isNaN(value) ? 0 : value;

                if (isInput) {
                    const inputElement = document.getElementById(`input_${locationKey}_${key}`);
                    if (inputElement) inputElement.value = safeValue;
                } else {
                    const cellElement = document.getElementById(`report_${locationKey}_${key}`);
                    if (cellElement) cellElement.textContent = safeValue;
                }
            }
        }
    });
    window.calculateTotals(tableId); 
};

window.calculateTotals = function(tableId) {
    const isInput = tableId === 'dataGrid';
    let grandTotalM = 0;
    let grandTotalF = 0;

    const colTotals = { M: {}, F: {} };
    AGE_INTERVALS.forEach(int => { colTotals.M[int] = 0; colTotals.F[int] = 0; });

    window.LOCATIONS.forEach(location => {
        const locationId = location.replace(/[^a-zA-Z0-9]/g, '_');
        let rowTotalM = 0;
        let rowTotalF = 0;

        AGE_INTERVALS.forEach(interval => {
            const keyM = `M_${interval}`;
            const keyF = `F_${interval}`;
            
            let mCount = 0;
            let fCount = 0;

            if (isInput) {
                const mInput = document.getElementById(`input_${locationId}_${keyM}`);
                const fInput = document.getElementById(`input_${locationId}_${keyF}`);
                mCount = parseInt(mInput ? mInput.value : 0) || 0;
                fCount = parseInt(fInput ? fInput.value : 0) || 0;
            } else {
                const mCell = document.getElementById(`report_${locationId}_${keyM}`);
                const fCell = document.getElementById(`report_${locationId}_${keyF}`);
                mCount = parseInt(mCell ? mCell.textContent : 0) || 0;
                fCount = parseInt(fCell ? fCell.textContent : 0) || 0;
            }

            rowTotalM += mCount;
            rowTotalF += fCount;

            colTotals.M[interval] += mCount;
            colTotals.F[interval] += fCount;
        });

        const rowTotalMEl = document.getElementById(`row_total_M_${locationId}_${tableId}`);
        const rowTotalFEl = document.getElementById(`row_total_F_${locationId}_${tableId}`);
        const rowTotalGEl = document.getElementById(`row_total_G_${locationId}_${tableId}`);

        if (rowTotalMEl) rowTotalMEl.textContent = rowTotalM;
        if (rowTotalFEl) rowTotalFEl.textContent = rowTotalF;
        if (rowTotalGEl) rowTotalGEl.textContent = rowTotalM + rowTotalF;

        grandTotalM += rowTotalM;
        grandTotalF += rowTotalF;
    });

    AGE_INTERVALS.forEach(interval => {
        const colTotalMEl = document.getElementById(`col_total_M_${interval}_${tableId}`);
        const colTotalFEl = document.getElementById(`col_total_F_${interval}_${tableId}`);
        if (colTotalMEl) colTotalMEl.textContent = colTotals.M[interval];
        if (colTotalFEl) colTotalFEl.textContent = colTotals.F[interval];
    });

    const grandTotalMEl = document.getElementById(`grand_total_M_${tableId}`);
    const grandTotalFEl = document.getElementById(`grand_total_F_${tableId}`);
    const grandTotalGEl = document.getElementById(`grand_total_G_${tableId}`);

    if (grandTotalMEl) grandTotalMEl.textContent = grandTotalM;
    if (grandTotalFEl) grandTotalFEl.textContent = grandTotalF;
    if (grandTotalGEl) grandTotalGEl.textContent = grandTotalM + grandTotalF;
    
    if (tableId === 'reportGrid') {
        document.getElementById('reportTotalCount').textContent = `Report Total: ${grandTotalM + grandTotalF} Cases`;
    }
};

window.collectGridData = function() {
    const data = {};
    
    window.LOCATIONS.forEach(location => {
        const locationId = location.replace(/[^a-zA-Z0-9]/g, '_');
        data[locationId] = {};
        
        AGE_INTERVALS.forEach(interval => {
            const keyM = `M_${interval}`;
            const keyF = `F_${interval}`;
            const mInput = document.getElementById(`input_${locationId}_${keyM}`);
            const fInput = document.getElementById(`input_${locationId}_${keyF}`);
            
            const mCount = parseInt(mInput ? mInput.value : 0) || 0;
            const fCount = parseInt(fInput ? fInput.value : 0) || 0;
            
            data[locationId][keyM] = mCount;
            data[locationId][keyF] = fCount;
        });
    });
    return data;
};

window.loadAggregatedReport = async function() {
    const reportType = document.getElementById('reportTypeSelect').value;
    const periodValue = document.getElementById('reportPeriodSelect').value;
    const diseaseFilter = document.getElementById('reportDiseaseSelect').value;
    
    if (window.LOCATIONS.length === 0) {
          document.getElementById('reportGrid').innerHTML = `<tr><td colspan="${(AGE_INTERVALS.length * 2) + 3}" class="text-center p-8 text-gray-500">
            Cannot generate report: No locations defined.
          </td></tr>`;
          document.getElementById('reportTotalCount').textContent = "";
          return;
    }
    
    const { fullMonthStrings, year } = getAggregationMonths(reportType, periodValue);
    
    if (fullMonthStrings.length === 0) {
          document.getElementById('statusMessage').textContent = "Please select a valid period.";
          document.getElementById('statusMessage').className = "mb-4 p-3 rounded-lg text-sm bg-yellow-100 text-yellow-700";
          return;
    }
    
    const aggregatedData = aggregateData(fullMonthStrings, year, diseaseFilter);
    window.loadDataIntoGrid(aggregatedData, 'reportGrid');
    
    document.getElementById('statusMessage').textContent = `Report loaded for ${diseaseFilter.replace(/_/g, ' ')} for ${periodValue.replace(/_/g, ' - ')}.`;
    document.getElementById('statusMessage').className = "mb-4 p-3 rounded-lg text-sm bg-blue-100 text-blue-700";
};

function getAggregationMonths(type, periodValue) {
      const [yearStr, periodId] = periodValue.split('_');
      const year = yearStr || periodValue.substring(0, 4); 
      
      let monthsToAggregate = [];
      
      if (type === 'monthly') {
          monthsToAggregate = [periodValue.substring(5, 7)];
      } else {
          const periods = REPORT_PERIODS[type].find(p => p.id === periodId);
          if (periods) {
              monthsToAggregate = periods.months;
          }
      }
      
      const fullMonthStrings = monthsToAggregate.map(m => `${year}-${m}`);

      return { fullMonthStrings, year: year };
}

function aggregateData(fullMonthStrings, year, diseaseFilter) {
    const aggregated = {};
    
    window.LOCATIONS.forEach(location => {
        const locationId = location.replace(/[^a-zA-Z0-9]/g, '_');
        aggregated[locationId] = {};
        AGE_INTERVALS.forEach(interval => {
            aggregated[locationId][`M_${interval}`] = 0;
            aggregated[locationId][`F_${interval}`] = 0;
        });
    });
    
    Object.values(window.allMonthlyData).forEach(monthlyReport => {
        const monthYear = monthlyReport.monthId;
        const disease = monthlyReport.disease;
        
        if (fullMonthStrings.includes(monthYear) && 
            (diseaseFilter === 'all' || disease === diseaseFilter)) {
                
            const reportData = monthlyReport.data;
            
            window.LOCATIONS.forEach(location => {
                const locationId = location.replace(/[^a-zA-Z0-9]/g, '_');
                const locData = reportData[locationId];
                
                if (locData) {
                    AGE_INTERVALS.forEach(interval => {
                        const keyM = `M_${interval}`;
                        const keyF = `F_${interval}`;
                        
                        aggregated[locationId][keyM] += locData[keyM] || 0;
                        aggregated[locationId][keyF] += locData[keyF] || 0;
                    });
                }
            });
        }
    });
    
    return aggregated;
}
