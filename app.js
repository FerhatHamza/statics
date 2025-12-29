// --- Configuration and Global State ---
// Check if already logged in
const token = localStorage.getItem("auth_token");
const expiresAt = localStorage.getItem("token_expires");

if (token && expiresAt) {
    const now = new Date();
    const expiryDate = new Date(expiresAt);

    if (now > expiryDate) {
        // Already logged in, redirect to app
        window.location.href = "Login.html";
    }
} else {
    // No token, ensure storage is clear
    window.location.href = "Login.html";
    localStorage.clear();
}




// FIX: Changed from a relative path to the absolute URL of the deployed Worker API
const API_BASE_URL = 'https://mehidistatics-api.ferhathamza17.workers.dev/api/v1';
const userId = localStorage.getItem('user_id');

// This simulates the user authentication ID provided by the environment
// const userId = typeof __app_id !== 'undefined' ? `user-${__app_id}` : 'guest-user-1234';

// Global data stores
window.allMonthlyData = {};
window.DISEASES = [];
window.LOCATIONS = [];

const AGE_INTERVALS = [
    "0_1", "2_4", "5_9", "10_14", "15_19", "20_44", "45_64", "65_plus"
];

// Configuration for Quarterly, Semi-Annual, and Annual report periods
const REPORT_PERIODS = {
    quarterly: [], semiannual: [], annual: [], monthly: []
};

// --- Utility Functions ---


const logout = document.getElementById('logoutButton');
logout.addEventListener('click', async () => {
    // localStorage.clear();
    // window.location.href = 'Login.html';
    const result = await makeApiCall('/logout', 'POST', { userId }); // Notify server of logout

});


/**
 * Generic helper to make API calls to the Worker
 */
// async function makeApiCall(endpoint, method = 'GET', data = null) {
//     //console.log(`Making API Call: ${method} ${endpoint} with data:`, data);
//     // Construct the full URL using the absolute worker domain
//     const url = `${API_BASE_URL}/user/${userId}${endpoint}`;
//     const options = {
//         method: method,
//         headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
//     };
//     if (data) {
//         options.body = JSON.stringify(data);
//     }

//     try {
//         const response = await fetch(url, options);
//         return await response.json();
//     } catch (error) {
//         console.error("API Call Error:", error);
//         document.getElementById('statusMessage').textContent = `API Error: ${error.message}. Check Worker deployment and URL: ${url}`;
//         document.getElementById('statusMessage').className = "mb-4 p-3 rounded-lg text-sm bg-red-100 text-red-700";
//         document.getElementById('statusMessage').style.display = 'block';
//         return null;
//     }
// }


async function makeApiCall(endpoint, method = 'GET', data = null) {
    // الحصول على userId و token من localStorage أو أي مكان تخزين
    const userId = localStorage.getItem('user_id');
    const token = localStorage.getItem('auth_token');
    console.log(token);

    // التحقق من وجود userId و token
    if (!userId || !token) {
        console.error("User ID or Token is missing");
        showErrorMessage("Please login first");
        return null;
    }

    // بناء URL بشكل صحيح
    const url = `${API_BASE_URL}${endpoint}`;

    // إنشاء options مع تحسينات
    const options = {
        method: method.toUpperCase(),
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
    };

    // إضافة body فقط إذا كان هناك بيانات AND الطريقة تستحق body
    if (data && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase())) {
        options.body = JSON.stringify(data);
    }

    // إضافة credentials إذا لزم الأمر (للتطوير المحلي)
    if (API_BASE_URL.includes('localhost')) {
        options.credentials = 'include';
    }

    console.log(`Making API Call: ${method} ${url}`, data ? `with data:` : '', data || '');

    try {
        const response = await fetch(url, options);

        // التحقق من حالة الاستجابة
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        // التحقق من نوع المحتوى
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            return await response.json();
        } else {
            return await response.text();
        }

    } catch (error) {
        console.error("API Call Error:", error);
        showErrorMessage(`API Error: ${error.message}. Check Worker deployment and URL: ${url}`);
        return null;
    }
}

function showErrorMessage(message) {
    const statusElement = document.getElementById('statusMessage');
    if (statusElement) {
        statusElement.textContent = message;
        statusElement.className = "mb-4 p-3 rounded-lg text-sm bg-red-100 text-red-700";
        statusElement.style.display = 'block';
    } else {
        console.error(message);
    }
}

// --- Initialization ---

