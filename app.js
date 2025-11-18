// --- Configuration and Global State ---

// FIX: Changed from a relative path to the absolute URL of the deployed Worker API
const API_BASE_URL = 'https://mehidistatics-api.ferhathamza17.workers.dev/api/v1'; 

// This simulates the user authentication ID provided by the environment
const userId = typeof __app_id !== 'undefined' ? `user-${__app_id}` : 'guest-user-1234'; 

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
window.loadConfigAndRerender = async function() {
    const result = await makeApiCall('/config');
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
 * Defines the available report periods (Q1, S1, etc.) for aggregation.
 */
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
      
      window.updateReportFilters();
}

/**
 * Updates the Period dropdown based on the selected Report Type.
 */
window.updateReportFilters = function() {
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

// --- D3 CHARTING LOGIC ---
/**
/**
 * Prepares data and calls the specific chart rendering functions.
 */
window.renderCharts = function(aggregatedData, diseaseFilter, periodValue) {
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
window.renderCharts = function(aggregatedData, diseaseFilter, periodValue) {
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

    chartDiv.append('h3').attr('class', 'text-lg font-bold text-center mb-1 text-gray-800').text('Comparison of Median Case Counts by Location');
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
window.renderCharts = function(aggregatedData, diseaseFilter, periodValue) {
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

    // 2. Age and Sex Distribution by Location Chart (New Chart)
    if (locationAgeSexData.length > 0) {
        // We use the aggregated data for the detailed distribution chart
        renderAgeSexByLocationChart(chartsRow, locationAgeSexData, title);
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
 * Renders the Age and Sex Distribution by Location using a Grouped Stacked Bar Chart.
 */
function renderAgeSexByLocationChart(container, rawData, title) {
    // Increased bottom margin for Age Interval rotation
    const margin = { top: 30, right: 30, bottom: 80, left: 60 };
    const chartWidth = 900; 
    const chartHeight = 500;
    const width = chartWidth - margin.left - margin.right;
    const height = chartHeight - margin.top - margin.bottom;

    // 1. Prepare Stacked Data
    const locations = Array.from(new Set(rawData.map(d => d.location)));
    const ageIntervals = Array.from(new Set(rawData.map(d => d.interval)));

    // Group data by location, then by age interval
    const dataByLocation = d3.group(rawData, d => d.location);
    
    // Create a stack generator for M and F
    const stack = d3.stack().keys(GENDERS);

    // Prepare data for stacking for each location
    const stackedDataByLocation = new Map();
    dataByLocation.forEach((data, location) => {
        // We must flatten the data for d3.stack()
        const groupedForStack = data.map(d => ({
            interval: d.interval,
            M: d.M,
            F: d.F,
            Total: d.Total
        }));
        stackedDataByLocation.set(location, stack(groupedForStack));
    });

    // 2. Setup Scales
    const maxTotalCount = d3.max(rawData, d => d.M + d.F);
    
    // X Scale (Case Count)
    const x = d3.scaleLinear()
        .range([0, width])
        .domain([0, maxTotalCount * 1.1]);

    // Y Scale (Age Intervals - Inner Band)
    const yInner = d3.scaleBand()
        .domain(ageIntervals)
        .range([height, 0])
        .padding(0.1);

    // Z Scale (Color for Sex)
    const z = d3.scaleOrdinal()
        .domain(GENDERS)
        .range(['#3b82f6', '#ec4899']); // Blue for Male, Pink for Female

    // Create the container div
    const chartDiv = container.append('div')
        .attr('class', 'p-4 bg-white rounded-xl shadow-lg m-4 w-full');

    chartDiv.append('h3').attr('class', 'text-lg font-bold text-center mb-1 text-gray-800').text('Age and Sex Distribution by Location');
    chartDiv.append('p').attr('class', 'text-sm text-center text-gray-600 mb-4').text(title);

    const svg = chartDiv.append('svg')
        .attr('viewBox', `0 0 ${chartWidth} ${chartHeight}`)
        .attr('width', '100%')
        .attr('height', '100%')
        .append('g')
        .attr('transform', `translate(${margin.left}, ${margin.top})`);
    
    // 3. Axes
    
    // X-Axis (Count)
    svg.append('g')
        .attr('transform', `translate(0,${height})`)
        .call(d3.axisBottom(x).ticks(5).tickFormat(d3.format("d")));

    // X-Axis Label
    svg.append("text")
        .attr("y", height + margin.bottom - 5)
        .attr("x", width / 2) 
        .attr("fill", "gray")
        .style("text-anchor", "middle")
        .style("font-size", "12px")
        .text("Case Count");

    // Y-Axis (Age Intervals)
    svg.append('g')
        .call(d3.axisLeft(yInner))
        .selectAll("text")
        .style("font-size", "12px"); 
        
    // Y-Axis Label
    svg.append("text")
        .attr("transform", "rotate(-90)")
        .attr("y", 0 - margin.left + 5)
        .attr("x", 0 - (height / 2))
        .attr("dy", "1em")
        .style("text-anchor", "middle")
        .style("font-size", "12px")
        .text("Age Intervals");

    // 4. Draw Facets (Small Multiples)
    
    // Split the chart width among the locations
    const locationFacetWidth = width / locations.length;

    const locationGroup = svg.selectAll(".location-facet")
        .data(locations)
        .enter()
        .append("g")
        .attr("class", "location-facet")
        .attr("transform", (d, i) => `translate(${i * locationFacetWidth}, 0)`);
        
    // Scale X inside each facet (since total case count differs by age interval, this keeps the alignment consistent)
    const xFacet = d3.scaleLinear()
        .domain([0, maxTotalCount * 1.1]) // Global max for consistent bar scaling
        .range([0, locationFacetWidth - 10]); // Subtract padding

    // Add Separator Lines
    locationGroup.append("line")
        .attr("x1", 0)
        .attr("x2", 0)
        .attr("y1", 0)
        .attr("y2", height)
        .attr("stroke", "#e5e7eb")
        .attr("stroke-dasharray", "2");

    // Add Location Title
    locationGroup.append("text")
        .attr("x", locationFacetWidth / 2)
        .attr("y", -5)
        .attr("text-anchor", "middle")
        .attr("font-weight", "bold")
        .attr("fill", "#1f2937")
        .text(d => d);

    // Draw the stacked bars within each location facet
    locationGroup.each(function(location) {
        const stackedBars = stackedDataByLocation.get(location);
        
        d3.select(this).selectAll(".age-group")
            .data(stackedBars)
            .enter()
            .append("g")
            .attr("fill", d => z(d.key))
            .attr("class", "age-group")
            .selectAll("rect")
            .data(d => d)
            .enter()
            .append("rect")
            .attr("y", d => yInner(d.data.interval))
            .attr("x", d => xFacet(d[0])) // Start position
            .attr("height", yInner.bandwidth())
            .attr("width", d => xFacet(d[1]) - xFacet(d[0])); // End position - Start position
    });
    
    // 5. Add Legend for Gender
    const legend = svg.append("g")
        .attr("transform", `translate(${width - 120}, ${height + 40})`); // Position far right below chart

    GENDERS.forEach((gender, i) => {
        const legendItem = legend.append("g")
            .attr("transform", `translate(${i * 60}, 0)`);

        legendItem.append("rect")
            .attr("width", 12)
            .attr("height", 12)
            .attr("fill", z(gender))
            .attr("rx", 2);

        legendItem.append("text")
            .attr("x", 18)
            .attr("y", 10)
            .attr("fill", "gray")
            .style("font-size", "12px")
            .text(gender === 'M' ? 'Male' : 'Female');
    });
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




// --- MOCK GLOBAL VARIABLES (Define these based on your actual data) ---
window.LOCATIONS = [
    "A: Main Hospital", "B: East Clinic", "C: West Satellite"
];
window.AGE_INTERVALS = [
    "0_10", "11_20", "21_30", "31_40", "41_50", "51_60", "61_plus"
];
window.DISEASES = [
    "Flu", "Rhinovirus", "RSV", "COVID-19", "Norovirus"
];
const GENDERS = ['M', 'F'];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const YEARS = ["2022", "2023", "2024"];

// --- D3 CHARTING LOGIC ---

/**
 * Entry point: Prepares data and calls all 15 specific chart rendering functions.
 */
window.renderCharts = function(aggregatedData, diseaseFilter, periodValue) {
    const chartContainer = d3.select('#reportCharts');
    chartContainer.html(''); // Clear previous charts
    const chartsRow = chartContainer.append('div').attr('class', 'flex flex-wrap justify-center items-stretch w-full');
    
    // --- Data Aggregation and Mocking for all 15 Charts ---
    
    // Total Cases by Age, Sex, and Location from input data
    let totalCases = 0;
    const locationSexAgeSummary = [];
    const locationSexSummary = {};

    window.LOCATIONS.forEach(location => {
        const locName = location.split(':').length > 1 ? location.split(':')[1].trim() : location;
        const locationId = location.replace(/[^a-zA-Z0-9]/g, '_');
        
        let locTotal = { M: 0, F: 0 };
        
        AGE_INTERVALS.forEach((interval) => {
            const mCount = aggregatedData[locationId]?.[`M_${interval}`] || 0;
            const fCount = aggregatedData[locationId]?.[`F_${interval}`] || 0;
            
            if (mCount > 0 || fCount > 0) {
                locationSexAgeSummary.push({ 
                    location: locName, 
                    interval: interval.replace(/_/g, '-').replace('plus', '+'),
                    M: mCount,
                    F: fCount,
                    Total: mCount + fCount
                });
                locTotal.M += mCount;
                locTotal.F += fCount;
                totalCases += mCount + fCount;
            }
        });
        locationSexSummary[locName] = locTotal;
    });

    // Mock Data for Disease, Time, and other required dimensions (Crucial for most charts)
    const DISEASE_TIME_DATA = [];
    const POPULATION_BY_LOCATION = {}; // Used for Incidence Rate
    const DISEASE_SEX_DATA = {};
    const DISEASE_AGE_DATA = {};

    window.DISEASES.forEach(disease => {
        let diseaseTotalM = 0;
        let diseaseTotalF = 0;
        
        window.AGE_INTERVALS.forEach(age => {
            // Assign random mock cases for each disease * age combination
            const countM = Math.floor(Math.random() * 100) + 1;
            const countF = Math.floor(Math.random() * 100) + 1;
            
            // For Disease x Sex
            diseaseTotalM += countM;
            diseaseTotalF += countF;
            
            // For Disease x Age Interval Heatmap
            DISEASE_AGE_DATA[`${disease}_${age}`] = { M: countM, F: countF };
        });
        
        DISEASE_SEX_DATA[disease] = { M: diseaseTotalM, F: diseaseTotalF };

        // Mock Time data for Trend lines and Seasonality
        YEARS.forEach(year => {
            MONTHS.forEach((month, index) => {
                // Mock case counts for the Line/Seasonality charts
                const cases = Math.floor(Math.random() * (disease === 'Flu' ? 150 : 50)) + 10;
                DISEASE_TIME_DATA.push({ 
                    disease, 
                    year: +year, 
                    monthIndex: index, 
                    monthName: month, 
                    cases 
                });
            });
        });
    });

    // Mock Population data (for Incidence Rate)
    window.LOCATIONS.forEach(location => {
        const locName = location.split(':')[1].trim();
        POPULATION_BY_LOCATION[locName] = Math.floor(Math.random() * 50000) + 10000; 
    });
    
    // Update the total count display
    document.getElementById('reportTotalCount').textContent = `Report Total: ${totalCases} Cases (from selected input data) + ${d3.sum(Object.values(DISEASE_SEX_DATA), d => d.M + d.F)} (from mock disease data)`;

    const title = `${diseaseFilter === 'all' ? 'All Diseases' : diseaseFilter.replace(/_/g, ' ')} Report for ${periodValue.replace(/_/g, ' - ')}`;

    // --- Chart Rendering Calls (Arranged for best visual flow) ---
    
    // Row 1: Key Distributions (Heatmaps/Comparison)
    renderDiseaseAgeHeatmap(chartsRow, DISEASE_AGE_DATA, title); // Cases by Disease × Age Interval (Heatmap)
    renderLocationDiseaseStackedBar(chartsRow, locationSexAgeSummary, title); // Cases by Location × Disease (Stacked bar/Mini-Heatmap)
    renderCorrelationHeatmap(chartsRow, window.DISEASES, title); // Correlation Matrix Between Diseases (Heatmap)

    // Row 2: Demographic Details
    renderTotalSexComparison(chartsRow, DISEASE_SEX_DATA, title); // SEX (F/M) COMPARATIVE CHARTS - Total F vs M Cases (Simple bar)
    renderDiseaseSexGroupedBar(chartsRow, DISEASE_SEX_DATA, title); // Cases by Disease × Sex (Grouped bar)
    renderSexPerDiseaseGroupedBar(chartsRow, DISEASE_SEX_DATA, title); // F/M per Disease (Grouped bar)
    renderSexPerLocationGroupedBar(chartsRow, locationSexSummary, title); // F/M per Location (Bar chart)

    // Row 3: Trends and Time Series
    renderMonthlyTrendLine(chartsRow, DISEASE_TIME_DATA, title); // Cases per Month (Trend Line)
    renderQuarterlyBars(chartsRow, DISEASE_TIME_DATA, title); // Quarterly Evolution (4 bars)
    renderAnnualTrendLine(chartsRow, DISEASE_TIME_DATA, title); // Annual Evolution (Multi-year line chart)
    renderSeasonalityHeatmap(chartsRow, DISEASE_TIME_DATA, title); // Disease Seasonality (Heatmap)

    // Row 4: Totals and Rates
    renderDiseaseBarChart(chartsRow, DISEASE_SEX_DATA, title); // Cases by Disease (Bar chart)
    renderIncidenceRateTrend(chartsRow, locationSexSummary, POPULATION_BY_LOCATION, title); // Incidence Rate (Line or bar)

};

/** Utility function for common chart setup */
function setupChart(container, chartTitle, subtitle, width, height) {
    const margin = { top: 40, right: 30, bottom: 60, left: 80 };
    const chartDiv = container.append('div')
        .attr('class', 'p-4 bg-white rounded-xl shadow-lg m-4 flex-shrink-0')
        .style('width', `${width}px`);

    chartDiv.append('h3').attr('class', 'text-lg font-bold text-center mb-1 text-gray-800').text(chartTitle);
    chartDiv.append('p').attr('class', 'text-sm text-center text-gray-600 mb-4').text(subtitle);

    const svg = chartDiv.append('svg')
        .attr('viewBox', `0 0 ${width} ${height}`)
        .append('g')
        .attr('transform', `translate(${margin.left}, ${margin.top})`);
    
    return { svg, width: width - margin.left - margin.right, height: height - margin.top - margin.bottom, margin };
}

// ----------------------------------------------------
// CHART IMPLEMENTATIONS (15 Charts)
// ----------------------------------------------------

// 1. Cases by Disease × Age Interval - Chart: Heatmap
function renderDiseaseAgeHeatmap(container, data, subtitle) {
    const { svg, width, height, margin } = setupChart(container, 'Cases by Disease × Age Interval (Heatmap)', subtitle, 600, 450);
    
    const heatmapData = [];
    window.DISEASES.forEach(disease => {
        window.AGE_INTERVALS.forEach(age => {
            const counts = data[`${disease}_${age}`] || { M: 0, F: 0 };
            heatmapData.push({ 
                disease, 
                age: age.replace(/_/g, '-').replace('plus', '+'), 
                count: counts.M + counts.F 
            });
        });
    });

    const x = d3.scaleBand().range([0, width]).domain(window.DISEASES).padding(0.05);
    const y = d3.scaleBand().range([height, 0]).domain(window.AGE_INTERVALS.map(a => a.replace(/_/g, '-').replace('plus', '+'))).padding(0.05);
    const color = d3.scaleSequential(d3.interpolateViridis).domain([0, d3.max(heatmapData, d => d.count)]);

    svg.append("g").attr("transform", `translate(0,${height})`).call(d3.axisBottom(x)).selectAll("text").style("text-anchor", "end").attr("transform", "rotate(-25)");
    svg.append("g").call(d3.axisLeft(y));

    svg.selectAll()
        .data(heatmapData)
        .enter()
        .append("rect")
        .attr("x", d => x(d.disease))
        .attr("y", d => y(d.age))
        .attr("width", x.bandwidth())
        .attr("height", y.bandwidth())
        .style("fill", d => color(d.count))
        .append("title").text(d => `${d.disease}, Age ${d.age}: ${d.count} cases`);
}

// 2. Cases by Location × Disease - Chart: Stacked bar
function renderLocationDiseaseStackedBar(container, data, subtitle) {
    const { svg, width, height, margin } = setupChart(container, 'Cases by Location × Disease (Stacked Bar)', subtitle, 600, 450);

    // This mock uses the locationSexAgeSummary to create a mock "Disease" column for demonstration
    // In a real app, this data would be aggregated differently.
    const locationDiseaseData = d3.rollups(
        data, 
        v => d3.sum(v, d => d.Total), 
        d => d.location, 
        d => window.DISEASES[Math.floor(Math.random() * window.DISEASES.length)] // Mock disease association
    ).map(([location, diseaseRollups]) => {
        const obj = { location };
        diseaseRollups.forEach(([disease, count]) => { obj[disease] = count; });
        return obj;
    }).filter(d => Object.keys(d).length > 1);

    if (locationDiseaseData.length === 0) {
        svg.append("text").attr("x", width/2).attr("y", height/2).text("No location/disease data to display.");
        return;
    }

    const keys = window.DISEASES;
    const stackedData = d3.stack().keys(keys)(locationDiseaseData);

    const x = d3.scaleBand().domain(locationDiseaseData.map(d => d.location)).range([0, width]).padding(0.1);
    const yMax = d3.max(stackedData[stackedData.length - 1], d => d[1]);
    const y = d3.scaleLinear().domain([0, yMax]).range([height, 0]);
    const z = d3.scaleOrdinal(d3.schemeCategory10).domain(keys);

    svg.append("g").attr("transform", `translate(0,${height})`).call(d3.axisBottom(x)).selectAll("text").style("text-anchor", "end").attr("transform", "rotate(-25)");
    svg.append("g").call(d3.axisLeft(y).ticks(5).tickFormat(d3.format("d")));

    svg.append("g")
        .selectAll("g")
        .data(stackedData)
        .join("g")
        .attr("fill", d => z(d.key))
        .selectAll("rect")
        .data(d => d)
        .join("rect")
        .attr("x", d => x(d.data.location))
        .attr("y", d => y(d[1]))
        .attr("height", d => y(d[0]) - y(d[1]))
        .attr("width", x.bandwidth())
        .append("title").text(d => `Location: ${d.data.location}, Disease: ${d3.select(this.parentNode).datum().key}, Cases: ${d[1] - d[0]}`);

    // Legend (using the keys for color)
    const legend = svg.append("g").attr("transform", `translate(${width - 150}, ${-30})`);
    keys.forEach((key, i) => {
        legend.append("rect").attr("x", 0).attr("y", i * 15).attr("width", 10).attr("height", 10).attr("fill", z(key));
        legend.append("text").attr("x", 15).attr("y", i * 15 + 9).text(key).style("font-size", "10px");
    });
}

// 3. Bubble chart or multi-bar chart - Cases per Location × Age Interval (Grouped Bar)
function renderLocationAgeGroupedBar(container, data, subtitle) {
    const { svg, width, height } = setupChart(container, 'Cases per Location × Age Interval (Grouped Bar)', subtitle, 600, 450);

    const locations = Array.from(new Set(data.map(d => d.location)));
    const ageIntervals = Array.from(new Set(data.map(d => d.interval)));

    // Grouped data: sum M and F for total cases per location/age interval
    const groupedData = d3.rollups(data, v => d3.sum(v, d => d.Total), d => d.location, d => d.interval)
        .map(([location, ageRollups]) => {
            const obj = { location };
            ageRollups.forEach(([interval, count]) => { obj[interval] = count; });
            return obj;
        });

    const x0 = d3.scaleBand().domain(locations).rangeRound([0, width]).paddingInner(0.1);
    const x1 = d3.scaleBand().domain(ageIntervals).rangeRound([0, x0.bandwidth()]).padding(0.05);
    const yMax = d3.max(groupedData, d => d3.max(ageIntervals, key => d[key] || 0));
    const y = d3.scaleLinear().domain([0, yMax]).rangeRound([height, 0]);
    const z = d3.scaleOrdinal(d3.schemePastel1).domain(ageIntervals);

    svg.append("g")
        .selectAll("g")
        .data(groupedData)
        .join("g")
        .attr("transform", d => `translate(${x0(d.location)},0)`)
        .selectAll("rect")
        .data(d => ageIntervals.map(key => ({ key, value: d[key] || 0, location: d.location })))
        .join("rect")
        .attr("x", d => x1(d.key))
        .attr("y", d => y(d.value))
        .attr("width", x1.bandwidth())
        .attr("height", d => height - y(d.value))
        .attr("fill", d => z(d.key))
        .append("title").text(d => `${d.location}, Age ${d.key}: ${d.value} cases`);

    svg.append("g").attr("transform", `translate(0,${height})`).call(d3.axisBottom(x0));
    svg.append("g").call(d3.axisLeft(y).ticks(5).tickFormat(d3.format("d")));

    // Legend for Age Intervals
    const legend = svg.append("g").attr("transform", `translate(${width - 150}, ${-30})`);
    ageIntervals.forEach((age, i) => {
        legend.append("rect").attr("x", 0).attr("y", i * 15).attr("width", 10).attr("height", 10).attr("fill", z(age));
        legend.append("text").attr("x", 15).attr("y", i * 15 + 9).text(age).style("font-size", "10px");
    });
}

// 4. Cases per Month (Trend Line) - Line chart
function renderMonthlyTrendLine(container, data, subtitle) {
    const { svg, width, height } = setupChart(container, 'Cases per Month Trend Line', subtitle, 600, 450);

    const monthlyData = d3.rollups(data, v => d3.sum(v, d => d.cases), d => d.monthName).map(([monthName, total]) => ({ monthName, total }));
    // Ensure data is sorted by month index for correct line plotting
    monthlyData.sort((a, b) => MONTHS.indexOf(a.monthName) - MONTHS.indexOf(b.monthName));

    const x = d3.scalePoint().range([0, width]).domain(MONTHS);
    const yMax = d3.max(monthlyData, d => d.total);
    const y = d3.scaleLinear().domain([0, yMax * 1.1]).range([height, 0]);

    svg.append("g").attr("transform", `translate(0,${height})`).call(d3.axisBottom(x));
    svg.append("g").call(d3.axisLeft(y).ticks(5).tickFormat(d3.format("d")));

    const line = d3.line().x(d => x(d.monthName)).y(d => y(d.total));

    svg.append("path")
        .datum(monthlyData)
        .attr("fill", "none")
        .attr("stroke", "#3b82f6")
        .attr("stroke-width", 2.5)
        .attr("d", line);

    svg.selectAll(".dot")
        .data(monthlyData)
        .enter().append("circle")
        .attr("class", "dot")
        .attr("cx", d => x(d.monthName))
        .attr("cy", d => y(d.total))
        .attr("r", 4)
        .attr("fill", "#3b82f6")
        .append("title").text(d => `${d.monthName}: ${d.total} cases`);
}

// 5. Quarterly Evolution - 4 bars (Q1, Q2, Q3, Q4)
function renderQuarterlyBars(container, data, subtitle) {
    const { svg, width, height } = setupChart(container, 'Quarterly Evolution (Total Cases)', subtitle, 450, 450);
    
    const quarterData = d3.rollups(
        data, 
        v => d3.sum(v, d => d.cases), 
        d => `Q${Math.floor(d.monthIndex / 3) + 1}`
    ).map(([quarter, total]) => ({ quarter, total }));

    const quarters = ["Q1", "Q2", "Q3", "Q4"];
    
    const x = d3.scaleBand().domain(quarters).range([0, width]).padding(0.1);
    const yMax = d3.max(quarterData, d => d.total);
    const y = d3.scaleLinear().domain([0, yMax * 1.1]).range([height, 0]);
    
    svg.append("g").attr("transform", `translate(0,${height})`).call(d3.axisBottom(x));
    svg.append("g").call(d3.axisLeft(y).ticks(5).tickFormat(d3.format("d")));

    svg.selectAll(".bar")
        .data(quarterData)
        .enter().append("rect")
        .attr("class", "bar")
        .attr("x", d => x(d.quarter))
        .attr("y", d => y(d.total))
        .attr("width", x.bandwidth())
        .attr("height", d => height - y(d.total))
        .attr("fill", "#10b981")
        .append("title").text(d => `${d.quarter}: ${d.total} cases`);
}

// 6. Annual Evolution - Multi-year line chart
function renderAnnualTrendLine(container, data, subtitle) {
    const { svg, width, height } = setupChart(container, 'Annual Cases Trend by Disease', subtitle, 600, 450);

    const diseases = window.DISEASES;
    const timePoints = YEARS.flatMap(year => MONTHS.map(month => ({ year, month })));
    
    const series = d3.groups(data, d => d.disease).map(([disease, values]) => ({
        disease,
        values: timePoints.map(({ year, month }) => {
            const d = values.find(v => v.year === +year && v.monthName === month);
            return { year, month, cases: d ? d.cases : 0, timeLabel: `${month} ${year}` };
        }).filter(d => d.cases > 0)
    })).filter(d => d.values.length > 0);

    const allTimeLabels = Array.from(new Set(series.flatMap(s => s.values.map(v => v.timeLabel))));

    const x = d3.scalePoint().range([0, width]).domain(allTimeLabels);
    const yMax = d3.max(series, s => d3.max(s.values, d => d.cases));
    const y = d3.scaleLinear().domain([0, yMax * 1.1]).range([height, 0]);
    const z = d3.scaleOrdinal(d3.schemeCategory10).domain(diseases);

    svg.append("g").attr("transform", `translate(0,${height})`).call(d3.axisBottom(x).tickValues(x.domain().filter((d, i) => i % 6 === 0))).selectAll("text").style("text-anchor", "end").attr("transform", "rotate(-45)");
    svg.append("g").call(d3.axisLeft(y).ticks(5).tickFormat(d3.format("d")));

    const line = d3.line().x(d => x(d.timeLabel)).y(d => y(d.cases));

    svg.selectAll(".disease-line")
        .data(series)
        .join("path")
        .attr("class", "disease-line")
        .attr("fill", "none")
        .attr("stroke", d => z(d.disease))
        .attr("stroke-width", 2)
        .attr("d", d => line(d.values));
        
    // Legend
    const legend = svg.append("g").attr("transform", `translate(${width - 100}, ${-30})`);
    diseases.forEach((disease, i) => {
        legend.append("rect").attr("x", 0).attr("y", i * 15).attr("width", 10).attr("height", 10).attr("fill", z(disease));
        legend.append("text").attr("x", 15).attr("y", i * 15 + 9).text(disease).style("font-size", "10px");
    });
}

// 7. Disease Seasonality - Chart: Heatmap (Months × Years)
function renderSeasonalityHeatmap(container, data, subtitle) {
    const { svg, width, height } = setupChart(container, 'Disease Seasonality (Cases by Month × Year)', subtitle, 600, 450);

    const seasonalityData = d3.rollups(data, v => d3.sum(v, d => d.cases), d => d.year, d => d.monthName)
        .flatMap(([year, monthRollups]) => monthRollups.map(([monthName, count]) => ({ year, monthName, count })));
    
    const x = d3.scaleBand().range([0, width]).domain(YEARS).padding(0.05);
    const y = d3.scaleBand().range([height, 0]).domain(MONTHS).padding(0.05);
    const color = d3.scaleSequential(d3.interpolatePuRd).domain([0, d3.max(seasonalityData, d => d.count)]);

    svg.append("g").attr("transform", `translate(0,${height})`).call(d3.axisBottom(x));
    svg.append("g").call(d3.axisLeft(y));

    svg.selectAll()
        .data(seasonalityData)
        .enter()
        .append("rect")
        .attr("x", d => x(d.year))
        .attr("y", d => y(d.monthName))
        .attr("width", x.bandwidth())
        .attr("height", y.bandwidth())
        .style("fill", d => color(d.count))
        .append("title").text(d => `${d.monthName} ${d.year}: ${d.count} cases`);
}

// 8. Cases by Disease - Chart: Bar chart
function renderDiseaseBarChart(container, data, subtitle) {
    const { svg, width, height } = setupChart(container, 'Total Cases by Disease', subtitle, 450, 450);
    
    const diseaseTotals = Object.entries(data).map(([disease, counts]) => ({
        disease,
        total: counts.M + counts.F
    })).sort((a, b) => b.total - a.total);

    const x = d3.scaleBand().domain(diseaseTotals.map(d => d.disease)).range([0, width]).padding(0.1);
    const yMax = d3.max(diseaseTotals, d => d.total);
    const y = d3.scaleLinear().domain([0, yMax * 1.1]).range([height, 0]);

    svg.append("g").attr("transform", `translate(0,${height})`).call(d3.axisBottom(x)).selectAll("text").style("text-anchor", "end").attr("transform", "rotate(-25)");
    svg.append("g").call(d3.axisLeft(y).ticks(5).tickFormat(d3.format("d")));

    svg.selectAll(".bar")
        .data(diseaseTotals)
        .enter().append("rect")
        .attr("class", "bar")
        .attr("x", d => x(d.disease))
        .attr("y", d => y(d.total))
        .attr("width", x.bandwidth())
        .attr("height", d => height - y(d.total))
        .attr("fill", "#f59e0b")
        .append("title").text(d => `${d.disease}: ${d.total} cases`);
}

// 9. Cases by Disease × Sex - Chart: Grouped bar
function renderDiseaseSexGroupedBar(container, data, subtitle) {
    const { svg, width, height } = setupChart(container, 'Cases by Disease × Sex (Grouped Bar)', subtitle, 600, 450);

    const diseaseSexData = Object.entries(data).map(([disease, counts]) => ({
        disease, M: counts.M, F: counts.F
    }));
    
    const x0 = d3.scaleBand().domain(window.DISEASES).rangeRound([0, width]).paddingInner(0.1);
    const x1 = d3.scaleBand().domain(GENDERS).rangeRound([0, x0.bandwidth()]).padding(0.05);
    const yMax = d3.max(diseaseSexData, d => Math.max(d.M, d.F));
    const y = d3.scaleLinear().domain([0, yMax * 1.1]).rangeRound([height, 0]);
    const z = d3.scaleOrdinal().domain(GENDERS).range(['#3b82f6', '#ec4899']);

    svg.append("g")
        .selectAll("g")
        .data(diseaseSexData)
        .join("g")
        .attr("transform", d => `translate(${x0(d.disease)},0)`)
        .selectAll("rect")
        .data(d => GENDERS.map(key => ({ key, value: d[key], disease: d.disease })))
        .join("rect")
        .attr("x", d => x1(d.key))
        .attr("y", d => y(d.value))
        .attr("width", x1.bandwidth())
        .attr("height", d => height - y(d.value))
        .attr("fill", d => z(d.key))
        .append("title").text(d => `${d.disease}, ${d.key}: ${d.value} cases`);

    svg.append("g").attr("transform", `translate(0,${height})`).call(d3.axisBottom(x0)).selectAll("text").style("text-anchor", "end").attr("transform", "rotate(-25)");
    svg.append("g").call(d3.axisLeft(y).ticks(5).tickFormat(d3.format("d")));

    // Legend
    const legend = svg.append("g").attr("transform", `translate(${width - 50}, ${-30})`);
    GENDERS.forEach((gender, i) => {
        legend.append("rect").attr("x", 0).attr("y", i * 15).attr("width", 10).attr("height", 10).attr("fill", z(gender));
        legend.append("text").attr("x", 15).attr("y", i * 15 + 9).text(gender).style("font-size", "10px");
    });
}

// 10. Cases by Disease × Age Interval - Chart: Heatmap (This is the same as Chart 1, renamed for clarity)
// Function already implemented as renderDiseaseAgeHeatmap

// 11. Total F vs M Cases - Simple bar
function renderTotalSexComparison(container, data, subtitle) {
    const { svg, width, height } = setupChart(container, 'Total Case Comparison (Female vs Male)', subtitle, 450, 450);
    
    const totalM = d3.sum(Object.values(data), d => d.M);
    const totalF = d3.sum(Object.values(data), d => d.F);
    const sexData = [{ sex: 'Male', total: totalM }, { sex: 'Female', total: totalF }];

    const x = d3.scaleBand().domain(['Male', 'Female']).range([0, width]).padding(0.3);
    const yMax = Math.max(totalM, totalF);
    const y = d3.scaleLinear().domain([0, yMax * 1.1]).range([height, 0]);
    const z = d3.scaleOrdinal().domain(['Male', 'Female']).range(['#3b82f6', '#ec4899']);

    svg.append("g").attr("transform", `translate(0,${height})`).call(d3.axisBottom(x));
    svg.append("g").call(d3.axisLeft(y).ticks(5).tickFormat(d3.format("d")));

    svg.selectAll(".bar")
        .data(sexData)
        .enter().append("rect")
        .attr("class", "bar")
        .attr("x", d => x(d.sex))
        .attr("y", d => y(d.total))
        .attr("width", x.bandwidth())
        .attr("height", d => height - y(d.total))
        .attr("fill", d => z(d.sex))
        .append("title").text(d => `${d.sex}: ${d.total} cases`);
}

// 12. F/M per Disease - Chart: Grouped bar (Same logic as Chart 9, using aggregated data)
function renderSexPerDiseaseGroupedBar(container, data, subtitle) {
    renderDiseaseSexGroupedBar(container, data, 'Sex Distribution per Disease (Grouped Bar)');
}

// 13. F/M per Location - Chart: Bar chart (Grouped Bar to show comparison)
function renderSexPerLocationGroupedBar(container, data, subtitle) {
    const { svg, width, height } = setupChart(container, 'Sex Distribution per Location (Grouped Bar)', subtitle, 600, 450);

    const locationSexData = Object.entries(data).map(([location, counts]) => ({
        location, M: counts.M, F: counts.F
    })).filter(d => d.M > 0 || d.F > 0);
    
    const x0 = d3.scaleBand().domain(locationSexData.map(d => d.location)).rangeRound([0, width]).paddingInner(0.1);
    const x1 = d3.scaleBand().domain(GENDERS).rangeRound([0, x0.bandwidth()]).padding(0.05);
    const yMax = d3.max(locationSexData, d => Math.max(d.M, d.F));
    const y = d3.scaleLinear().domain([0, yMax * 1.1]).rangeRound([height, 0]);
    const z = d3.scaleOrdinal().domain(GENDERS).range(['#3b82f6', '#ec4899']);

    svg.append("g")
        .selectAll("g")
        .data(locationSexData)
        .join("g")
        .attr("transform", d => `translate(${x0(d.location)},0)`)
        .selectAll("rect")
        .data(d => GENDERS.map(key => ({ key, value: d[key], location: d.location })))
        .join("rect")
        .attr("x", d => x1(d.key))
        .attr("y", d => y(d.value))
        .attr("width", x1.bandwidth())
        .attr("height", d => height - y(d.value))
        .attr("fill", d => z(d.key))
        .append("title").text(d => `${d.location}, ${d.key}: ${d.value} cases`);

    svg.append("g").attr("transform", `translate(0,${height})`).call(d3.axisBottom(x0));
    svg.append("g").call(d3.axisLeft(y).ticks(5).tickFormat(d3.format("d")));

    // Legend
    const legend = svg.append("g").attr("transform", `translate(${width - 50}, ${-30})`);
    GENDERS.forEach((gender, i) => {
        legend.append("rect").attr("x", 0).attr("y", i * 15).attr("width", 10).attr("height", 10).attr("fill", z(gender));
        legend.append("text").attr("x", 15).attr("y", i * 15 + 9).text(gender).style("font-size", "10px");
    });
}

// 14. Incidence Rate (cases per 1000 population) - Chart: Bar
function renderIncidenceRateTrend(container, locationSexSummary, populationData, subtitle) {
    const { svg, width, height } = setupChart(container, 'Incidence Rate (per 1000 Population)', subtitle, 450, 450);

    const incidenceData = Object.entries(locationSexSummary)
        .map(([location, counts]) => {
            const population = populationData[location] || 1; 
            const totalCases = counts.M + counts.F;
            const rate = (totalCases / population) * 1000; // Rate per 1000
            return { location, rate };
        })
        .sort((a, b) => b.rate - a.rate);

    const x = d3.scaleBand().domain(incidenceData.map(d => d.location)).range([0, width]).padding(0.1);
    const yMax = d3.max(incidenceData, d => d.rate);
    const y = d3.scaleLinear().domain([0, yMax * 1.1]).range([height, 0]);

    svg.append("g").attr("transform", `translate(0,${height})`).call(d3.axisBottom(x)).selectAll("text").style("text-anchor", "end").attr("transform", "rotate(-25)");
    svg.append("g").call(d3.axisLeft(y).ticks(5).tickFormat(d3.format(".1f")));

    svg.selectAll(".bar")
        .data(incidenceData)
        .enter().append("rect")
        .attr("class", "bar")
        .attr("x", d => x(d.location))
        .attr("y", d => y(d.rate))
        .attr("width", x.bandwidth())
        .attr("height", d => height - y(d.rate))
        .attr("fill", "#6366f1")
        .append("title").text(d => `${d.location}: ${d3.format(".2f")(d.rate)} per 1000`);
        
    svg.append("text").attr("transform", "rotate(-90)").attr("y", 0 - margin.left + 5).attr("x", 0 - (height / 2)).attr("dy", "1em").style("text-anchor", "middle").style("font-size", "12px").text("Rate per 1000 Pop.");
}

// 15. Correlation Matrix Between Diseases - Chart: Heatmap
function renderCorrelationHeatmap(container, diseases, subtitle) {
    const { svg, width, height } = setupChart(container, 'Disease Correlation Matrix (Mock Data)', subtitle, 600, 450);

    // Mocking Correlation Data (symmetric matrix)
    const correlationData = [];
    diseases.forEach((d1, i) => {
        diseases.forEach((d2, j) => {
            let value;
            if (i === j) {
                value = 1.0; // Perfect correlation with self
            } else if (i < j) {
                // Generate a random correlation value between -1 and 1
                value = (Math.random() * 2 - 1).toFixed(2);
            } else {
                // Use the mirrored value for symmetry
                const existing = correlationData.find(d => d.d1 === d2 && d.d2 === d1);
                value = existing ? existing.value : 0; 
            }
            correlationData.push({ d1, d2, value: +value });
        });
    });

    const x = d3.scaleBand().range([0, width]).domain(diseases).padding(0.05);
    const y = d3.scaleBand().range([height, 0]).domain(diseases).padding(0.05);
    const color = d3.scaleLinear().domain([-1, 0, 1]).range(["#ef4444", "#ffffff", "#10b981"]);

    svg.append("g").attr("transform", `translate(0,${height})`).call(d3.axisBottom(x)).selectAll("text").style("text-anchor", "end").attr("transform", "rotate(-25)");
    svg.append("g").call(d3.axisLeft(y));

    svg.selectAll()
        .data(correlationData)
        .enter()
        .append("rect")
        .attr("x", d => x(d.d1))
        .attr("y", d => y(d.d2))
        .attr("width", x.bandwidth())
        .attr("height", y.bandwidth())
        .style("fill", d => color(d.value))
        .append("title").text(d => `Corr(${d.d1}, ${d.d2}): ${d.value}`);

    // Add correlation value label to the cell
    svg.selectAll(".corr-label")
        .data(correlationData)
        .enter()
        .append("text")
        .attr("x", d => x(d.d1) + x.bandwidth() / 2)
        .attr("y", d => y(d.d2) + y.bandwidth() / 2)
        .text(d => d.value.toFixed(2))
        .style("text-anchor", "middle")
        .style("dominant-baseline", "central")
        .style("font-size", "10px")
        .style("fill", d => Math.abs(d.value) > 0.6 ? "white" : "black");
}








/**
 * Renders the Pie/Fraction Chart (Total Cases by Location)
 * REMOVED: This function is replaced by renderBoxPlot
 */
/*
function renderPieChart(container, data, total, title) {
    // ... (Original content)
}
*/

function aggregateData(fullMonthStrings, year, diseaseFilter) {
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
    
    // Sum data from all matching monthly reports
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

// --- ADMIN TOOLS, GRID RENDERING, and CALCULATION LOGIC ---

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

window.addDisease = function() {
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
};

window.collectGridData = function() {
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
