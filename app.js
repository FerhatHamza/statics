// --- Configuration and Global State ---

const API_BASE_URL = 'https://mehidistatics-api.ferhathamza17.workers.dev/api/v1'; 
const userId = typeof __app_id !== 'undefined' ? `user-${__app_id}` : 'guest-user-1234'; 

// Global data stores
window.allMonthlyData = {}; 
window.DISEASES = []; 
window.LOCATIONS = []; 
window.selectedFilters = {
    disease: [],
    location: [],
    interval: []
};

const AGE_INTERVALS = [
    "0_1", "2_4", "5_9", "10_14", "15_19", "20_44", "45_64", "65_plus"
];

// Configuration for report periods
const REPORT_PERIODS = {
    quarterly: [], semiannual: [], annual: [], monthly: [] 
};

// --- Utility Functions ---

/**
 * Generic helper to make API calls to the Worker
 */
async function makeApiCall(endpoint, method = 'GET', data = null) {
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
    
    await window.loadConfigAndRerender();
    
    // Set up initial event listeners for Data Entry
    document.getElementById('entryMonthSelect').addEventListener('change', () => window.listenForEntryDataChanges());
    document.getElementById('entryDiseaseSelect').addEventListener('change', () => window.listenForEntryDataChanges());
    document.getElementById('saveButton').addEventListener('click', window.saveEntry);
    
    // Add event listeners for Reporting Filters 
    const reportTypeSelect = document.getElementById('reportTypeSelect');
    const reportPeriodSelect = document.getElementById('reportPeriodSelect');

    // Changing Report Type updates periods and triggers new report load
    if (reportTypeSelect) reportTypeSelect.addEventListener('change', () => { 
        window.updateReportFilters(); 
        window.loadAggregatedReport();
    });
    
    // Changing Period triggers report load
    if (reportPeriodSelect) reportPeriodSelect.addEventListener('change', window.loadAggregatedReport);

    // === Admin event listeners ===
    const addDiseaseBtn = document.getElementById('addDiseaseButton');
    if (addDiseaseBtn) addDiseaseBtn.addEventListener('click', window.addDisease);

    const addLocationBtn = document.getElementById('addLocationButton');
    if (addLocationBtn) addLocationBtn.addEventListener('click', window.addLocation);

    const saveConfigBtn = document.getElementById('saveConfigButton');
    if (saveConfigBtn) saveConfigBtn.addEventListener('click', window.saveConfig);
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

    // Re-render all parts of the UI that depend on these lists
    window.renderConfigLists();
    window.populateFilterDropdowns(true); // Populate all dropdowns
    window.renderEntryGrid();
    window.renderReportGrid();
    window.setupReportingFilters(); // Initialize periods and new tag filters
    window.listenForEntryDataChanges(); // Initial data load for entry view
};

/**
 * Switches between the Data Entry, Reporting, and Admin views.
 */
window.switchView = async function(view) {
    // Hide all views and mark tabs inactive
    ['entry', 'reporting', 'admin'].forEach(v => {
        document.getElementById(`${v}View`).classList.add('hidden');
        document.getElementById(`${v}Tab`).classList.remove('tab-active');
        document.getElementById(`${v}Tab`).classList.add('tab-inactive');
    });

    // Show the selected view and mark its tab active
    document.getElementById(`${view}View`).classList.remove('hidden');
    document.getElementById(`${view}Tab`).classList.add('tab-active');
    document.getElementById(`${view}Tab`).classList.remove('tab-inactive');
    
    // Actions based on view switch
    if (view === 'entry') {
        await window.listenForEntryDataChanges();
    } else if (view === 'reporting') {
        await window.fetchAllMonthlyData();
        window.updateReportFilters();
        window.loadAggregatedReport();
    } else if (view === 'admin') {
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
        
    } else {
        window.allMonthlyData = {};
        document.getElementById('statusMessage').textContent = `Error fetching data for reports.`;
        document.getElementById('statusMessage').className = "mb-4 p-3 rounded-lg text-sm bg-red-100 text-red-700";
    }
}

/**
 * Defines the available report periods (Q1, S1, etc.) for aggregation and initializes tag filters.
 */