window.onload = async function () {
    document.getElementById('userIdDisplay').textContent = userId;
    const currentMonth = new Date().toISOString().substring(0, 7); // YYYY-MM
    document.getElementById('entryMonthSelect').value = currentMonth;

    // Start the app by loading the config
    await window.loadConfigAndRerender();

    // Set up initial event listeners for Data Entry
    document.getElementById('entryMonthSelect').addEventListener('change', () => window.listenForEntryDataChanges());
    document.getElementById('entryDiseaseSelect').addEventListener('change', () => window.listenForEntryDataChanges());
    document.getElementById('saveButton').addEventListener('click', window.saveEntry);

    // Add event listeners for Reporting Filters (CRITICAL FIX)
    const reportTypeSelect = document.getElementById('reportTypeSelect');
    const reportPeriodSelect = document.getElementById('reportPeriodSelect');
    const reportDiseaseSelect = document.getElementById('reportDiseaseSelect');

    // Changing Report Type updates periods and triggers new report load
    if (reportTypeSelect) reportTypeSelect.addEventListener('change', () => {
        window.updateReportFilters();
        window.loadAggregatedReport();
    });
    // Changing Period or Disease triggers report load
    if (reportPeriodSelect) reportPeriodSelect.addEventListener('change', window.loadAggregatedReport);
    if (reportDiseaseSelect) reportDiseaseSelect.addEventListener('change', window.loadAggregatedReport);

    // === Add event listeners for Admin buttons ===
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
window.loadConfigAndRerender = async function () {
    const result = await makeApiCall('/user/config');
    if (!result || result.error) return;

    const config = result.data;

    window.DISEASES = config.diseases || [];
    window.LOCATIONS = config.locations || [];

    // Re-render all parts of the UI that depend on these lists
    window.renderConfigLists();
    window.populateFilterDropdowns();
    window.renderEntryGrid();
    window.renderReportGrid();
    window.setupReportingFilters(); // Initialize periods and update filters
    window.listenForEntryDataChanges(); // Initial data load for entry view
};

/**
 * Switches between the Data Entry, Reporting, and Admin views.
 */
window.switchView = async function (view) {
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
        // Ensure filters are correctly populated and a report is run on view change
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
window.listenForEntryDataChanges = async function () {
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

    const endpoint = `/user/report/${diseaseId}/${monthId}`;
    const result = await makeApiCall(endpoint);

    //console.log("Fetched entry data: 164", result);
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
window.saveEntry = async function () {
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
        const result = await makeApiCall('/user/report', 'POST', payload);
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
window.fetchAllMonthlyData = async function () {
    document.getElementById('statusMessage').textContent = "Fetching all monthly data for aggregation from D1...";
    document.getElementById('statusMessage').className = "mb-4 p-3 rounded-lg text-sm bg-gray-200 text-gray-700";
    document.getElementById('statusMessage').style.display = 'block';

    const data = await makeApiCall('/user/reports');
    //console.log("Fetched all monthly data for reporting 235:", data);

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
 * Defines the available report periods (Q1, S1, etc.) for aggregation.
 */
window.setupReportingFilters = function () {
    const currentYear = new Date().getFullYear();
    const startYear = 2025;

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

    window.updateReportFilters();
}

/**
 * Updates the Period dropdown based on the selected Report Type.
 */
window.updateReportFilters = function () {
    const reportTypeSelect = document.getElementById('reportTypeSelect');
    const periodSelect = document.getElementById('reportPeriodSelect');

    if (!reportTypeSelect || !periodSelect) return;

    // Enforce default value if none is selected
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
        // Monthly periods are already year-month formatted
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
        // Quarterly, Semi-Annual, Annual periods are prefixed by year
        for (let y = currentYear; y >= 2025; y--) {
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
window.loadAggregatedReport = async function () {
    const reportType = document.getElementById('reportTypeSelect').value;
    const periodValue = document.getElementById('reportPeriodSelect').value;
    const diseaseFilter = document.getElementById('reportDiseaseSelect').value;

    if (window.LOCATIONS.length === 0) {
        document.getElementById('reportGrid').innerHTML = `<tr><td colspan="${(AGE_INTERVALS.length * 2) + 3}" class="text-center p-8 text-gray-500">
            Cannot generate report: No locations defined.
          </td></tr>`;
        document.getElementById('reportTotalCount').textContent = "Report Total: 0 Cases";
        d3.select('#reportCharts').html('<p class="text-center text-gray-500 py-8 font-semibold">No locations defined in Admin Tools.</p>');
        return;
    }

    const { fullMonthStrings, year } = getAggregationMonths(reportType, periodValue);

    if (fullMonthStrings.length === 0) {
        document.getElementById('statusMessage').textContent = "Please select a valid period.";
        document.getElementById('statusMessage').className = "mb-4 p-3 rounded-lg text-sm bg-yellow-100 text-yellow-700";
        d3.select('#reportCharts').html('<p class="text-center text-gray-500 py-8 font-semibold">Select a valid time period.</p>');
        return;
    }

    const aggregatedData = aggregateData(fullMonthStrings, year, diseaseFilter);


    window.loadDataIntoGrid(aggregatedData, 'reportGrid');

    // Call the chart rendering function
    window.renderCharts(aggregatedData, diseaseFilter, periodValue);

    document.getElementById('statusMessage').textContent = `Report loaded for ${diseaseFilter.replace(/_/g, ' ')} for ${periodValue.replace(/_/g, ' - ')}.`;
    document.getElementById('statusMessage').className = "mb-4 p-3 rounded-lg text-sm bg-blue-100 text-blue-700";
};





// --- EXPORT & PRINT LOGIC ---

/**
 * Initializes the Export Tab options
 */
window.initExportView = function () {
    window.updateExportPeriodOptions();

    // Populate Disease Checkboxes
    const diseaseContainer = document.getElementById('exportDiseaseContainer');
    diseaseContainer.innerHTML = '';

    // "All Diseases" option
    window.createCheckbox(diseaseContainer, 'all', 'All Diseases (Aggregated)');

    window.DISEASES.forEach(d => {
        window.createCheckbox(diseaseContainer, d, d.replace(/_/g, ' '));
    });
};

/**
 * Helper to create a checkbox
 */
window.createCheckbox = function (container, value, label) {
    const div = document.createElement('div');
    div.className = 'flex items-center';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = value;
    input.className = 'h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded';

    const span = document.createElement('span');
    span.className = 'ml-2 text-sm text-gray-700';
    span.textContent = label;

    div.appendChild(input);
    div.appendChild(span);
    div.onclick = (e) => { if (e.target !== input) input.click(); }; // Click label to toggle

    container.appendChild(div);
};

/**
 * Updates the Period checkboxes based on the selected Report Type (Monthly, Quarterly, etc.)
 */
window.updateExportPeriodOptions = function () {
    const type = document.getElementById('exportTypeSelect').value;
    const container = document.getElementById('exportPeriodContainer');
    container.innerHTML = '';

    const currentYear = new Date().getFullYear();
    const periods = REPORT_PERIODS[type]; // Uses the global configuration from Part 1/2

    if (type === 'monthly') {
        periods.forEach(p => {
            window.createCheckbox(container, p.id, p.label);
        });
    } else {
        for (let y = currentYear; y >= 2025; y--) {
            periods.forEach(p => {
                window.createCheckbox(container, `${y}_${p.id}`, `${y} - ${p.label}`);
            });
        }
    }
};

/**
 * Helpers for Select All / Deselect All
 */
window.toggleCheckboxes = function (containerId, checked) {
    const inputs = document.querySelectorAll(`#${containerId} input[type="checkbox"]`);
    inputs.forEach(input => input.checked = checked);
};

/**
 * THE CORE LOGIC: Generates the Batch Report
 */
// window.generateBatchReport = function () {
//     const printArea = document.getElementById('printArea');
//     printArea.innerHTML = ''; // Clear previous

//     // 1. Get Selections
//     const type = document.getElementById('exportTypeSelect').value;

//     // Get checked periods
//     const periodInputs = document.querySelectorAll('#exportPeriodContainer input[type="checkbox"]:checked');
//     const selectedPeriods = Array.from(periodInputs).map(i => ({ value: i.value, label: i.nextSibling.textContent }));

//     // Get checked diseases
//     const diseaseInputs = document.querySelectorAll('#exportDiseaseContainer input[type="checkbox"]:checked');
//     const selectedDiseases = Array.from(diseaseInputs).map(i => ({ value: i.value, label: i.nextSibling.textContent }));

//     if (selectedPeriods.length === 0 || selectedDiseases.length === 0) {
//         printArea.innerHTML = '<p class="text-red-500 text-center font-bold">Please select at least one Time Period and one Disease.</p>';
//         return;
//     }

//     //console.log("Generating batch report for periods 481:", selectedPeriods, "and diseases:", selectedDiseases);
//     // 2. Loop through combinations
//     let count = 0;

//     selectedPeriods.forEach(period => {
//         selectedDiseases.forEach(disease => {
//             count++;
//             // Create a unique container for this specific report
//             const reportCard = document.createElement('div');
//             reportCard.className = 'report-card';

//             // A. Header
//             const header = document.createElement('div');
//             header.className = 'border-b border-gray-300 pb-4 mb-4 text-center';
//             header.innerHTML = `
//                 <h2 class="text-2xl font-extrabold text-gray-900 uppercase tracking-wide">${disease.label}</h2>
//                 <p class="text-lg text-gray-600 font-semibold">${period.label}</p>
//                 <p class="text-xs text-gray-400 mt-1">Generated: ${new Date().toLocaleDateString()}</p>
//             `;
//             reportCard.appendChild(header);

//             // B. Data Aggregation
//             // reusing your existing logic
//             const { fullMonthStrings, year } = getAggregationMonths(type, period.value);
//             // If "All Diseases" is selected (value='all'), aggregateData handles it.
//             // If specific disease, aggregateData handles it.
//             const aggregatedData = aggregateData(fullMonthStrings, year, disease.value);
//             //console.log(`Aggregated data for ${disease.label} - ${period.label}:`, aggregatedData);

//             // C. Render Grid
//             const gridContainer = document.createElement('div');
//             gridContainer.className = 'grid-container mb-8';
//             const tableId = `print_table_${count}`;
//             const table = document.createElement('table');
//             table.id = tableId;
//             table.className = 'table-fixed min-w-full';
//             gridContainer.appendChild(table);
//             reportCard.appendChild(gridContainer);

//             // D. Render Charts Container
//             const chartContainer = document.createElement('div');
//             chartContainer.id = `print_chart_${count}`;
//             chartContainer.className = 'flex flex-wrap justify-center gap-4 print:block print:w-full';
//             reportCard.appendChild(chartContainer);

//             // Append card to DOM
//             printArea.appendChild(reportCard);

//             // E. Populate Data (After appending to DOM so D3 can find elements)
//             window.renderGridStructure(tableId, false);
//             window.loadDataIntoGrid(aggregatedData, tableId);

//             // F. Render Charts specific to this card
//             // We use d3.select on the specific container we just made
//             const d3Container = d3.select(`#print_chart_${count}`);

//             // Render Stacked Bar
//             renderStackedBarChart(d3Container, prepareStackedData(aggregatedData), `${disease.label} - ${period.label}`);

//             // Render Median Chart (if data exists)
//             const medianData = prepareMedianData(aggregatedData);
//             if (medianData.length > 0) {
//                 renderDirectLabelledChart(d3Container, medianData, `${disease.label} - ${period.label}`);
//             }
//         });
//     });
// };

// --- Helper functions for Charts (extracting data prep from the old renderCharts) ---

function prepareStackedData(aggregatedData) {
    return AGE_INTERVALS.map(int => {
        let mTotal = 0;
        let fTotal = 0;
        window.LOCATIONS.forEach(loc => {
            const locId = loc.replace(/[^a-zA-Z0-9]/g, '_');
            mTotal += aggregatedData[locId]?.[`M_${int}`] || 0;
            fTotal += aggregatedData[locId]?.[`F_${int}`] || 0;
        });
        return {
            interval: int.replace(/_/g, '-').replace('plus', '+'),
            M: mTotal,
            F: fTotal
        };
    });
}

function prepareMedianData(aggregatedData) {
    const rawData = [];
    window.LOCATIONS.forEach(location => {
        const locationId = location.replace(/[^a-zA-Z0-9]/g, '_');
        const locName = location.split(':').length > 1 ? location.split(':')[1].trim() : location;

        AGE_INTERVALS.forEach(interval => {
            const mCount = aggregatedData[locationId]?.[`M_${interval}`] || 0;
            const fCount = aggregatedData[locationId]?.[`F_${interval}`] || 0;
            if (mCount > 0) rawData.push({ location: locName, value: mCount });
            if (fCount > 0) rawData.push({ location: locName, value: fCount });
        });
    });
    return rawData;
}

// --- Update switchView to initialize the export tab ---
const originalSwitchView = window.switchView;
window.switchView = async function (view) {
    // Call original logic
    if (view === 'entry' || view === 'reporting' || view === 'admin') {
        // Hide export view manually since original didn't know about it
        document.getElementById('exportView').classList.add('hidden');
        document.getElementById('printTab').classList.remove('tab-active');
        document.getElementById('printTab').classList.add('tab-inactive');
    }

    // Handle new Export View
    if (view === 'export') {
        // Hide others
        ['entry', 'reporting', 'admin'].forEach(v => {
            document.getElementById(`${v}View`).classList.add('hidden');
            document.getElementById(`${v}Tab`).classList.remove('tab-active');
            document.getElementById(`${v}Tab`).classList.add('tab-inactive');
        });

        document.getElementById('exportView').classList.remove('hidden');
        document.getElementById('printTab').classList.add('tab-active');
        document.getElementById('printTab').classList.remove('tab-inactive');

        await window.fetchAllMonthlyData(); // Ensure we have data
        window.initExportView(); // Initialize checkboxes
        return;
    }

    // Call original function for standard tabs
    await originalSwitchView(view);
};






// --- D3 CHARTING LOGIC ---
/**
/**
 * Prepares data and calls the specific chart rendering functions.
 */
window.renderCharts = function (aggregatedData, diseaseFilter, periodValue) {
    const chartContainer = d3.select('#reportCharts');
    chartContainer.html(''); // Clear previous charts

    // 1. Data for the Box Plot (Distribution of Case Counts per Location across Age/Sex groups)
    const boxPlotDataRaw = [];
    // 2. Data for the Stacked Bar Chart (Age & Sex)
    const ageIntervalTotals = AGE_INTERVALS.map(int => ({
        interval: int.replace(/_/g, '-').replace('plus', '+'),
        M: 0,
        F: 0
    }));
    let grandTotal = 0;

    window.LOCATIONS.forEach(location => {
        const locationId = location.replace(/[^a-zA-Z0-9]/g, '_');

        AGE_INTERVALS.forEach((interval, index) => {
            const mCount = aggregatedData[locationId]?.[`M_${interval}`] || 0;
            const fCount = aggregatedData[locationId]?.[`F_${interval}`] || 0;

            // Prepare data for Box Plot (raw counts for each category per location)
            if (mCount > 0 || fCount > 0) {
                const locName = location.split(':').length > 1 ? location.split(':')[1].trim() : location;

                // Add the Male count for this age interval as a data point
                boxPlotDataRaw.push({
                    location: locName,
                    value: mCount
                });
                // Add the Female count for this age interval as a data point
                boxPlotDataRaw.push({
                    location: locName,
                    value: fCount
                });
            }

            // Update totals for Stacked Bar Chart
            ageIntervalTotals[index].M += mCount;
            ageIntervalTotals[index].F += fCount;
            grandTotal += mCount + fCount;
        });
    });

    // Update the total count display
    document.getElementById('reportTotalCount').textContent = `Report Total: ${grandTotal} Cases`;

    if (grandTotal === 0) {
        chartContainer.html('<p class="text-center text-gray-500 py-8 font-semibold">No data available for the selected period or disease.</p>');
        return;
    }

    const title = `${diseaseFilter === 'all' ? 'All Diseases' : diseaseFilter.replace(/_/g, ' ')} Report for ${periodValue.replace(/_/g, ' - ')}`;

    // Use a flex container to hold the charts
    const chartsRow = chartContainer.append('div').attr('class', 'flex flex-wrap justify-center items-start w-full');

    // 1. Box Plot (Distribution of Case Counts per Location) - Replaces Donut Chart
    if (boxPlotDataRaw.length > 0) {
        renderBoxPlot(chartsRow, boxPlotDataRaw.filter(d => d.value > 0), title);
    }

    // 2. Layered Area Chart (Stacked Bar Chart for categorical data)
    if (ageIntervalTotals.some(d => d.M > 0 || d.F > 0)) {
        renderStackedBarChart(chartsRow, ageIntervalTotals, title);
    }
};


// --- directly labelled chart---

/**
 * Prepares data and calls the specific chart rendering functions.
 */
window.renderCharts = function (aggregatedData, diseaseFilter, periodValue) {
    const chartContainer = d3.select('#reportCharts');
    chartContainer.html(''); // Clear previous charts

    // 1. Data for the Comparison Chart (Distribution of Case Counts per Location across Age/Sex groups)
    const comparisonChartDataRaw = [];
    // 2. Data for the Stacked Bar Chart (Age & Sex)
    const ageIntervalTotals = AGE_INTERVALS.map(int => ({
        interval: int.replace(/_/g, '-').replace('plus', '+'),
        M: 0,
        F: 0
    }));
    let grandTotal = 0;

    window.LOCATIONS.forEach(location => {
        const locationId = location.replace(/[^a-zA-Z0-9]/g, '_');

        AGE_INTERVALS.forEach((interval, index) => {
            const mCount = aggregatedData[locationId]?.[`M_${interval}`] || 0;
            const fCount = aggregatedData[locationId]?.[`F_${interval}`] || 0;

            // Prepare raw data for Comparison Chart (raw counts for each category per location)
            if (mCount > 0 || fCount > 0) {
                const locName = location.split(':').length > 1 ? location.split(':')[1].trim() : location;

                // Add the Male count for this age interval as a data point
                comparisonChartDataRaw.push({
                    location: locName,
                    value: mCount
                });
                // Add the Female count for this age interval as a data point
                comparisonChartDataRaw.push({
                    location: locName,
                    value: fCount
                });
            }

            // Update totals for Stacked Bar Chart
            ageIntervalTotals[index].M += mCount;
            ageIntervalTotals[index].F += fCount;
            grandTotal += mCount + fCount;
        });
    });

    // Update the total count display
    document.getElementById('reportTotalCount').textContent = `Report Total: ${grandTotal} Cases`;

    if (grandTotal === 0) {
        chartContainer.html('<p class="text-center text-gray-500 py-8 font-semibold">No data available for the selected period or disease.</p>');
        return;
    }

    const title = `${diseaseFilter === 'all' ? 'All Diseases' : diseaseFilter.replace(/_/g, ' ')} Report for ${periodValue.replace(/_/g, ' - ')}`;

    // Use a flex container to hold the charts
    const chartsRow = chartContainer.append('div').attr('class', 'flex flex-wrap justify-center items-start w-full');

    // 1. Directly Labelled Comparison Chart (Median Case Count by Location)
    if (comparisonChartDataRaw.length > 0) {
        renderDirectLabelledChart(chartsRow, comparisonChartDataRaw.filter(d => d.value > 0), title);
    }

    // 2. Layered Area Chart (Stacked Bar Chart for categorical data)
    if (ageIntervalTotals.some(d => d.M > 0 || d.F > 0)) {
        renderStackedBarChart(chartsRow, ageIntervalTotals, title);
    }
};

/**
 * Renders a Horizontal Direct-Labelled Dot Plot (Median Case Counts by Location)
 */
function renderDirectLabelledChart(container, rawData, title) {
    // Increased right margin to ensure space for the direct value labels
    const margin = { top: 30, right: 100, bottom: 40, left: 100 };
    const chartWidth = 900;
    const chartHeight = 500;
    const width = chartWidth - margin.left - margin.right;
    const height = chartHeight - margin.top - margin.bottom;

    // 1. Group raw data by location and calculate the Median
    const locationData = d3.group(rawData, d => d.location);

    const chartData = Array.from(locationData, ([location, values]) => {
        const sortedValues = values.map(d => d.value).sort(d3.ascending);
        // Use the Median (Q2) as the primary comparison value
        const median = d3.quantile(sortedValues, 0.5);

        return {
            location: location,
            value: median,
        };
    });

    // Sort the data by Median value, descending
    chartData.sort((a, b) => b.value - a.value);

    // Create the container div
    const chartDiv = container.append('div')
        .attr('class', 'p-4 bg-white rounded-xl shadow-lg m-4 w-full');

    chartDiv.append('h3').attr('class', 'text-lg font-bold text-center mb-1 text-gray-800').text('Repartition of Median Case Counts by Location');
    chartDiv.append('p').attr('class', 'text-sm text-center text-gray-600 mb-4').text(title);

    const svg = chartDiv.append('svg')
        .attr('viewBox', `0 0 ${chartWidth} ${chartHeight}`)
        .attr('width', '100%')
        .attr('height', '100%')
        .append('g')
        .attr('transform', `translate(${margin.left}, ${margin.top})`);

    // 2. Scales (Horizontal Bar/Dot Plot)
    const xMax = d3.max(chartData, d => d.value) * 1.1;

    // X Scale (Value - Median Count)
    const x = d3.scaleLinear()
        .range([0, width])
        .domain([0, xMax]);

    // Y Scale (Categories - Locations)
    const y = d3.scaleBand()
        .range([0, height])
        .domain(chartData.map(d => d.location))
        .padding(0.5);

    const color = d3.scaleOrdinal(d3.schemeCategory10);

    // 3. Axes

    // X-Axis (Value)
    svg.append('g')
        .attr('transform', `translate(0,${height})`)
        .call(d3.axisBottom(x).ticks(5).tickFormat(d3.format("d")));

    svg.append("text")
        .attr("class", "x-axis-label")
        .attr("y", height + margin.bottom - 5)
        .attr("x", width / 2)
        .attr("fill", "gray")
        .style("text-anchor", "middle")
        .style("font-size", "12px")
        .text("Median Case Count (Q2)");

    // Y-Axis (Location Labels)
    svg.append('g')
        .call(d3.axisLeft(y));

    // 4. Draw Lines/Dots and Labels
    const plots = svg.selectAll(".directPlot")
        .data(chartData)
        .enter()
        .append("g")
        .attr("class", "directPlot")
        .attr("transform", d => `translate(0, ${y(d.location)})`); // Move to the center of the bar band

    // Draw the horizontal line from 0 to the value
    plots.append("line")
        .attr("x1", x(0))
        .attr("x2", d => x(d.value))
        .attr("y1", y.bandwidth() / 2)
        .attr("y2", y.bandwidth() / 2)
        .attr("stroke", d => color(d.location))
        .attr('stroke-width', 4)
        .attr('stroke-linecap', 'round');

    // Draw the dot at the end (the primary comparison point)
    plots.append("circle")
        .attr("cx", d => x(d.value))
        .attr("cy", y.bandwidth() / 2)
        .attr("r", 5)
        .attr("fill", d => color(d.location))
        .attr("stroke", "white")
        .attr("stroke-width", 2);

    // Add the Direct Label (the core requirement)
    plots.append("text")
        .attr("x", d => x(d.value) + 10) // Offset label 10px to the right of the dot
        .attr("y", y.bandwidth() / 2 + 5) // Vertically center the text
        .attr("fill", d => color(d.location))
        .attr("font-weight", "bold")
        .style("font-size", "14px")
        .style("text-anchor", "start")
        .text(d => d3.format(".0f")(d.value)); // Display the median value

}

// --- MOCK GLOBAL VARIABLES (Assuming these exist in the actual environment) ---
window.LOCATIONS = [
    "Facility: Main Hospital",
    "Facility: South Clinic",
    "Facility: West Satellite"
];
window.AGE_INTERVALS = [
    "0_10",
    "11_20",
    "21_30",
    "31_40",
    "41_50",
    "51_plus"
];
const GENDERS = ['M', 'F'];

// --- D3 CHARTING LOGIC ---

/**
 * Prepares data and calls the specific chart rendering functions.
 */
window.renderCharts = function (aggregatedData, diseaseFilter, periodValue) {
    // Example Mock Data if aggregatedData is empty for testing the new chart:
    if (!aggregatedData || Object.keys(aggregatedData).length === 0) {
        aggregatedData = {
            'Facility__Main_Hospital': { 'M_0_10': 5, 'F_0_10': 3, 'M_31_40': 15, 'F_31_40': 10, 'M_51_plus': 2 },
            'Facility__South_Clinic': { 'M_11_20': 8, 'F_11_20': 12, 'M_21_30': 5, 'F_21_30': 4, 'F_51_plus': 15 },
            'Facility__West_Satellite': { 'M_0_10': 2, 'F_0_10': 1, 'M_41_50': 20, 'F_41_50': 18 }
        };
    }

    const chartContainer = d3.select('#reportCharts');
    chartContainer.html(''); // Clear previous charts

    // 1. Data for the Comparison Chart (raw counts for median calculation)
    const comparisonChartDataRaw = [];

    // 2. Data for the Age/Sex Distribution by Location Chart
    const locationAgeSexData = [];
    let grandTotal = 0;

    window.LOCATIONS.forEach(location => {
        const locationId = location.replace(/[^a-zA-Z0-9]/g, '_');
        const locName = location.split(':').length > 1 ? location.split(':')[1].trim() : location;

        AGE_INTERVALS.forEach((interval) => {
            const mCount = aggregatedData[locationId]?.[`M_${interval}`] || 0;
            const fCount = aggregatedData[locationId]?.[`F_${interval}`] || 0;

            // Prepare raw data for Median Chart
            if (mCount > 0 || fCount > 0) {
                comparisonChartDataRaw.push({ location: locName, value: mCount });
                comparisonChartDataRaw.push({ location: locName, value: fCount });
            }

            // Prepare data for Age/Sex by Location Chart
            if (mCount > 0 || fCount > 0) {
                locationAgeSexData.push({
                    location: locName,
                    interval: interval.replace(/_/g, '-').replace('plus', '+'),
                    M: mCount,
                    F: fCount,
                    Total: mCount + fCount
                });
            }

            grandTotal += mCount + fCount;
        });
    });

    // Update the total count display
    document.getElementById('reportTotalCount').textContent = `Report Total: ${grandTotal} Cases`;

    if (grandTotal === 0) {
        chartContainer.html('<p class="text-center text-gray-500 py-8 font-semibold">No data available for the selected period or disease.</p>');
        return;
    }

    const title = `${diseaseFilter === 'all' ? 'All Diseases' : diseaseFilter.replace(/_/g, ' ')} Report for ${periodValue.replace(/_/g, ' - ')}`;

    // Use a flex container to hold the charts
    const chartsRow = chartContainer.append('div').attr('class', 'flex flex-wrap justify-center items-start w-full');

    // 1. Directly Labelled Comparison Chart (Median Case Count by Location)
    if (comparisonChartDataRaw.length > 0) {
        // We ensure only locations with values > 0 are passed
        renderDirectLabelledChart(chartsRow, comparisonChartDataRaw.filter(d => d.value > 0), title);
    }

    // 3. Age by Sex Distribution Chart (New Chart)
    if (locationAgeSexData.length > 0) {
        // We use the aggregated data for the detailed distribution chart
        renderStackedBarChart(chartsRow, locationAgeSexData, title);
    }

};

/**
 * Renders a Horizontal Direct-Labelled Dot Plot (Median Case Counts by Location)
 * (Function from previous step - kept for completeness)
 */
function renderDirectLabelledChart(container, rawData, title) {
    const margin = { top: 30, right: 100, bottom: 40, left: 100 };
    const chartWidth = 900;
    const chartHeight = 500;
    const width = chartWidth - margin.left - margin.right;
    const height = chartHeight - margin.top - margin.bottom;

    const locationData = d3.group(rawData, d => d.location);

    const chartData = Array.from(locationData, ([location, values]) => {
        const sortedValues = values.map(d => d.value).sort(d3.ascending);
        const median = d3.quantile(sortedValues, 0.5);
        return { location: location, value: median };
    });

    chartData.sort((a, b) => b.value - a.value);

    const chartDiv = container.append('div')
        .attr('class', 'p-4 bg-white rounded-xl shadow-lg m-4 w-full');

    chartDiv.append('h3').attr('class', 'text-lg font-bold text-center mb-1 text-gray-800').text('Comparison of Median Case Counts by Location');
    chartDiv.append('p').attr('class', 'text-sm text-center text-gray-600 mb-4').text(title);

    const svg = chartDiv.append('svg')
        .attr('viewBox', `0 0 ${chartWidth} ${chartHeight}`)
        .attr('width', '100%')
        .attr('height', '100%')
        .append('g')
        .attr('transform', `translate(${margin.left}, ${margin.top})`);

    const xMax = d3.max(chartData, d => d.value) * 1.1;

    const x = d3.scaleLinear()
        .range([0, width])
        .domain([0, xMax]);

    const y = d3.scaleBand()
        .range([0, height])
        .domain(chartData.map(d => d.location))
        .padding(0.5);

    const color = d3.scaleOrdinal(d3.schemeCategory10);

    svg.append('g')
        .attr('transform', `translate(0,${height})`)
        .call(d3.axisBottom(x).ticks(5).tickFormat(d3.format("d")));

    svg.append("text")
        .attr("class", "x-axis-label")
        .attr("y", height + margin.bottom - 5)
        .attr("x", width / 2)
        .attr("fill", "gray")
        .style("text-anchor", "middle")
        .style("font-size", "12px")
        .text("Median Case Count (Q2)");

    svg.append('g')
        .call(d3.axisLeft(y));

    const plots = svg.selectAll(".directPlot")
        .data(chartData)
        .enter()
        .append("g")
        .attr("class", "directPlot")
        .attr("transform", d => `translate(0, ${y(d.location)})`);

    plots.append("line")
        .attr("x1", x(0))
        .attr("x2", d => x(d.value))
        .attr("y1", y.bandwidth() / 2)
        .attr("y2", y.bandwidth() / 2)
        .attr("stroke", d => color(d.location))
        .attr('stroke-width', 4)
        .attr('stroke-linecap', 'round');

    plots.append("circle")
        .attr("cx", d => x(d.value))
        .attr("cy", y.bandwidth() / 2)
        .attr("r", 5)
        .attr("fill", d => color(d.location))
        .attr("stroke", "white")
        .attr("stroke-width", 2);

    plots.append("text")
        .attr("x", d => x(d.value) + 10)
        .attr("y", y.bandwidth() / 2 + 5)
        .attr("fill", d => color(d.location))
        .attr("font-weight", "bold")
        .style("font-size", "14px")
        .style("text-anchor", "start")
        .text(d => d3.format(".0f")(d.value));
}

/**
 * Renders the Stacked Bar Chart (Age and Sex Distribution)
 */
function renderStackedBarChart(container, data, title) {
    const margin = { top: 30, right: 30, bottom: 80, left: 60 };
    // Adjusted width for full screen appearance (max width for the container div)
    const chartWidth = 900;
    const chartHeight = 450;
    const width = chartWidth - margin.left - margin.right;
    const height = chartHeight - margin.top - margin.bottom;

    const keys = ['M', 'F'];

    const chartDiv = container.append('div')
        .attr('class', 'p-4 bg-white rounded-xl shadow-lg m-4 w-full'); // w-full for full screen

    chartDiv.append('h3').attr('class', 'text-lg font-bold text-center mb-1 text-gray-800').text('Age and Sex Distribution');
    chartDiv.append('p').attr('class', 'text-sm text-center text-gray-600 mb-4').text(title);

    const svg = chartDiv.append('svg')
        .attr('viewBox', `0 0 ${chartWidth} ${chartHeight}`)
        .attr('width', '100%')
        .attr('height', '100%')
        .append('g')
        .attr('transform', `translate(${margin.left}, ${margin.top})`);

    // Data processing for stacking
    const stack = d3.stack().keys(keys).order(d3.stackOrderNone).offset(d3.stackOffsetNone);
    const stackedData = stack(data);

    // Scales
    const x = d3.scaleBand()
        .domain(data.map(d => d.interval))
        .range([0, width])
        .padding(0.2);

    const yMax = d3.max(stackedData[stackedData.length - 1], d => d[1]);
    const y = d3.scaleLinear()
        .domain([0, yMax * 1.1])
        .range([height, 0]);

    const color = d3.scaleOrdinal()
        .domain(keys)
        .range(['#3b82f6', '#f472b6']);

    // Axes
    svg.append('g')
        .attr('transform', `translate(0,${height})`)
        .call(d3.axisBottom(x))
        .selectAll("text")
        .style("text-anchor", "end")
        .attr("dx", "-.8em")
        .attr("dy", ".15em")
        .attr("transform", "rotate(-45)");

    svg.append('g')
        .call(d3.axisLeft(y).ticks(5).tickFormat(d3.format("d")));

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
    svg.selectAll('.layer')
        .data(stackedData)
        .enter().append('g')
        .attr('class', 'layer')
        .attr('fill', d => color(d.key))
        .selectAll('rect')
        .data(d => d)
        .enter().append('rect')
        .attr('x', d => x(d.data.interval))
        .attr('y', d => y(d[1]))
        .attr('height', d => y(d[0]) - y(d[1]))
        .attr('width', x.bandwidth())
        .attr('rx', 4)
        .append('title')
        .text(d => `${d.data.interval} (${d3.select(this.parentNode).datum().key === 'M' ? 'Male' : 'Female'}): ${d[1] - d[0]} cases`);

    // Legend
    const legend = svg.append('g')
        .attr('transform', `translate(${width - 100}, 0)`);

    keys.forEach((key, i) => {
        const legendRow = legend.append('g')
            .attr('transform', `translate(0, ${i * 20})`);

        legendRow.append('rect')
            .attr('width', 10)
            .attr('height', 10)
            .attr('fill', color(key))
            .attr('rx', 2);

        legendRow.append('text')
            .attr('x', 15)
            .attr('y', 10)
            .style('font-size', '12px')
            .text(key === 'M' ? 'Male' : 'Female');
    });
}

// --- Data Aggregation Helpers ---

function getAggregationMonths(type, periodValue) {
    // periodValue format: YYYY-MM (monthly) or YYYY_ID (quarterly/yearly)
    const parts = periodValue.split(/[-_]/);
    const year = parts[0];

    let monthsToAggregate = [];

    if (type === 'monthly') {
        // FIX: Correctly handle YYYY-MM format for monthly
        const month = parts[1];
        if (month) monthsToAggregate = [month];
    } else {
        const periodId = parts[1];
        const periods = REPORT_PERIODS[type];
        const periodsConfig = periods ? periods.find(p => p.id === periodId) : null;

        if (periodsConfig) {
            monthsToAggregate = periodsConfig.months;
        }
    }

    const fullMonthStrings = monthsToAggregate.map(m => `${year}-${m}`);

    return { fullMonthStrings, year: year };
}


function getReady() {
    const groupedByDiseasePeriodRegion = {};

    Object.values(window.allMonthlyData).forEach(item => {
        const disease = item.disease;
        const period = item.monthId;
        const regions = item.data;  // Example: { "Metlili___Zelfana": {...}, ... }

        if (!groupedByDiseasePeriodRegion[disease]) {
            groupedByDiseasePeriodRegion[disease] = {};
        }
        if (!groupedByDiseasePeriodRegion[disease][period]) {
            groupedByDiseasePeriodRegion[disease][period] = {};
        }

        Object.entries(regions).forEach(([regionKey, regionData]) => {
            const [parent, child] = regionKey.split("___");

            if (!groupedByDiseasePeriodRegion[disease][period][parent]) {
                groupedByDiseasePeriodRegion[disease][period][parent] = {};
            }

            groupedByDiseasePeriodRegion[disease][period][parent][child] = regionData;
        });
    });


    const grouped = groupedByDiseasePeriodRegion;
    const summed = {};

    Object.entries(grouped).forEach(([disease, periods]) => {
        summed[disease] = {};

        Object.entries(periods).forEach(([periodId, regions]) => {
            Object.entries(regions).forEach(([parentRegion, subRegions]) => {

                // Ensure parent region exists in final result
                if (!summed[disease][parentRegion]) {
                    summed[disease][parentRegion] = {};
                }

                Object.entries(subRegions).forEach(([childRegion, data]) => {

                    // Ensure child region exists
                    if (!summed[disease][parentRegion][childRegion]) {
                        // Deep clone data (so we don’t mutate original)
                        summed[disease][parentRegion][childRegion] = { ...data };
                    } else {
                        // Sum numeric fields
                        Object.keys(data).forEach(key => {
                            summed[disease][parentRegion][childRegion][key] =
                                (summed[disease][parentRegion][childRegion][key] || 0) +
                                (data[key] || 0);
                        });
                    }

                });
            });
        });
    });

    return summed;
}

function aggregateData(fullMonthStrings, year, diseaseFilter) {
    console.log("Aggregating :", window.allMonthlyData);
    const aggregated = {};

    // Initialize aggregated structure
    window.LOCATIONS.forEach(location => {
        const locationId = location.replace(/[^a-zA-Z0-9]/g, '_');
        aggregated[locationId] = {};
        AGE_INTERVALS.forEach(interval => {
            aggregated[locationId][`M_${interval}`] = 0;
            aggregated[locationId][`F_${interval}`] = 0;
        });
    });



    const dataReady = getReady();
    console.log("summed:", dataReady);

    // Sum data from all matching monthly reports
    Object.values(window.allMonthlyData).forEach(monthlyReport => {
        // //console.log("Processing ", monthlyReport);
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

    console.log("Aggregated Data:", aggregated);
    return aggregated;
}


const AGE_GROUPS = [
    { key: '0_1', label: '0-1' }, { key: '2_4', label: '2-4' }, { key: '5_9', label: '5-9' },
    { key: '10_14', label: '10-14' }, { key: '15_19', label: '15-19' }, { key: '20_44', label: '20-44' },
    { key: '45_64', label: '45-64' }, { key: '65_plus', label: '65+' }
];
// دالة التجميع (تدمج الشهور لنفس المرض)
function processData(data) {
    const grouped = {};

    Object.values(data).forEach(record => {
        const disease = record.disease;

        // إنشاء مدخل جديد للمرض إذا لم يوجد
        if (!grouped[disease]) {
            grouped[disease] = { name: disease, months: new Set(), cities: {} };
        }

        // إضافة الشهر للمجموعة
        grouped[disease].months.add(record.monthId);

        // دمج بيانات المدن
        Object.entries(record.data).forEach(([cityName, stats]) => {
            if (!grouped[disease].cities[cityName]) {
                // تهيئة العدادات بـ 0 للمدينة الجديدة
                let zeroStats = {};
                AGE_GROUPS.forEach(g => { zeroStats[`M_${g.key}`] = 0; zeroStats[`F_${g.key}`] = 0; });
                grouped[disease].cities[cityName] = zeroStats;
            }

            // جمع الأرقام
            AGE_GROUPS.forEach(g => {
                grouped[disease].cities[cityName][`M_${g.key}`] += (stats[`M_${g.key}`] || 0);
                grouped[disease].cities[cityName][`F_${g.key}`] += (stats[`F_${g.key}`] || 0);
            });
        });
    });
    return grouped;
}

// دالة الرسم (Tailwind CSS)
function renderTables(dataToRender) {
    const container = document.getElementById('printArea');
    container.innerHTML = ''; // تنظيف المنطقة

    const groupedData = processData(dataToRender);

    Object.values(groupedData).forEach(group => {
        // ترتيب الأشهر للعرض في العنوان
        const sortedMonths = Array.from(group.months).sort();
        const dateRange = sortedMonths.join(' - ');

        // div حاوية لتنسيق الطباعة
        const wrapper = document.createElement('div');
        wrapper.className = "mb-10 break-inside-avoid";

        // العنوان
        const header = document.createElement('div');
        header.className = "text-xl font-bold text-gray-800 border-b-2 border-[#1a2b3c] pb-1 mb-4 uppercase mt-6";
        header.textContent = `${group.name} : ${dateRange}`;
        wrapper.appendChild(header);

        // الجدول
        const table = document.createElement('table');
        table.className = "w-full border-collapse border border-gray-300 text-[10px] md:text-[11px] text-center table-fixed";

        // الرأس (Thead)
        // let theadHTML = `
        //         <thead>
        //             <tr class="text-white bg-[#1a2b3c]">
        //                 <th rowspan="2" class="border border-gray-500 p-1 align-middle w-32">EPSP / COMMUNE</th>
        //                 ${AGE_GROUPS.map(g => `<th colspan="2" class="border border-gray-500 p-1">${g.label}</th>`).join('')}
        //                 <th colspan="2" class="border border-gray-500 p-1 bg-[#fcd96d] text-black font-bold">TOTAL</th>
        //                 <th rowspan="2" class="border border-gray-500 p-1 bg-[#fbc02d] text-black font-bold align-middle w-14">TOTAL<br>GEN</th>
        //             </tr>
        //             <tr class="text-white bg-[#1a2b3c]">
        //                 ${AGE_GROUPS.map(() => `<th class="border border-gray-500 p-0.5">M</th><th class="border border-gray-500 p-0.5">F</th>`).join('')}
        //                 <th class="border border-gray-500 p-1 bg-[#fcd96d] text-black font-bold">M</th>
        //                 <th class="border border-gray-500 p-1 bg-[#fcd96d] text-black font-bold">F</th>
        //             </tr>
        //         </thead>
        //     `;
        let theadHTML = `
                <thead>
                    <tr class=" ">
                        <th rowspan="2" class="border border-gray-500 p-1 align-middle w-32">EPSP / COMMUNE</th>
                        ${AGE_GROUPS.map(g => `<th colspan="2" class="border border-gray-500 p-1">${g.label}</th>`).join('')}
                        <th colspan="2" class="border border-gray-500 p-1  text-black font-bold">TOTAL</th>
                        <th rowspan="2" class="border border-gray-500 p-1  text-black font-bold align-middle w-14">TOTAL<br>GEN</th>
                    </tr>
                    <tr class="">
                        ${AGE_GROUPS.map(() => `<th class="border border-gray-500 p-0.5">M</th><th class="border border-gray-500 p-0.5">F</th>`).join('')}
                        <th class="border border-gray-500 p-1  text-black font-bold">M</th>
                        <th class="border border-gray-500 p-1  text-black font-bold">F</th>
                    </tr>
                </thead>
            `;

        // الجسم (Tbody)
        let tbodyHTML = '<tbody>';
        let colTotals = {};
        AGE_GROUPS.forEach(g => { colTotals[`M_${g.key}`] = 0; colTotals[`F_${g.key}`] = 0; });
        let grandM = 0, grandF = 0, grandAll = 0;

        // ترتيب المدن أبجدياً
        const sortedCities = Object.entries(group.cities).sort((a, b) => a[0].localeCompare(b[0]));

        sortedCities.forEach(([cityName, stats], index) => {
            const formattedName = cityName.replace(/___/g, ' : ').replace(/_/g, ' ').replace('Gharda a', 'Ghardaïa');
            const bgClass = index % 2 === 0 ? 'bg-white' : 'bg-gray-50';

            let rowHTML = `<tr class="${bgClass} text-gray-700 hover:bg-gray-100">`;
            rowHTML += `<td class="border border-gray-300 p-1 text-left font-bold pl-2 truncate">${formattedName}</td>`;

            let rowM = 0, rowF = 0;

            AGE_GROUPS.forEach(g => {
                const m = stats[`M_${g.key}`];
                const f = stats[`F_${g.key}`];
                colTotals[`M_${g.key}`] += m;
                colTotals[`F_${g.key}`] += f;
                rowM += m;
                rowF += f;
                rowHTML += `<td class="border border-gray-300 p-1">${m > 0 ? m : '0'}</td><td class="border border-gray-300 p-1">${f > 0 ? f : '0'}</td>`;
            });

            const rowTotal = rowM + rowF;
            grandM += rowM; grandF += rowF; grandAll += rowTotal;

            rowHTML += `<td class="border border-gray-300 p-1  font-bold text-black">${rowM}</td>`; // bg-[#fcd96d]
            rowHTML += `<td class="border border-gray-300 p-1  font-bold text-black">${rowF}</td>`; // bg-[#fcd96d]
            rowHTML += `<td class="border border-gray-300 p-1  font-bold text-black">${rowTotal}</td>`; // bg-[#fbc02d]
            rowHTML += '</tr>';
            tbodyHTML += rowHTML;
        });
        tbodyHTML += '</tbody>';

        // التذييل (Tfoot) bg-[#d4a017] bg-[#b8860b]
        let tfootHTML = `
                <tfoot>
                    <tr class=" text-black font-bold text-xs">
                        <td class="border border-[#b8860b] p-1">TOTAL</td>
                        ${AGE_GROUPS.map(g => `
                            <td class="border border-[#b8860b] p-1">${colTotals[`M_${g.key}`]}</td>
                            <td class="border border-[#b8860b] p-1">${colTotals[`F_${g.key}`]}</td>
                        `).join('')}
                        <td class="border border-[#b8860b] p-1">${grandM}</td>
                        <td class="border border-[#b8860b] p-1">${grandF}</td>
                        <td class="border border-[#b8860b] p-1 text-green-900 ">${grandAll}</td> 
                    </tr>
                </tfoot>
            `;

        table.innerHTML = theadHTML + tbodyHTML + tfootHTML;
        wrapper.appendChild(table);
        container.appendChild(wrapper);
    });
}

window.generateBatchReport = function () {


    // 1. Get Selections
    const type = document.getElementById('exportTypeSelect').value;

    // Get checked periods
    const periodInputs = document.querySelectorAll('#exportPeriodContainer input[type="checkbox"]:checked');
    const selectedPeriods = Array.from(periodInputs).map(i => ({ value: i.value, label: i.nextSibling.textContent }));

    // Get checked diseases
    const diseaseInputs = document.querySelectorAll('#exportDiseaseContainer input[type="checkbox"]:checked');
    const selectedDiseases = Array.from(diseaseInputs).map(i => ({ value: i.value, label: i.nextSibling.textContent }));

    if (selectedPeriods.length === 0 || selectedDiseases.length === 0) {
        printArea.innerHTML = '<p class="text-red-500 text-center font-bold">Please select at least one Time Period and one Disease.</p>';
        return;
    }


    let filteredData = {};
    let hasData = false;

    // نستخرج القيم فقط من المصفوفات التي قمت أنت بإنشائها
    const pValues = selectedPeriods.map(p => p.value); // ['2025-11', '2025-12'...]
    const dValues = selectedDiseases.map(d => d.value); // ['Brucellose', ...]

    // البحث في قاعدة البيانات (window.allMonthlyData) عن التطابقات
    pValues.forEach(period => {
        dValues.forEach(disease => {
            // تكوين المفتاح المتوقع (يجب أن يطابق هيكلة بياناتك)
            const key = `${period}_${disease}`;

            if (window.allMonthlyData[key]) {
                filteredData[key] = window.allMonthlyData[key];
                hasData = true;
            }
        });
    });

    if (!hasData) {
        document.getElementById('printArea').innerHTML = `
            <div class="text-gray-500 text-center font-bold bg-gray-50 p-6 rounded-lg border border-gray-200">
                No data found for the selected combination.
            </div>`;
        return;
    }

    renderTables(filteredData);

}



// --- ADMIN TOOLS, GRID RENDERING, and CALCULATION LOGIC ---

window.renderConfigLists = function () {
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

window.addDisease = function () {
    const input = document.getElementById('newDiseaseInput');
    let name = input.value.trim();
    if (!name) return;

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

window.deleteDisease = function (id) {
    window.DISEASES = window.DISEASES.filter(d => d !== id);
    window.saveConfig();
};

window.addLocation = function () {
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

window.deleteLocation = function (name) {
    window.LOCATIONS = window.LOCATIONS.filter(l => l !== name);
    window.saveConfig();
};

window.populateFilterDropdowns = function () {
    const entrySelect = document.getElementById('entryDiseaseSelect');
    const reportSelect = document.getElementById('reportDiseaseSelect');

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
        if (currentVal && Array.from(select.options).some(opt => opt.value === currentVal)) {
            select.value = currentVal;
        } else if (!includeAll && window.DISEASES.length > 0) {
            select.value = window.DISEASES[0];
        } else if (includeAll) {
            select.value = 'all';
        }
    };

    populate(entrySelect, false);
    populate(reportSelect, true);
};

window.saveConfig = async function () {
    const payload = {
        diseases: window.DISEASES,
        locations: window.LOCATIONS,
    };

    try {
        const result = await makeApiCall('/user/config', 'POST', payload);
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

window.renderGridStructure = function (tableId, isInput = true) {
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

window.renderEntryGrid = function () {
    window.renderGridStructure('dataGrid', true);
    window.calculateTotals('dataGrid');
};

window.renderReportGrid = function () {
    window.renderGridStructure('reportGrid', false);
    window.calculateTotals('reportGrid');
};

window.clearGridInputs = function () {
    document.querySelectorAll('#dataGrid .data-input').forEach(input => {
        input.value = 0;
    });
    window.calculateTotals('dataGrid');
};

window.loadDataIntoGrid = function (data, tableId) {
    const isInput = tableId === 'dataGrid';

    // 1. Clear previous data/inputs
    if (isInput) {
        window.clearGridInputs();
    } else {
        // Clear all report data cells, but leave sticky columns and totals alone for now
        document.querySelectorAll('#reportGrid td').forEach(td => {
            if (td.id && (td.id.startsWith('report_') || td.id.startsWith('row_total_') || td.id.startsWith('col_total_') || td.id.startsWith('grand_total_'))) {
                // Check if it's a report data cell (e.g., report_loc_M_0_1)
                if (td.id.startsWith('report_')) {
                    td.textContent = '0';
                }
            }
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

window.calculateTotals = function (tableId) {
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
};

window.collectGridData = function () {
    const data = {};

    window.LOCATIONS.forEach(location => {
        const locationId = location.replace(/[^a-zA-Z0-9]/g, '_');
        data[locationId] = {};

        // Flag to track if this location has any non-zero data
        let hasData = false;

        AGE_INTERVALS.forEach(interval => {
            const keyM = `M_${interval}`;
            const keyF = `F_${interval}`;
            const mInput = document.getElementById(`input_${locationId}_${keyM}`);
            const fInput = document.getElementById(`input_${locationId}_${keyF}`);

            const mCount = parseInt(mInput ? mInput.value : 0) || 0;
            const fCount = parseInt(fInput ? fInput.value : 0) || 0;

            data[locationId][keyM] = mCount;
            data[locationId][keyF] = fCount;

            if (mCount > 0 || fCount > 0) {
                hasData = true;
            }
        });

        // Optional: Remove location entry if all data is zero
        if (!hasData) {
            delete data[locationId];
        }
    });
    return data;
};
