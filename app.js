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
 * Prepares data and calls the specific chart rendering functions.
 */
window.renderCharts = function(aggregatedData, diseaseFilter, periodValue) {
    const chartContainer = d3.select('#reportCharts');
    chartContainer.html(''); // Clear previous charts

    const locationTotals = [];
    const ageIntervalTotals = AGE_INTERVALS.map(int => ({ 
        interval: int.replace(/_/g, '-').replace('plus', '+'), 
        M: 0, 
        F: 0 
    }));
    let grandTotal = 0;

    window.LOCATIONS.forEach(location => {
        const locationId = location.replace(/[^a-zA-Z0-9]/g, '_');
        let locTotal = 0;
        
        AGE_INTERVALS.forEach((interval, index) => {
            // Note: Data fetching from aggregatedData relies on the `report_` prefix, 
            // but since aggregatedData is just the data object, we can directly access it.
            const mCount = aggregatedData[locationId]?.[`M_${interval}`] || 0;
            const fCount = aggregatedData[locationId]?.[`F_${interval}`] || 0;
            
            locTotal += mCount + fCount;
            ageIntervalTotals[index].M += mCount;
            ageIntervalTotals[index].F += fCount;
        });
        
        if (locTotal > 0) {
            // Use only the Commune/Secteur name for cleaner chart labels
            const locName = location.split(':').length > 1 ? location.split(':')[1].trim() : location;
            locationTotals.push({ location: locName, total: locTotal });
        }
        grandTotal += locTotal;
    });
    
    // Update the total count display
    document.getElementById('reportTotalCount').textContent = `Report Total: ${grandTotal} Cases`;

    if (grandTotal === 0) {
        chartContainer.html('<p class="text-center text-gray-500 py-8 font-semibold">No data available for the selected period or disease.</p>');
        return;
    }
    
    const title = `${diseaseFilter === 'all' ? 'All Diseases' : diseaseFilter.replace(/_/g, ' ')} Report for ${periodValue.replace(/_/g, ' - ')}`;

    // 1. Pictorial Fraction Chart (Donut Chart)
    if (locationTotals.length > 0) {
        renderPieChart(chartContainer, locationTotals, grandTotal, title);
    }

    // 2. Layered Area Chart (Stacked Bar Chart for categorical data)
    if (ageIntervalTotals.some(d => d.M > 0 || d.F > 0)) {
        renderStackedBarChart(chartContainer, ageIntervalTotals, title);
    }
};

/**
 * Renders the Pie/Fraction Chart (Total Cases by Location)
 */
function renderPieChart(container, data, total, title) {
    const width = 400, height = 400, margin = 20;
    const radius = Math.min(width, height) / 2 - margin;

    const chartDiv = container.append('div')
        .attr('class', 'p-4 bg-white rounded-xl shadow-lg m-4 w-full md:w-[450px]');
    
    chartDiv.append('h3').attr('class', 'text-lg font-bold text-center mb-1 text-gray-800').text('Distribution by Location');
    chartDiv.append('p').attr('class', 'text-sm text-center text-gray-600 mb-4').text(title);


    const svg = chartDiv.append('svg')
        .attr('width', width)
        .attr('height', height)
        .append('g')
        .attr('transform', `translate(${width / 2}, ${height / 2})`);

    const color = d3.scaleOrdinal(d3.schemeCategory10);

    const pie = d3.pie()
        .value(d => d.total)
        .sort(null);

    const arc = d3.arc()
        .innerRadius(radius / 2) // Donut chart for pictorial fraction
        .outerRadius(radius);

    const outerArc = d3.arc()
        .innerRadius(radius * 0.9)
        .outerRadius(radius * 0.9);

    svg.selectAll('slices')
        .data(pie(data))
        .enter()
        .append('path')
        .attr('d', arc)
        .attr('fill', d => color(d.data.location))
        .attr('stroke', 'white')
        .style('stroke-width', '2px')
        .style('opacity', 0.8)
        .append('title')
        .text(d => `${d.data.location}: ${d.data.total} cases (${d3.format(".1%")(d.data.total / total)})`);

    // Add labels outside the pie
    svg.selectAll('labels')
        .data(pie(data))
        .enter()
        .append('text')
        .attr('transform', function(d) {
            const pos = outerArc.centroid(d);
            const midAngle = d.startAngle + (d.endAngle - d.startAngle) / 2;
            pos[0] = radius * 1.05 * (midAngle < Math.PI ? 1 : -1);
            return `translate(${pos})`;
        })
        .style('text-anchor', function(d) {
            const midAngle = d.startAngle + (d.endAngle - d.startAngle) / 2;
            return (midAngle < Math.PI ? 'start' : 'end');
        })
        .style('font-size', '10px')
        .text(d => `${d.data.location} (${d3.format(".1%")(d.data.total / total)})`);
    
    // Add total label in the center
      svg.append("text")
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "middle")
        .style("font-size", "1.5rem")
        .style("font-weight", "bold")
        .attr("fill", "#1f2937")
        .text(total);
}

/**
 * Renders the Stacked Bar Chart (Age and Sex Distribution)
 */
function renderStackedBarChart(container, data, title) {
    const margin = { top: 30, right: 30, bottom: 60, left: 60 };
    const chartWidth = 600; 
    const chartHeight = 400;
    const width = chartWidth - margin.left - margin.right;
    const height = chartHeight - margin.top - margin.bottom;

    const keys = ['M', 'F'];
    
    const chartDiv = container.append('div')
        .attr('class', 'p-4 bg-white rounded-xl shadow-lg m-4 w-full md:w-[650px]');

    chartDiv.append('h3').attr('class', 'text-lg font-bold text-center mb-1 text-gray-800').text('Age and Sex Distribution (Layered Area concept)');
    chartDiv.append('p').attr('class', 'text-sm text-center text-gray-600 mb-4').text(title);

    const svg = chartDiv.append('svg')
        .attr('width', width + margin.left + margin.right)
        .attr('height', height + margin.top + margin.bottom)
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
        .domain([0, yMax])
        .range([height, 0]);

    const color = d3.scaleOrdinal()
        .domain(keys)
        .range(['#3b82f6', '#f472b6']); // Blue for Male (M), Pink for Female (F)

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
        .call(d3.axisLeft(y).ticks(5));

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
        .attr('rx', 4) // Rounded corners for aesthetics
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
      const [yearStr, periodId] = periodValue.split('_');
      const year = yearStr || periodValue.substring(0, 4); 
      
      let monthsToAggregate = [];
      
      if (type === 'monthly') {
          monthsToAggregate = [periodValue.substring(5, 7)];
      } else {
          const periods = REPORT_PERIODS[type];
          const periodsConfig = periods ? periods.find(p => p.id === periodId) : null;

          if (periodsConfig) {
              monthsToAggregate = periodsConfig.months;
          }
      }
      
      const fullMonthStrings = monthsToAggregate.map(m => `${year}-${m}`);

      return { fullMonthStrings, year: year };
}

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