window.setupReportingFilters = function() {
      const currentYear = new Date().getFullYear();
      const startYear = 2024; 
      
      const monthPeriods = [];
      // CORRECTED: Monthly periods loop to create YYYY-MM IDs
      for (let y = currentYear; y >= startYear; y--) {
          for (let m = 12; m >= 1; m--) {
              const monthStr = m.toString().padStart(2, '0');
              const monthId = `${y}-${monthStr}`;
              monthPeriods.push({ id: monthId, label: monthId, months: [monthStr] });
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
      
      window.updateReportFilters();
      window.initializeReportFilters();
}

/**
 * Initializes all report filter tags to 'select all' and renders the initial tags.
 */
window.initializeReportFilters = function() {
    // 1. Initialize Disease Filter (All selected by default)
    window.selectedFilters.disease = window.DISEASES.map(d => ({
        value: d,
        text: d.replace(/_/g, ' ')
    }));

    // 2. Initialize Location Filter (All selected by default)
    window.selectedFilters.location = window.LOCATIONS.map(loc => ({
        value: loc.replace(/[^a-zA-Z0-9]/g, '_'),
        text: loc
    }));

    // 3. Initialize Interval Filter (All selected by default)
    window.selectedFilters.interval = AGE_INTERVALS.map(int => ({
        value: int,
        text: int.replace(/_/g, '-').replace('plus', '+')
    }));

    window.renderFilterTags('disease');
    window.renderFilterTags('location');
    window.renderFilterTags('interval');
    
    // Set initial button text
    document.getElementById('diseaseSelectAllBtn').textContent = "Deselect All";
    document.getElementById('locationSelectAllBtn').textContent = "Deselect All";
    document.getElementById('intervalSelectAllBtn').textContent = "Deselect All";
}

/**
 * Adds a selected item from the dropdown to the active filters.
 */
window.addFilterTag = function(filterType) {
    const select = document.getElementById(`${filterType}AddSelect`);
    const value = select.value;
    const text = select.options[select.selectedIndex].text;
    
    if (value && !window.selectedFilters[filterType].some(f => f.value === value)) {
        window.selectedFilters[filterType].push({ value, text });
        window.renderFilterTags(filterType);
        window.loadAggregatedReport();
    }
}

/**
 * Removes a tag from the active filters.
 */
window.removeFilterTag = function(filterType, value) {
    window.selectedFilters[filterType] = window.selectedFilters[filterType].filter(f => f.value !== value);
    window.renderFilterTags(filterType);
    window.loadAggregatedReport();
}

/**
 * Renders the filter tags (pills) for a given filter type.
 */
window.renderFilterTags = function(filterType) {
    const container = document.getElementById(`report${filterType.charAt(0).toUpperCase() + filterType.slice(1)}_tagsContainer`);
    if (!container) return;
    
    container.innerHTML = window.selectedFilters[filterType].map(f => `
        <span class="filter-tag" data-value="${f.value}">
            ${f.text}
            <button class="tag-remove-btn" onclick="window.removeFilterTag('${filterType}', '${f.value}')">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
                </svg>
            </button>
        </span>
    `).join('');

    // Update the "Select All" button text
    const button = document.getElementById(`${filterType}SelectAllBtn`);
    let allCount = 0;
    if (filterType === 'disease') allCount = window.DISEASES.length;
    else if (filterType === 'location') allCount = window.LOCATIONS.length;
    else if (filterType === 'interval') allCount = AGE_INTERVALS.length;

    if (button) {
        if (window.selectedFilters[filterType].length === allCount) {
            button.textContent = "Deselect All";
        } else {
            button.textContent = "Select All";
        }
    }
}

/**
 * Toggles selection of all available items for a filter type.
 */
window.toggleSelectAll = function(filterType) {
    const button = document.getElementById(`${filterType}SelectAllBtn`);
    let allItems = [];
    
    if (filterType === 'disease') {
        allItems = window.DISEASES.map(d => ({ value: d, text: d.replace(/_/g, ' ') }));
    } else if (filterType === 'location') {
        allItems = window.LOCATIONS.map(loc => ({
            value: loc.replace(/[^a-zA-Z0-9]/g, '_'),
            text: loc
        }));
    } else if (filterType === 'interval') {
        allItems = AGE_INTERVALS.map(int => ({
            value: int,
            text: int.replace(/_/g, '-').replace('plus', '+')
        }));
    }

    if (window.selectedFilters[filterType].length === allItems.length) {
        // Currently all selected -> deselect all
        window.selectedFilters[filterType] = [];
    } else {
        // Currently not all selected -> select all
        window.selectedFilters[filterType] = allItems;
    }

    window.renderFilterTags(filterType);
    window.loadAggregatedReport();
}

/**
 * Updates the Period dropdown based on the selected Report Type.
 */
window.updateReportFilters = function() {
    const reportTypeSelect = document.getElementById('reportTypeSelect');
    const periodSelect = document.getElementById('reportPeriodSelect');

    if (!reportTypeSelect || !periodSelect) return; 

    let type = reportTypeSelect.value;
    if (!type || type === '') {
        type = 'monthly';
        reportTypeSelect.value = type; 
    }
    
    const currentYear = new Date().getFullYear();

    periodSelect.innerHTML = '';
    
    const periods = REPORT_PERIODS[type];
    if (!periods) return;

    if (type === 'monthly') {
          // Monthly periods are already year-month formatted (YYYY-MM)
          periods.forEach(p => {
              const option = document.createElement('option');
              option.value = p.id;
              option.textContent = p.label;
              periodSelect.appendChild(option);
          });
          // Default to the current month if available
          const currentMonthValue = document.getElementById('entryMonthSelect').value;
          if (Array.from(periodSelect.options).some(opt => opt.value === currentMonthValue)) {
            periodSelect.value = currentMonthValue;
          } else if (periodSelect.options.length > 0) {
            periodSelect.value = periodSelect.options[0].value;
          }

    } else {
          // Quarterly, Semi-Annual, Annual periods are prefixed by year (YYYY_Q1)
          for (let y = currentYear; y >= 2024; y--) {
              periods.forEach(p => {
                  const option = document.createElement('option');
                  option.value = `${y}_${p.id}`;
                  option.textContent = `${y} - ${p.label}`;
                  periodSelect.appendChild(option);
              });
          }
          // Default to the latest period in the list
          if (periodSelect.options.length > 0) {
              periodSelect.value = periodSelect.options[0].value;
          }
    }
};

/**
 * Loads the aggregated report based on current filter selections.
 */
window.loadAggregatedReport = async function() {
    const reportType = document.getElementById('reportTypeSelect').value;
    const periodValue = document.getElementById('reportPeriodSelect').value;
    
    // Get selected filters from the global state
    const selectedDiseases = window.selectedFilters.disease.map(f => f.value);
    const selectedLocations = window.selectedFilters.location.map(f => f.value);
    const selectedIntervals = window.selectedFilters.interval.map(f => f.value);
    
    // Check if essential filters are empty
    if (selectedDiseases.length === 0 || selectedLocations.length === 0 || selectedIntervals.length === 0) {
        document.getElementById('statusMessage').textContent = "Please select at least one Disease, Location, and Age Interval.";
        document.getElementById('statusMessage').className = "mb-4 p-3 rounded-lg text-sm bg-yellow-100 text-yellow-700";
        document.getElementById('reportTotalCount').textContent = "Report Total: 0 Cases";
        document.getElementById('reportCharts').innerHTML = '<p class="text-center text-gray-500 py-8 font-semibold w-full">Select filters to generate report.</p>';
        window.filterAndRenderGrid({}, selectedLocations, selectedIntervals, 'reportGrid'); 
        return;
    }
    
    const { fullMonthStrings, year } = getAggregationMonths(reportType, periodValue);
    
    // 1. Aggregate data based on Time Period and Diseases
    // NOTE: This now aggregates all selected diseases into a single report structure
    const aggregatedData = aggregateData(fullMonthStrings, year, selectedDiseases);

    // 2. Filter and Render the Grid based on selected Locations and Intervals
    window.filterAndRenderGrid(aggregatedData, selectedLocations, selectedIntervals, 'reportGrid');
    
    // 3. Render charts (updated to use Grouped Bar)
    window.renderCharts(aggregatedData, selectedLocations, selectedIntervals, selectedDiseases, periodValue);

    document.getElementById('statusMessage').textContent = `Report loaded for ${periodValue.replace(/_/g, ' - ')}.`;
    document.getElementById('statusMessage').className = "mb-4 p-3 rounded-lg text-sm bg-blue-100 text-blue-700";
};


// --- Core Aggregation and Filtering Logic ---

function getAggregationMonths(type, periodValue) {
      const year = periodValue.substring(0, 4); 
      let monthsToAggregate = [];
      
      if (type === 'monthly') {
          // If monthly, the periodValue is 'YYYY-MM', and we just need the 'MM'
          monthsToAggregate = [periodValue.substring(5, 7)]; 
      } else {
          // For Q, S, or Annual, find the months based on the period ID (e.g., Q1)
          const periodId = periodValue.split('_')[1];
          const periods = REPORT_PERIODS[type];
          const periodsConfig = periods ? periods.find(p => p.id === periodId) : null;

          if (periodsConfig) {
              monthsToAggregate = periodsConfig.months;
          }
      }
      
      const fullMonthStrings = monthsToAggregate.map(m => `${year}-${m}`);

      return { fullMonthStrings, year: year };
}

/**
 * Aggregates monthly data for the selected time period and diseases.
 * NOTE: This function only aggregates across time/diseases, it DOES NOT filter by Location or Interval.
 */
function aggregateData(fullMonthStrings, year, selectedDiseases) {
    const aggregated = {};
    
    // Initialize aggregated structure for ALL locations/intervals
    window.LOCATIONS.forEach(location => {
        const locationId = location.replace(/[^a-zA-Z0-9]/g, '_');
        aggregated[locationId] = {};
        AGE_INTERVALS.forEach(interval => {
            aggregated[locationId][`M_${interval}`] = 0;
            aggregated[locationId][`F_${interval}`] = 0;
        });
    });
    
    // Sum data from all matching monthly reports
    Object.values(window.allMonthlyData).forEach(monthlyReport => {
        const monthYear = monthlyReport.monthId;
        const disease = monthlyReport.disease;
        
        // Filter by time period (monthlyReport.monthId) and selected diseases
        if (fullMonthStrings.includes(monthYear) && selectedDiseases.includes(disease)) {
                
            const reportData = monthlyReport.data;
            
            window.LOCATIONS.forEach(location => {
                const locationId = location.replace(/[^a-zA-Z0-9]/g, '_');
                const locData = reportData[locationId];
                
                if (locData) {
                    AGE_INTERVALS.forEach(interval => {
                        const keyM = `M_${interval}`;
                        const keyF = `F_${interval}`;
                        
                        // Ensure we only sum existing keys
                        if (locData.hasOwnProperty(keyM)) {
                            aggregated[locationId][keyM] += locData[keyM] || 0;
                        }
                        if (locData.hasOwnProperty(keyF)) {
                            aggregated[locationId][keyF] += locData[keyF] || 0;
                        }
                    });
                }
            });
        }
    });
    
    return aggregated;
}

/**
 * Filters and renders the report grid based on selected Locations and Intervals.
 */
window.filterAndRenderGrid = function(data, selectedLocations, selectedIntervals, tableId) {
    const table = document.getElementById(tableId);
    if (!table) return;

    let html = '';
    
    // Map full location names back from their IDs to preserve the correct display string
    const filteredLocations = window.LOCATIONS.filter(loc => selectedLocations.includes(loc.replace(/[^a-zA-Z0-9]/g, '_')));
    const filteredIntervals = AGE_INTERVALS.filter(int => selectedIntervals.includes(int));
    
    // Safety check
    if (filteredLocations.length === 0 || filteredIntervals.length === 0) {
        table.innerHTML = `<thead><tr><td colspan="${(AGE_INTERVALS.length * 2) + 3}" class="text-center p-8 text-gray-500">
            No data structure to display. Adjust filter selections.
        </td></tr></thead>`;
        window.calculateTotals(tableId, [], []); // Clear totals
        return;
    }
    
    // --- Header Generation (Only for selected intervals) ---
    html += '<thead>';
    html += '<tr class="text-center">';
    html += '<th rowspan="2" class="sticky-col min-w-[200px] bg-gray-700">EPSP / COMMUNE</th>'; 

    filteredIntervals.forEach(interval => {
        const label = interval.replace(/_/g, '-').replace('plus', '+');
        html += `<th colspan="2" class="header-bg-dark">${label}</th>`;
    });
    
    html += '<th colspan="2" class="bg-yellow-600 text-black">TOTAL</th>';
    html += '<th rowspan="2" class="bg-yellow-700 text-black min-w-[100px] border-l-2 border-gray-400">TOTAL GÉNÉRAL</th>';
    html += '</tr>';

    html += '<tr class="text-center">';
    filteredIntervals.forEach(() => {
        html += '<th class="bg-gray-500 text-white">M</th><th class="bg-gray-500 text-white">F</th>';
    });
    html += '<th class="bg-yellow-600 text-black">M</th><th class="bg-yellow-600 text-black">F</th>';
    html += '</tr>';
    html += '</thead>';

    // --- Body Generation (Only for selected locations) ---
    html += '<tbody>';
    filteredLocations.forEach((location) => {
        const locationId = location.replace(/[^a-zA-Z0-9]/g, '_');
        html += `<tr id="row_${locationId}_${tableId}">`;
        html += `<td class="sticky-col text-sm border-r-2 border-gray-400">${location}</td>`; 

        filteredIntervals.forEach(interval => {
            const keyM = `M_${interval}`;
            const keyF = `F_${interval}`;
            
            // Get data from the pre-aggregated 'data' object
            const mCount = data[locationId]?.[keyM] || 0;
            const fCount = data[locationId]?.[keyF] || 0;
            
            // Rendered cells for reporting
            html += `<td id="report_${locationId}_${keyM}" class="text-center text-sm p-2">${mCount}</td>`;
            html += `<td id="report_${locationId}_${keyF}" class="text-center text-sm p-2">${fCount}</td>`;
        });

        // Row Totals placeholders
        html += `<td id="row_total_M_${locationId}_${tableId}" class="total-cell text-sm min-w-[50px] font-bold">0</td>`;
        html += `<td id="row_total_F_${locationId}_${tableId}" class="total-cell text-sm min-w-[50px] font-bold">0</td>`;
        html += `<td id="row_total_G_${locationId}_${tableId}" class="total-cell text-sm min-w-[100px] border-l-2 border-gray-400 font-extrabold">0</td>`;

        html += '</tr>';
    });
    html += '</tbody>';

    // --- Footer Generation (Only for selected intervals) ---
    html += '<tfoot>';
    html += '<tr class="bg-yellow-500 font-bold">';
    html += `<td class="sticky-col bg-yellow-500 text-black text-center text-base border-r-2 border-gray-400">TOTAL</td>`;

    filteredIntervals.forEach(interval => {
        // Column totals placeholders
        html += `<td id="col_total_M_${interval}_${tableId}" class="total-cell bg-yellow-500 text-black">0</td>`;
        html += `<td id="col_total_F_${interval}_${tableId}" class="total-cell bg-yellow-500 text-black">0</td>`;
    });
    
    html += `<td id="grand_total_M_${tableId}" class="total-cell bg-yellow-600 text-black text-lg">0</td>`;
    html += `<td id="grand_total_F_${tableId}" class="total-cell bg-yellow-600 text-black text-lg">0</td>`;
    html += `<td id="grand_total_G_${tableId}" class="total-cell bg-yellow-700 text-black text-xl border-l-2 border-gray-400">0</td>`;

    html += '</tr>';
    html += '</tfoot>';

    table.innerHTML = html;
    
    // Calculate final totals based on the visible/filtered data
    window.calculateTotals(tableId, filteredLocations, filteredIntervals);
};

// **CRITICAL UPDATE** to calculateTotals to use filtered lists (only affects reportGrid)
window.calculateTotals = function(tableId, locationsList = window.LOCATIONS, intervalsList = AGE_INTERVALS) {
    const isInput = tableId === 'dataGrid';
    let grandTotalM = 0;
    let grandTotalF = 0;

    const colTotals = { M: {}, F: {} };
    intervalsList.forEach(int => { colTotals.M[int] = 0; colTotals.F[int] = 0; });

    // Loop through the PROVIDED locationsList (either all for entry, or filtered for report)
    locationsList.forEach(location => {
        const locationId = location.replace(/[^a-zA-Z0-9]/g, '_');
        let rowTotalM = 0;
        let rowTotalF = 0;

        // Loop through the PROVIDED intervalsList 
        intervalsList.forEach(interval => {
            const keyM = `M_${interval}`;
            const keyF = `F_${interval}`;
            
            let mCount = 0;
            let fCount = 0;

            if (isInput) {
                // For dataGrid, check ALL existing input fields regardless of reporting filters
                const mInput = document.getElementById(`input_${locationId}_${keyM}`);
                const fInput = document.getElementById(`input_${locationId}_${keyF}`);
                mCount = parseInt(mInput ? mInput.value : 0) || 0;
                fCount = parseInt(fInput ? fInput.value : 0) || 0;
            } else {
                // For reportGrid, check only the cells that were rendered
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

        // Update Row Totals
        const rowTotalMEl = document.getElementById(`row_total_M_${locationId}_${tableId}`);
        const rowTotalFEl = document.getElementById(`row_total_F_${locationId}_${tableId}`);
        const rowTotalGEl = document.getElementById(`row_total_G_${locationId}_${tableId}`);

        if (rowTotalMEl) rowTotalMEl.textContent = rowTotalM;
        if (rowTotalFEl) rowTotalFEl.textContent = rowTotalF;
        if (rowTotalGEl) rowTotalGEl.textContent = rowTotalM + rowTotalF;

        grandTotalM += rowTotalM;
        grandTotalF += rowTotalF;
    });

    // Populate column totals based on the filtered intervals
    intervalsList.forEach(interval => {
        const colTotalMEl = document.getElementById(`col_total_M_${interval}_${tableId}`);
        const colTotalFEl = document.getElementById(`col_total_F_${interval}_${tableId}`);
        if (colTotalMEl) colTotalMEl.textContent = colTotals.M[interval];
        if (colTotalFEl) colTotalFEl.textContent = colTotals.F[interval];
    });

    // Populate Grand Totals
    const grandTotalMEl = document.getElementById(`grand_total_M_${tableId}`);
    const grandTotalFEl = document.getElementById(`grand_total_F_${tableId}`);
    const grandTotalGEl = document.getElementById(`grand_total_G_${tableId}`);

    if (grandTotalMEl) grandTotalMEl.textContent = grandTotalM;
    if (grandTotalFEl) grandTotalFEl.textContent = grandTotalF;
    if (grandTotalGEl) grandTotalGEl.textContent = grandTotalM + grandTotalF;
};


// --- Revised Chart Rendering Logic (Grouped Bar Chart) ---

window.renderCharts = function(aggregatedData, selectedLocations, selectedIntervals, selectedDiseases, periodValue) {
    const chartContainer = d3.select('#reportCharts');
    chartContainer.html(''); 

    let grandTotal = 0;
    const diseaseNames = selectedDiseases.map(d => d.replace(/_/g, ' '));
    // Get the full location names for clean display
    const locationNames = window.LOCATIONS.filter(loc => selectedLocations.includes(loc.replace(/[^a-zA-Z0-9]/g, '_')));

    // 1. Data Preparation: Aggregate all selected intervals/sexes for each Location
    const chartData = locationNames.map(location => {
        const locationId = location.replace(/[^a-zA-Z0-9]/g, '_');
        let totalCases = 0;
        
        selectedIntervals.forEach(interval => {
            totalCases += aggregatedData[locationId]?.[`M_${interval}`] || 0;
            totalCases += aggregatedData[locationId]?.[`F_${interval}`] || 0;
        });

        grandTotal += totalCases;
        
        // Use a clean name for the chart
        const locName = location.split(':').length > 1 ? location.split(':')[1].trim() : location;
        
        return {
            location: locName,
            total: totalCases
        };
    }).filter(d => d.total > 0);
    
    // Update the total count display
    document.getElementById('reportTotalCount').textContent = `Report Total: ${grandTotal} Cases`;

    if (grandTotal === 0) {
        chartContainer.html('<p class="text-center text-gray-500 py-8 font-semibold w-full">No data available after applying all filters.</p>');
        return;
    }
    
    // 2. Render the Grouped Bar Chart
    renderGroupedBarChart(chartContainer, chartData, diseaseNames, locationNames, periodValue);
};

/**
 * Renders a Grouped Bar Chart (Total Cases by Location for Selected Diseases/Period)
 */
function renderGroupedBarChart(container, data, diseaseNames, locationNames, periodValue) {
    const margin = { top: 40, right: 30, bottom: 100, left: 60 };
    const chartWidth = Math.max(700, locationNames.length * 80); // Adjust width based on number of locations
    const chartHeight = 450;
    const width = chartWidth - margin.left - margin.right;
    const height = chartHeight - margin.top - margin.bottom;

    const chartDiv = container.append('div')
        .attr('class', 'p-4 bg-white rounded-xl shadow-lg m-4')
        .style('width', `${chartWidth}px`);

    chartDiv.append('h3').attr('class', 'text-lg font-bold text-center mb-1 text-gray-800').text(`Comparison of Cases by Location`);
    chartDiv.append('p').attr('class', 'text-sm text-center text-gray-600 mb-4').html(`Diseases: **${diseaseNames.join(', ')}** during **${periodValue.replace(/_/g, ' - ')}**`);

    const svg = chartDiv.append('svg')
        .attr('width', chartWidth)
        .attr('height', chartHeight)
        .append('g')
        .attr('transform', `translate(${margin.left}, ${margin.top})`);

    // X-axis: Location
    const x = d3.scaleBand()
        .domain(data.map(d => d.location))
        .range([0, width])
        .padding(0.2);

    // Y-axis: Case Count
    const yMax = d3.max(data, d => d.total);
    const y = d3.scaleLinear()
        .domain([0, yMax * 1.1])
        .range([height, 0]);

    // Color: Single color since we're summing all sexes/intervals
    const color = d3.scaleOrdinal()
        .domain(['Total'])
        .range(['#3b82f6']);

    // Axes
    svg.append('g')
        .attr('transform', `translate(0,${height})`)
        .call(d3.axisBottom(x))
        .selectAll("text")
        .style("text-anchor", "end")
        .attr("dx", "-.8em")
        .attr("dy", ".15em")
        .attr("transform", "rotate(-45)"); 

    svg.append('g').call(d3.axisLeft(y).ticks(5));

    // Y-Axis Label
    svg.append("text")
        .attr("transform", "rotate(-90)")
        .attr("y", 0 - margin.left + 5)
        .attr("x", 0 - (height / 2))
        .attr("dy", "1em")
        .style("text-anchor", "middle")
        .style("font-size", "12px")
        .text("Total Cases");

    // Bars
    svg.selectAll('.bar')
        .data(data)
        .enter().append('rect')
        .attr('class', 'bar')
        .attr('x', d => x(d.location))
        .attr('y', d => y(d.total))
        .attr('height', d => height - y(d.total))
        .attr('width', x.bandwidth())
        .attr('fill', color('Total'))
        .attr('rx', 4)
        .append('title')
        .text(d => `${d.location}: ${d.total} cases`);

    // Add labels on top of bars
    svg.selectAll(".bar-label")
        .data(data)
        .enter().append("text")
        .attr("class", "bar-label")
        .attr("x", d => x(d.location) + x.bandwidth() / 2)
        .attr("y", d => y(d.total) - 5)
        .attr("text-anchor", "middle")
        .style("font-size", "10px")
        .style("fill", "#1f2937")
        .text(d => d.total);
}

// --- Admin Tools, Data Entry Grid Logic ---

window.renderConfigLists = function() {
    const diseaseListUl = document.getElementById('diseaseList');
    const locationListUl = document.getElementById('locationList');

    // Render Diseases
    diseaseListUl.innerHTML = window.DISEASES.map(d => `
        <li class="flex justify-between items-center p-2 bg-white rounded shadow-sm border border-yellow-300 text-yellow-900">
            <span class="truncate">${d.replace(/_/g, ' ')}</span>
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

window.addDisease = function() {
    const input = document.getElementById('newDiseaseInput');
    let name = input.value.trim();
    if (!name) return;
    
    // Create an ID from the name
    const diseaseId = name.replace(/[^a-zA-Z0-9\s]/g, '').trim().replace(/\s+/g, '_');

    if (window.DISEASES.includes(diseaseId)) {
        document.getElementById('statusMessage').textContent = "Disease already exists or generates a duplicate ID.";
        document.getElementById('statusMessage').className = "mb-4 p-3 rounded-lg text-sm bg-red-100 text-red-700";
        document.getElementById('statusMessage').style.display = 'block';
        return;
    }
    
    window.DISEASES.push(diseaseId);
    input.value = '';
    window.saveConfig();
};

window.deleteDisease = function(id) {
    window.DISEASES = window.DISEASES.filter(d => d !== id);
    window.saveConfig();
};

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
    window.saveConfig();
};

window.deleteLocation = function(name) {
    window.LOCATIONS = window.LOCATIONS.filter(l => l !== name);
    window.saveConfig();
};

window.populateFilterDropdowns = function() {
    // 1. Data Entry Disease Select
    const entrySelect = document.getElementById('entryDiseaseSelect');
    let currentEntryVal = entrySelect.value;
    entrySelect.innerHTML = window.DISEASES.map(d => `<option value="${d}" ${d === currentEntryVal ? 'selected' : ''}>${d.replace(/_/g, ' ')}</option>`).join('');

    // 2. Report Filter Dropdowns (for adding tags)
    const diseaseAddSelect = document.getElementById('diseaseAddSelect');
    const locationAddSelect = document.getElementById('locationAddSelect');
    const intervalAddSelect = document.getElementById('intervalAddSelect');

    // Disease Add Select
    diseaseAddSelect.innerHTML = window.DISEASES.map(d => `<option value="${d}">${d.replace(/_/g, ' ')}</option>`).join('');
    
    // Location Add Select
    locationAddSelect.innerHTML = window.LOCATIONS.map(l => `<option value="${l.replace(/[^a-zA-Z0-9]/g, '_')}">${l}</option>`).join('');

    // Interval Add Select
    intervalAddSelect.innerHTML = AGE_INTERVALS.map(i => `<option value="${i}">${i.replace(/_/g, '-').replace('plus', '+')}</option>`).join('');
};

window.saveConfig = async function() {
    const payload = {
        diseases: window.DISEASES,
        locations: window.LOCATIONS,
    };

    try {
        const result = await makeApiCall('/config', 'POST', payload);
        if (result && result.success) {
            document.getElementById('statusMessage').textContent = "Configuration saved successfully!";
            document.getElementById('statusMessage').className = "mb-4 p-3 rounded-lg text-sm bg-green-100 text-green-700";
            window.loadConfigAndRerender(); // Re-render everything with new config
        } else {
            throw new Error(result ? result.error : "Unknown config save error.");
        }
    } catch (e) {
        console.error("Error saving config: ", e);
        document.getElementById('statusMessage').textContent = `Error saving configuration: ${e.message}`;
        document.getElementById('statusMessage').className = "mb-4 p-3 rounded-lg text-sm bg-red-100 text-red-700";
    }
};

// Data Entry Grid Structure (Uses ALL locations/intervals)
window.renderGridStructure = function(tableId, isInput = true) {
    const table = document.getElementById(tableId);
    if (!table) return;

    let html = '';

    if (window.LOCATIONS.length === 0) {
          table.innerHTML = `<thead><tr><td colspan="${(AGE_INTERVALS.length * 2) + 3}" class="text-center p-8 text-gray-500">
            No locations defined. Please add locations in the Admin Tools section.
          </td></tr></thead>`;
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
    html += '<th rowspan="2" class="bg-yellow-700 text-black min-w-[100px] border-l-2 border-gray-400">TOTAL GÉNÉRAL</th>';
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

        html += `<td id="row_total_M_${locationId}_${tableId}" class="total-cell text-sm min-w-[50px] font-bold">0</td>`;
        html += `<td id="row_total_F_${locationId}_${tableId}" class="total-cell text-sm min-w-[50px] font-bold">0</td>`;
        html += `<td id="row_total_G_${locationId}_${tableId}" class="total-cell text-sm min-w-[100px] border-l-2 border-gray-400 font-extrabold">0</td>`;

        html += '</tr>';
    });
    html += '</tbody>';

    html += '<tfoot>';
    html += '<tr class="bg-yellow-500 font-bold">';
    html += `<td class="sticky-col bg-yellow-500 text-black text-center text-base border-r-2 border-gray-400">TOTAL</td>`;

    AGE_INTERVALS.forEach(interval => {
        html += `<td id="col_total_M_${interval}_${tableId}" class="total-cell bg-yellow-500 text-black">0</td>`;
        html += `<td id="col_total_F_${interval}_${tableId}" class="total-cell bg-yellow-500 text-black">0</td>`;
    });
    
    html += `<td id="grand_total_M_${tableId}" class="total-cell bg-yellow-600 text-black text-lg">0</td>`;
    html += `<td id="grand_total_F_${tableId}" class="total-cell bg-yellow-600 text-black text-lg">0</td>`;
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
    // Initial render of the empty grid structure for reporting (uses all locations/intervals)
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
    
    // 1. Clear previous data/inputs
    if (isInput) {
        window.clearGridInputs();
    } else {
          // Clear all report data cells
          document.querySelectorAll('#reportGrid td[id^="report_"]').forEach(td => {
            td.textContent = '0';
          });
    }
    
    if (!data) {
        window.calculateTotals(tableId);
        return;
    }
    
    // 2. Populate new data
    window.LOCATIONS.forEach(location => {
        const locationKey = location.replace(/[^a-zA-Z0-9]/g, '_');
        const locationData = data[locationKey];
        
        if (locationData) {
            AGE_INTERVALS.forEach(interval => {
                const keyM = `M_${interval}`;
                const keyF = `F_${interval}`;
                
                const safeValueM = parseInt(locationData[keyM] || 0, 10);
                const safeValueF = parseInt(locationData[keyF] || 0, 10);
                
                if (isInput) {
                    const inputElementM = document.getElementById(`input_${locationKey}_${keyM}`);
                    const inputElementF = document.getElementById(`input_${locationKey}_${keyF}`);
                    if (inputElementM) inputElementM.value = safeValueM;
                    if (inputElementF) inputElementF.value = safeValueF;
                } else {
                    const cellElementM = document.getElementById(`report_${locationKey}_${keyM}`);
                    const cellElementF = document.getElementById(`report_${locationKey}_${keyF}`);
                    if (cellElementM) cellElementM.textContent = safeValueM;
                    if (cellElementF) cellElementF.textContent = safeValueF;
                }
            });
        }
    });
    
    // 3. Recalculate all totals
    window.calculateTotals(tableId); 
};

window.collectGridData = function() {
    const data = {};
    
    window.LOCATIONS.forEach(location => {
        const locationId = location.replace(/[^a-zA-Z0-9]/g, '_');
        
        let hasData = false;
        const locationData = {};
        
        AGE_INTERVALS.forEach(interval => {
            const keyM = `M_${interval}`;
            const keyF = `F_${interval}`;
            const mInput = document.getElementById(`input_${locationId}_${keyM}`);
            const fInput = document.getElementById(`input_${locationId}_${keyF}`);
            
            const mCount = parseInt(mInput ? mInput.value : 0) || 0;
            const fCount = parseInt(fInput ? fInput.value : 0) || 0;
            
            locationData[keyM] = mCount;
            locationData[keyF] = fCount;
            
            if (mCount > 0 || fCount > 0) {
                hasData = true;
            }
        });
        
        if (hasData) {
            data[locationId] = locationData;
        }
    });
    return data;
};
