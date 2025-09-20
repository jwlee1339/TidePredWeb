/**
 * This script is a JavaScript conversion of the provided Python tide_pred.py.
 * It generates an annual tidal prediction report based on harmonic parameters.
 * It is designed to run in a web browser, interacting with the UI from index.html.
 */

/**
 * 資料類別，用於儲存潮汐調和分析參數。
 * 對應 Python TideParam dataclass
 */
class TideParam {
    constructor() {
        this.param_year = 0;
        this.h0 = 0.0; // 平均潮位 (cm)
        this.tide_name = [];
        this.cj = [];
        this.sj = [];
        this.sub_tide_period = []; // 週期 (hours)
    }
}

/**
 * 處理潮汐預測計算的核心類別。
 * 對應 Python TidePred class
 */
class TidePred {
    constructor() {
        this.tp = new TideParam();
        this.no_of_sub_tide = 0;
    }

    /**
     * 從檔案內容讀取調和參數。
     * @param {string} fileContent - 參數檔案的文字內容。
     * @returns {number} - 0 表示成功, -1 表示失敗。
     */
    read_tide_params(fileContent) {
        try {
            const lines = fileContent.split('\n').map(line => line.trim());

            this.tp.tide_name = [];
            this.tp.cj = [];
            this.tp.sj = [];
            this.tp.sub_tide_period = [];

            let data_start_index = -1;

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                if (line.includes("Observed Year")) {
                    if (i + 1 < lines.length) {
                        this.tp.param_year = parseInt(lines[i + 1].trim(), 10);
                    }
                } else if (line.includes("分潮數") && line.includes("平均潮位(CM)")) {
                    if (i + 1 < lines.length) {
                        const parts = lines[i + 1].trim().split(/\s+/);
                        if (parts.length >= 2) {
                            this.no_of_sub_tide = parseInt(parts[0], 10);
                            this.tp.h0 = parseFloat(parts[1]);
                        }
                    }
                } else if (line.includes("Cj(CM)") && line.includes("Sj(CM)")) {
                    data_start_index = i + 1;
                    break;
                }
            }

            if (data_start_index !== -1 && this.no_of_sub_tide > 0) {
                for (let i = 0; i < this.no_of_sub_tide; i++) {
                    const line_index = data_start_index + i;
                    if (line_index < lines.length) {
                        const parts = lines[line_index].trim().split(/\s+/).filter(p => p);
                        if (parts.length >= 6) {
                            this.tp.tide_name.push(parts[0]);
                            this.tp.sub_tide_period.push(parseFloat(parts[1]));
                            this.tp.cj.push(parseFloat(parts[4]));
                            this.tp.sj.push(parseFloat(parts[5]));
                        }
                    }
                }
            }

            if (!this.tp.param_year || isNaN(this.tp.param_year) || !this.no_of_sub_tide || isNaN(this.no_of_sub_tide) || this.tp.tide_name.length !== this.no_of_sub_tide) {
                throw new Error(`未能從檔案中完整讀取所有必要的參數。讀取到的分潮數: ${this.tp.tide_name.length} (應為 ${this.no_of_sub_tide})`);
            }

            return 0;
        } catch (e) {
            console.error(`解析檔案時發生錯誤:`, e);
            return -1;
        }
    }

    /**
     * 預測給定時間的潮位。
     * @param {Date} tb - 要預測的時間。
     * @returns {number} - 預測的潮位 (m)。
     */
    tidal_pred(tb) {
        const yr = tb.getFullYear();
        const shift_time = this.hours_to_zero(this.tp.param_year, yr);
        const yuan_dan_xt = new Date(yr, 0, 1, 0, 0, 0).getTime() - 3600 * 1000; // 元旦 - 1 hour in ms
        const t0 = (tb.getTime() - yuan_dan_xt) / 3600000.0;

        // 將結果從 cm 轉換為 m
        return 0.01 * this.h_tide_comp(this.no_of_sub_tide, t0 + shift_time);
    }

    /**
     * 執行調和分析的加總計算。
     * @param {number} m - 分潮數量。
     * @param {number} t - 時間 (小時)。
     * @returns {number} - 計算出的潮位 (cm)。
     */
    h_tide_comp(m, t) {
        let total = this.tp.h0;
        for (let i = 0; i < m; i++) {
            const angle = 2 * Math.PI * t / this.tp.sub_tide_period[i];
            total += this.tp.cj[i] * Math.cos(angle) + this.tp.sj[i] * Math.sin(angle);
        }
        return total;
    }

    /**
     * 計算兩個年份之間的小時數。
     * @param {number} ay - 開始年份。
     * @param {number} by - 結束年份。
     * @returns {number} - 總小時數。
     */
    hours_to_zero(ay, by) {
        let d = 0.0;
        const isLeap = year => new Date(year, 1, 29).getDate() === 29;
        if (by > ay) {
            for (let i = ay; i < by; i++) {
                d += isLeap(i) ? 366.0 : 365.0;
            }
        }
        return d * 24.0;
    }
}

/**
 * 產生逐時潮位預報報表。
 * 對應 Python HourlyReport class
 */
class HourlyReport {
    constructor() {
        this.tide = new TidePred();
        this.DELM_PLUS = "----+------+-----+-----+-----+-----+-----+-----+-----+-----+-----+-----+-----+-----+-----+-----+-----+-----+-----+-----+-----+-----+-----+-----+-----+-----+-----+-----+-----+";
        this.DELM_MINUS = "-----------------------------------------------------------------------------------------------------------------------------------------------------------------------+";
    }

    init_report(fileContent) {
        return this.tide.read_tide_params(fileContent);
    }

    get_report_title(sta_name) {
        return `${' '.repeat(75)}====================\n` +
               `${' '.repeat(75)}${sta_name}天文潮預報水位\n` +
               `${' '.repeat(75)}====================\n`;
    }

    get_second_title(year, month, station_code) {
        const s = `YEAR:  ${String(year).padStart(4, '0')} MONTH:   ${String(month).padStart(2, '0')}`;
        return `${s}${' '.repeat(117)}STA. CODE : ${station_code} UNIT:    M\n`;
    }

    month_head_string() {
        let s = "MMDD ";
        for (let i = 0; i < 24; i++) {
            s += String(i).padStart(6, ' ');
        }
        s += "  MEAN  MAX.  MIN.\n";
        return s;
    }

    print_annual_stage_report(report, year, station_name, station_code) {
        let ss = [];
        for (let i = 1; i <= 12; i++) {
            ss.push(this.print_month_stage(report, year, i, station_name, station_code));
        }
        return ss.join('');
    }

    print_month_stage(report, year, month, station_name, station_code) {
        let ss = [];
        const startOfYear = new Date(year, 0, 1);
        const startOfMonth = new Date(year, month - 1, 1);
        const start_day_of_year = (startOfMonth - startOfYear) / (1000 * 60 * 60 * 24);
        const days_in_month = new Date(year, month, 0).getDate();

        ss.push(this.get_report_title(station_name));
        ss.push(this.get_second_title(year, month, station_code));
        ss.push(this.DELM_MINUS + "\n");
        ss.push(this.month_head_string());
        ss.push(this.DELM_MINUS + "\n");

        for (let i = 0; i < days_in_month; i++) {
            const day_string = `${String(month).padStart(2, '0')}${String(i + 1).padStart(2, '0')} `;
            const s = day_string + this.print_stage(report, start_day_of_year + i);
            ss.push(s);
            if (i === 9 || i === 19) {
                ss.push(this.DELM_PLUS + "\n");
            }
        }

        ss.push(this.DELM_MINUS + "\n");

        const fmt = `TIDE PARAMETERS BY HARMONIC ANALYSYS BASE ON CWB DATA AT ${this.tide.tp.param_year} YEAR. NO. OF PARAMETERS : ${this.tide.no_of_sub_tide}`;
        ss.push(fmt + "\n");
        const now = new Date();
        const generated_s = `GENERATED AT: ${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')} BY KSWRB`;
        ss.push(generated_s + "\n\n");

        return ss.join('');
    }

    print_stage(report, day) {
        let s = "";
        const daily_data = report[day];
        const sum_val = daily_data.reduce((a, b) => a + b, 0);
        const hmax = Math.max(...daily_data);
        const hmin = Math.min(...daily_data);

        for (const val of daily_data) {
            s += val.toFixed(2).padStart(6, ' ');
        }

        const avg = sum_val / 24.0;
        s += avg.toFixed(2).padStart(6, ' ');
        s += hmax.toFixed(2).padStart(6, ' ');
        s += hmin.toFixed(2).padStart(6, ' ');
        return s + "\n";
    }

    generate_hourly_report(year) {
        const isLeap = (yr) => new Date(yr, 1, 29).getDate() === 29;
        const days_of_year = isLeap(year) ? 366 : 365;
        const report = [];
        const tb = new Date(year, 0, 1);

        for (let i = 0; i < days_of_year; i++) {
            const stage = new Array(24).fill(0.0);
            const d = new Date(tb.getTime() + i * 24 * 60 * 60 * 1000);
            for (let j = 0; j < 24; j++) {
                const dh = new Date(d.getTime() + j * 60 * 60 * 1000);
                stage[j] = this.tide.tidal_pred(dh);
            }
            report.push(stage);
        }
        return report;
    }
}

/**
 * Reads and parses observed tide data from a CSV file content.
 * Expects 'initTime' and 'value' columns.
 * @param {string} csvContent - The string content of the CSV file.
 * @returns {Array<{time: Date, value: number}>} An array of observation objects.
 */
function readObservations(csvContent) {
    const observations = [];
    const lines = csvContent.split('\n').map(line => line.trim()).filter(line => line);
    if (lines.length < 2) {
        return []; // Not enough data
    }

    const header = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    const timeIndex = header.indexOf('initTime');
    const valueIndex = header.indexOf('value');

    if (timeIndex === -1 || valueIndex === -1) {
        throw new Error("CSV 檔案必須包含 'initTime' 和 'value' 欄位。");
    }

    for (let i = 1; i < lines.length; i++) {
        try {
            const row = lines[i].split(',');
            if (row.length <= Math.max(timeIndex, valueIndex)) continue;

            const timeStr = row[timeIndex].trim().replace(/"/g, '');
            const value = parseFloat(row[valueIndex]);
            
            const time = new Date(timeStr);

            if (!isNaN(time.getTime()) && !isNaN(value)) {
                observations.push({ time, value });
            }
        } catch (e) {
            // Skip malformed rows
            console.warn(`Skipping malformed row in observation file: ${lines[i]}`);
        }
    }
    return observations;
}

/**
 * Calculates the Root Mean Square Error (RMSE) between two arrays of numbers.
 * @param {number[]} observed - The array of observed values.
 * @param {number[]} predicted - The array of predicted values.
 * @returns {number} The RMSE value.
 */
function calculateRmse(observed, predicted) {
    if (observed.length !== predicted.length || observed.length === 0) {
        return 0.0;
    }
    const squaredErrors = observed.map((obs, i) => (predicted[i] - obs) ** 2);
    const meanSquaredError = squaredErrors.reduce((sum, val) => sum + val, 0) / observed.length;
    return Math.sqrt(meanSquaredError);
}

/**
 * Finds the daily high and low tides from a set of data points.
 * @param {Array<{time: Date, value: number}>} dataPoints - Array of observation/prediction objects.
 * @returns {{highTides: Array<{x: number, y: number}>, lowTides: Array<{x: number, y: number}>}}
 */
function findDailyExtrema(dataPoints) {
    const dailyData = new Map();

    // Group points by day
    dataPoints.forEach(point => {
        const dayKey = point.time.toISOString().split('T')[0];
        if (!dailyData.has(dayKey)) {
            dailyData.set(dayKey, []);
        }
        dailyData.get(dayKey).push(point);
    });

    const highTides = [];
    const lowTides = [];

    dailyData.forEach(dayPoints => {
        if (dayPoints.length > 0) {
            let maxPoint = dayPoints.reduce((max, p) => p.value > max.value ? p : max, dayPoints[0]);
            let minPoint = dayPoints.reduce((min, p) => p.value < min.value ? p : min, dayPoints[0]);
            
            highTides.push({ x: maxPoint.time.getTime(), y: maxPoint.value });
            lowTides.push({ x: minPoint.time.getTime(), y: minPoint.value });
        }
    });

    return { highTides, lowTides };
}

/**
 * Finds all local high and low tides (turning points) from a set of data points.
 * @param {Array<{time: Date, value: number}>} dataPoints - Array of observation/prediction objects.
 * @returns {Array<{time: Date, value: number, type: 'high'|'low'}>}
 */
function findTidalTurningPoints(dataPoints) {
    if (dataPoints.length < 3) {
        return [];
    }
    const extrema = [];
    for (let i = 1; i < dataPoints.length - 1; i++) {
        const prevVal = dataPoints[i - 1].value;
        const currVal = dataPoints[i].value;
        const nextVal = dataPoints[i + 1].value;

        // Find local maximum (high tide)
        if (currVal > prevVal && currVal >= nextVal) {
            if (extrema.length === 0 || extrema[extrema.length - 1].type !== 'high') {
                extrema.push({ ...dataPoints[i], type: 'high' });
            }
        } 
        // Find local minimum (low tide)
        else if (currVal < prevVal && currVal <= nextVal) {
            if (extrema.length === 0 || extrema[extrema.length - 1].type !== 'low') {
                extrema.push({ ...dataPoints[i], type: 'low' });
            }
        }
    }
    return extrema;
}

/**
 * Calculates the maximum flood and ebb tidal ranges from a list of turning points.
 * @param {Array<{time: Date, value: number, type: 'high'|'low'}>} turningPoints
 * @returns {{maxFloodRange: number, maxEbbRange: number}}
 */
function calculateTidalRanges(turningPoints) {
    let maxFloodRange = 0;
    let maxEbbRange = 0;

    if (turningPoints.length < 2) {
        return { maxFloodRange, maxEbbRange };
    }

    for (let i = 1; i < turningPoints.length; i++) {
        const prev = turningPoints[i - 1];
        const curr = turningPoints[i];
        const range = Math.abs(curr.value - prev.value);

        if (prev.type === 'low' && curr.type === 'high') { // Flood tide (low to high)
            maxFloodRange = Math.max(maxFloodRange, range);
        } else if (prev.type === 'high' && curr.type === 'low') { // Ebb tide (high to low)
            maxEbbRange = Math.max(maxEbbRange, range);
        }
    }
    return { maxFloodRange, maxEbbRange };
}

/**
 * Finds the max, min, and average values from a set of data points, along with their timestamps.
 * @param {number[]} values - Array of numerical values.
 * @param {Date[]} timestamps - Array of corresponding Date objects.
 * @returns {{max: {value: number, time: Date}, min: {value: number, time: Date}, avg: {value: number}}}
 */
function findSummaryStats(values, timestamps) {
    if (values.length === 0) {
        return {
            max: { value: NaN, time: null },
            min: { value: NaN, time: null },
            avg: { value: NaN }
        };
    }

    let maxVal = -Infinity;
    let minVal = Infinity;
    let maxTime = null;
    let minTime = null;
    let sum = 0;

    for (let i = 0; i < values.length; i++) {
        const value = values[i];
        sum += value;
        if (value > maxVal) {
            maxVal = value;
            maxTime = timestamps[i];
        }
        if (value < minVal) {
            minVal = value;
            minTime = timestamps[i];
        }
    }
    
    const avgVal = sum / values.length;

    return {
        max: { value: maxVal, time: maxTime },
        min: { value: minVal, time: minTime },
        avg: { value: avgVal }
    };
}

document.addEventListener('DOMContentLoaded', () => {
    const paramFileInput = document.getElementById('paramFile');
    const yearInput = document.getElementById('yearInput');
    const obsFileInput = document.getElementById('obsFile');
    const stationNameInput = document.getElementById('stationNameInput');
    const stationCodeInput = document.getElementById('stationCodeInput');
    const generateBtn = document.getElementById('generateBtn');
    const sampleAnalyzeBtn = document.getElementById('sampleAnalyzeBtn');
    const statusEl = document.getElementById('status');
    const downloadLink = document.getElementById('downloadLink');
    const chartContainer = document.getElementById('chartContainer');
    const rmseValueEl = document.getElementById('rmseValue');
    const resetZoomBtn = document.getElementById('resetZoomBtn');
    const downloadChartBtn = document.getElementById('downloadChartBtn');
    const panLeftBtn = document.getElementById('panLeftBtn');
    const panRightBtn = document.getElementById('panRightBtn');
    const summaryContainer = document.getElementById('summaryContainer');
    const obsSummaryCard = document.getElementById('obsSummaryCard');
    const predSummaryCard = document.getElementById('predSummaryCard');
    const obsMaxValEl = document.getElementById('obsMaxVal');
    const obsMaxTimeEl = document.getElementById('obsMaxTime');
    const obsMinValEl = document.getElementById('obsMinVal');
    const obsMinTimeEl = document.getElementById('obsMinTime');
    const obsAvgEl = document.getElementById('obsAvg');
    const obsMaxFloodRangeEl = document.getElementById('obsMaxFloodRange');
    const obsMaxEbbRangeEl = document.getElementById('obsMaxEbbRange');
    const predMaxValEl = document.getElementById('predMaxVal');
    const predMaxTimeEl = document.getElementById('predMaxTime');
    const predMinValEl = document.getElementById('predMinVal');
    const predMinTimeEl = document.getElementById('predMinTime');
    const predAvgEl = document.getElementById('predAvg');
    const predMaxFloodRangeEl = document.getElementById('predMaxFloodRange');
    const predMaxEbbRangeEl = document.getElementById('predMaxEbbRange');
    const predMaxValDiffEl = document.getElementById('predMaxValDiff');
    const predMinValDiffEl = document.getElementById('predMinValDiff');
    const predAvgDiffEl = document.getElementById('predAvgDiff');
    const tideChartCanvas = document.getElementById('tideChart');
    let tideChart = null; // To hold the chart instance
    let currentChartFullData = null; // To hold the full data for the current chart

    resetZoomBtn.addEventListener('click', () => {
        if (tideChart) {
            tideChart.resetZoom();
            // After resetting, update summary for the full range
            updateSummaryForVisibleRange({ chart: tideChart });
        }
    });

    const ONE_MONTH_IN_MS = 30.44 * 24 * 60 * 60 * 1000; // 一個月的約略毫秒數

    panLeftBtn.addEventListener('click', () => {
        if (tideChart) {
            tideChart.pan({ x: -ONE_MONTH_IN_MS }, undefined, 'default');
        }
    });

    panRightBtn.addEventListener('click', () => {
        if (tideChart) {
            tideChart.pan({ x: ONE_MONTH_IN_MS }, undefined, 'default');
        }
    });

    downloadChartBtn.addEventListener('click', () => {
        if (!tideChart) return;

        const year = yearInput.value;
        const scale = tideChart.scales.x;
        const minDate = new Date(scale.min);
        const maxDate = new Date(scale.max);
        const rangeStr = `${minDate.getFullYear()}${String(minDate.getMonth() + 1).padStart(2, '0')}${String(minDate.getDate()).padStart(2, '0')}-${String(maxDate.getMonth() + 1).padStart(2, '0')}${String(maxDate.getDate()).padStart(2, '0')}`;

        const link = document.createElement('a');
        
        // Create a new canvas to avoid modifying the displayed chart and to add a white background
        const newCanvas = document.createElement('canvas');
        const originalCanvas = tideChart.canvas;
        newCanvas.width = originalCanvas.width;
        newCanvas.height = originalCanvas.height;
        
        const newCtx = newCanvas.getContext('2d');
        // Fill the background with white
        newCtx.fillStyle = 'white';
        newCtx.fillRect(0, 0, newCanvas.width, newCanvas.height);
        // Draw the original chart onto the new canvas
        newCtx.drawImage(originalCanvas, 0, 0);
        
        link.href = newCanvas.toDataURL('image/png');

        link.download = `潮汐圖表_${year}_${rangeStr}.png`;
        link.click();
    });
    generateBtn.addEventListener('click', () => {
        const paramFile = paramFileInput.files[0];
        const obsFile = obsFileInput.files[0];
        const year = parseInt(yearInput.value, 10);
        const stationName = stationNameInput.value;
        const stationCode = stationCodeInput.value;

        yearInput.classList.remove('is-invalid');

        if (!paramFile) {
            statusEl.textContent = "錯誤：請選擇一個參數檔案。";
            statusEl.className = 'alert alert-danger mt-3';
            return;
        }
        if (isNaN(year)) {
            statusEl.textContent = "錯誤：請輸入有效的年份。";
            statusEl.className = 'alert alert-danger mt-3';
            yearInput.classList.add('is-invalid');
            return;
        }

        const paramReader = new FileReader();
        paramReader.onload = (e) => {
            const paramFileContent = e.target.result;

            if (obsFile) {
                // If observation file is present, read it too
                const obsReader = new FileReader();
                obsReader.onload = (e_obs) => {
                    const obsFileContent = e_obs.target.result;
                    runGeneration(paramFileContent, year, obsFileContent, stationName, stationCode);
                };
                obsReader.onerror = () => {
                    statusEl.textContent = "讀取觀測檔案失敗。";
                    statusEl.className = 'alert alert-danger mt-3';
                };
                obsReader.readAsText(obsFile, 'utf-8');
            } else {
                // No observation file, proceed as before
                runGeneration(paramFileContent, year, null, stationName, stationCode);
            }
        };
        paramReader.onerror = () => {
            statusEl.textContent = "讀取參數檔案失敗。";
            statusEl.className = 'alert alert-danger mt-3';
        };
        paramReader.readAsText(paramFile, 'utf-8');
    });

    sampleAnalyzeBtn.addEventListener('click', () => {
        const paramFilePath = 'parameters/HarmonicParams_2024.txt';
        const obsFilePath = 'data/y2024Tide.csv';
        const year = 2024;
        const stationName = '紐澳良站';
        const stationCode = '8766072';

        yearInput.classList.remove('is-invalid');
        // Set UI fields to reflect sample data
        yearInput.value = year;
        stationNameInput.value = stationName;
        stationCodeInput.value = stationCode;
        paramFileInput.value = ''; // Clear file inputs
        obsFileInput.value = '';

        statusEl.textContent = `正在載入範例資料: ${paramFilePath} 及 ${obsFilePath} 並產生報告與圖表...`;
        statusEl.className = 'alert alert-info mt-3';
        generateBtn.disabled = true;
        sampleAnalyzeBtn.disabled = true;

        Promise.all([
            fetch(paramFilePath).then(response => {
                if (!response.ok) throw new Error(`無法載入範例參數檔案: ${response.statusText}`);
                return response.text();
            }),
            fetch(obsFilePath).then(response => {
                if (!response.ok) throw new Error(`無法載入範例觀測檔案: ${response.statusText}`);
                return response.text();
            })
        ])
            .then(([paramFileContent, obsFileContent]) => {
                runGeneration(paramFileContent, year, obsFileContent, stationName, stationCode);
            })
            .catch(error => {
                statusEl.textContent = `錯誤: ${error.message}`;
                statusEl.className = 'alert alert-danger mt-3';
                console.error(error);
            })
            .finally(() => {
                generateBtn.disabled = false;
                sampleAnalyzeBtn.disabled = false;
            });
    });

    function runGeneration(paramFileContent, year, obsFileContent, stationName, stationCode) {
        const selectedOutput = document.querySelector('input[name="outputOptions"]:checked').value;
        statusEl.textContent = "正在處理，請稍候...";
        statusEl.className = 'alert alert-info mt-3';
        generateBtn.disabled = true;
        downloadLink.style.display = 'none';
        downloadChartBtn.style.display = 'none';
        panLeftBtn.style.display = 'none';
        panRightBtn.style.display = 'none';
        document.querySelector('.form-text.mt-1').style.display = 'none';
        resetZoomBtn.style.display = 'none';
        summaryContainer.style.display = 'none';
        chartContainer.style.display = 'none';
        if (tideChart) {
            tideChart.destroy();
            tideChart = null;
        }

        // Use setTimeout to allow UI to update
        setTimeout(() => {
            try {
                // --- 1. Generate Prediction Report ---
                const reportGenerator = new HourlyReport();
                if (reportGenerator.init_report(paramFileContent) === -1) {
                    throw new Error("初始化報告失敗，請檢查參數檔案格式。");
                }

                const paramYear = reportGenerator.tide.tp.param_year;
                if (year < paramYear) {
                    throw new Error(`輸入的年份 (${year}) 不得小於參數檔案的基準年份 (${paramYear})。`);
                }

                const full_report_data = reportGenerator.generate_hourly_report(year);

                // --- 2. Handle Report Output ---
                if (selectedOutput === 'report' || selectedOutput === 'both') {
                    statusEl.textContent = "正在產生年度報表...";
                    const annual_report_string = reportGenerator.print_annual_stage_report(
                        full_report_data,
                        year,
                        stationName,
                        stationCode
                    );
                    const blob = new Blob([annual_report_string], { type: 'text/plain;charset=utf-8' });
                    downloadLink.href = URL.createObjectURL(blob);
                    downloadLink.download = `${year}_AnnualReport.txt`;
                    downloadLink.style.display = 'inline-block';
                }

                // --- 3. Handle Observation Data and Charting (if provided) ---
                if (selectedOutput === 'chart' || selectedOutput === 'both') {
                    if (obsFileContent) {
                        handleComparison(full_report_data, year, obsFileContent, stationName);
                    } else {
                        handlePredictionOnlyChart(full_report_data, year, stationName);
                    }
                } else {
                    statusEl.textContent = `報告已成功產生！`;
                    statusEl.className = 'alert alert-success mt-3';
                }

            } catch (error) {
                statusEl.textContent = `發生錯誤: ${error.message}`;
                statusEl.className = 'alert alert-danger mt-3';
                console.error(error);
                if (error.message.includes('年份')) {
                    yearInput.classList.add('is-invalid');
                }
            } finally {
                generateBtn.disabled = false;
                sampleAnalyzeBtn.disabled = false;
            }
        }, 10);
    }

    function handleComparison(full_report_data, year, obsFileContent, stationName) {
        statusEl.textContent += ` 正在處理觀測資料以進行比較...`;
        statusEl.className = 'alert alert-info mt-3';

        // --- Restore UI for comparison view (side-by-side) ---
        if (obsSummaryCard) obsSummaryCard.style.display = 'block';
        if (predSummaryCard) predSummaryCard.className = 'col-6';

        // --- Read and process data ---
        const observations = readObservations(obsFileContent);
        if (observations.length === 0) {
            throw new Error("觀測資料檔案為空或格式不正確。");
        }

        // --- 3a. Find Daily Extrema ---
        const observedPoints = observations.map(obs => ({ time: obs.time, value: obs.value }));
        const { highTides: observedHHW, lowTides: observedLLW } = findDailyExtrema(observedPoints);

        const predictedPointsForExtrema = [];


        // Create a map for quick lookup of predicted values
        const predictedMap = new Map();
        const startDate = new Date(year, 0, 1);
        full_report_data.forEach((dailyData, dayIdx) => {
            dailyData.forEach((value, hourIdx) => {
                const currentTime = new Date(startDate.getTime() + (dayIdx * 24 + hourIdx) * 3600 * 1000);
                predictedMap.set(currentTime.getTime(), value);
            });
        });

        // Match observed data with predicted data
        const chartData = {
            timestamps: [],
            observed: [],
            predicted: []
        };

        observations.forEach(obs => {
            if (obs.time.getFullYear() === year) {
                // Find the closest hour for matching
                const obsTime = obs.time.getTime();
                const roundedTime = new Date(Math.round(obsTime / 3600000) * 3600000);
                const predictedValue = predictedMap.get(roundedTime.getTime());
                
                if (predictedValue !== undefined) {
                    chartData.timestamps.push(obs.time);
                    chartData.observed.push(obs.value);
                    chartData.predicted.push(predictedValue);
                    predictedPointsForExtrema.push({ time: roundedTime, value: predictedValue });
                }
            }
        });

        // Store the full data for zoom handler
        currentChartFullData = chartData;

        if (chartData.timestamps.length === 0) {
            throw new Error("觀測資料中沒有與預測年份相符的資料。");
        }

        const { highTides: predictedHHW, lowTides: predictedLLW } = findDailyExtrema(predictedPointsForExtrema);
        const extremaData = { observedHHW, observedLLW, predictedHHW, predictedLLW };

        // --- 3b. Calculate and Display Summary Statistics for the full range initially ---
        updateSummaryForVisibleRange({ chart: null });

        // Calculate and display RMSE
        const rmse = calculateRmse(chartData.observed, chartData.predicted);
        rmseValueEl.textContent = `RMSE: ${rmse.toFixed(4)} m`;

        // Create the chart
        createChart(chartData, extremaData, year);

        // Show chart and draw for the first available month
        summaryContainer.style.display = 'block';
        chartContainer.style.display = 'block';
        document.querySelector('.form-text.mt-1').style.display = 'block';
        resetZoomBtn.style.display = 'block';
        panLeftBtn.style.display = 'block';
        panRightBtn.style.display = 'block';
        downloadChartBtn.style.display = 'block';
        
        const selectedOutput = document.querySelector('input[name="outputOptions"]:checked').value;
        if (selectedOutput === 'chart') {
            statusEl.textContent = `圖表比較已成功產生！`;
        } else {
            statusEl.textContent = `報告與圖表比較已成功產生！`;
        }
        statusEl.className = 'alert alert-success mt-3';
    }

    function handlePredictionOnlyChart(full_report_data, year, stationName) {
        statusEl.textContent += ` 正在處理預測資料以產生圖表...`;
        statusEl.className = 'alert alert-info mt-3';

        // --- 1. Setup summary cards for prediction-only view (full width) ---
        if (obsSummaryCard) obsSummaryCard.style.display = 'none';
        if (predSummaryCard) predSummaryCard.className = 'col-12';

        // --- 2. Format data for chart ---
        // ... (rest of the function is the same until chart drawing)

        const chartData = {
            timestamps: [],
            predicted: []
        };
        const startDate = new Date(year, 0, 1);
        full_report_data.forEach((dailyData, dayIdx) => {
            dailyData.forEach((value, hourIdx) => {
                const currentTime = new Date(startDate.getTime() + (dayIdx * 24 + hourIdx) * 3600 * 1000);
                chartData.timestamps.push(currentTime);
                chartData.predicted.push(value);
            });
        });

        // Store the full data for zoom handler
        currentChartFullData = chartData;

        // --- 3. Calculate and Display Summary Statistics ---
        const predValues = chartData.predicted;
        const timestamps = chartData.timestamps;
        const predStats = findSummaryStats(predValues, timestamps);

        const formatSummaryDateTime = (date) => {
            if (!date || isNaN(date.getTime())) return '';
            const y = date.getFullYear();
            const m = String(date.getMonth() + 1).padStart(2, '0');
            const d = String(date.getDate()).padStart(2, '0');
            const h = String(date.getHours()).padStart(2, '0');
            const min = String(date.getMinutes()).padStart(2, '0');
            return `${y}/${m}/${d} ${h}:${min}`;
        };

        predMaxValEl.textContent = `${predStats.max.value.toFixed(3)} m`;
        predMaxTimeEl.textContent = formatSummaryDateTime(predStats.max.time);
        predMinValEl.textContent = `${predStats.min.value.toFixed(3)} m`;
        predMinTimeEl.textContent = formatSummaryDateTime(predStats.min.time);
        predAvgEl.textContent = `${predStats.avg.value.toFixed(3)} m`;
        
        predMaxValDiffEl.textContent = '';
        predMinValDiffEl.textContent = '';
        predAvgDiffEl.textContent = '';

        // --- 4. Calculate and Display Tidal Ranges ---
        const predictedPointsForRange = predValues.map((val, i) => ({ time: chartData.timestamps[i], value: val }));
        const predTurningPoints = findTidalTurningPoints(predictedPointsForRange);
        const { maxFloodRange: predMaxFlood, maxEbbRange: predMaxEbb } = calculateTidalRanges(predTurningPoints);
        predMaxFloodRangeEl.textContent = `${predMaxFlood.toFixed(3)} m`;
        predMaxEbbRangeEl.textContent = `${predMaxEbb.toFixed(3)} m`;

        // --- 5. Setup Chart ---
        const { highTides: predictedHHW, lowTides: predictedLLW } = findDailyExtrema(predictedPointsForRange);
        const extremaData = { predictedHHW, predictedLLW };

        rmseValueEl.textContent = '僅預測資料';

        // Create the chart
        createChart(chartData, extremaData, year);

        summaryContainer.style.display = 'block';
        chartContainer.style.display = 'block';
        document.querySelector('.form-text.mt-1').style.display = 'block';
        resetZoomBtn.style.display = 'block';
        panLeftBtn.style.display = 'block';
        panRightBtn.style.display = 'block';
        downloadChartBtn.style.display = 'block';
        
        const selectedOutput = document.querySelector('input[name="outputOptions"]:checked').value;
        if (selectedOutput === 'chart') {
            statusEl.textContent = `圖表已成功產生！`;
        } else {
            statusEl.textContent = `報告與圖表已成功產生！`;
        }
        statusEl.className = 'alert alert-success mt-3';
    }

    /**
     * Updates the summary cards based on the chart's visible data range.
     * @param {{chart: Chart}} event - The event object from the zoom plugin.
     */
    function updateSummaryForVisibleRange({ chart }) {
        if (!currentChartFullData) return;

        let minTs, maxTs;
        // On initial load, chart is null. Use full data range.
        // On zoom/pan, use the chart's scale.
        if (chart && chart.scales && chart.scales.x) {
            minTs = chart.scales.x.min;
            maxTs = chart.scales.x.max;
        } else {
            minTs = currentChartFullData.timestamps[0].getTime();
            maxTs = currentChartFullData.timestamps[currentChartFullData.timestamps.length - 1].getTime();
        }

        const filteredTimestamps = [];
        const filteredObserved = [];
        const filteredPredicted = [];

        for (let i = 0; i < currentChartFullData.timestamps.length; i++) {
            const ts = currentChartFullData.timestamps[i].getTime();
            if (ts >= minTs && ts <= maxTs) {
                filteredTimestamps.push(currentChartFullData.timestamps[i]);
                if (currentChartFullData.observed) {
                    filteredObserved.push(currentChartFullData.observed[i]);
                }
                filteredPredicted.push(currentChartFullData.predicted[i]);
            }
        }

        if (filteredTimestamps.length === 0) return;

        const formatSummaryDateTime = (date) => {
            if (!date || isNaN(date.getTime())) return '';
            const y = date.getFullYear();
            const m = String(date.getMonth() + 1).padStart(2, '0');
            const d = String(date.getDate()).padStart(2, '0');
            const h = String(date.getHours()).padStart(2, '0');
            const min = String(date.getMinutes()).padStart(2, '0');
            return `${y}/${m}/${d} ${h}:${min}`;
        };

        // --- Calculate and Display Summary Statistics ---
        const predStats = findSummaryStats(filteredPredicted, filteredTimestamps);
        
        predMaxValEl.textContent = `${predStats.max.value.toFixed(3)} m`;
        predMaxTimeEl.textContent = formatSummaryDateTime(predStats.max.time);
        predMinValEl.textContent = `${predStats.min.value.toFixed(3)} m`;
        predMinTimeEl.textContent = formatSummaryDateTime(predStats.min.time);
        predAvgEl.textContent = `${predStats.avg.value.toFixed(3)} m`;

        if (currentChartFullData.observed && filteredObserved.length > 0) {
            const obsStats = findSummaryStats(filteredObserved, filteredTimestamps);
            obsMaxValEl.textContent = `${obsStats.max.value.toFixed(3)} m`;
            obsMaxTimeEl.textContent = formatSummaryDateTime(obsStats.max.time);
            obsMinValEl.textContent = `${obsStats.min.value.toFixed(3)} m`;
            obsMinTimeEl.textContent = formatSummaryDateTime(obsStats.min.time);
            obsAvgEl.textContent = `${obsStats.avg.value.toFixed(3)} m`;

            const maxDiff = predStats.max.value - obsStats.max.value;
            const minDiff = predStats.min.value - obsStats.min.value;
            const avgDiff = predStats.avg.value - obsStats.avg.value;

            const formatDiff = (diff) => {
                const sign = diff >= 0 ? '+' : '';
                return `(差: ${sign}${diff.toFixed(3)} m)`;
            };
            predMaxValDiffEl.textContent = formatDiff(maxDiff);
            predMinValDiffEl.textContent = formatDiff(minDiff);
            predAvgDiffEl.textContent = formatDiff(avgDiff);

            const observedPointsForRange = filteredObserved.map((val, i) => ({ time: filteredTimestamps[i], value: val }));
            const obsTurningPoints = findTidalTurningPoints(observedPointsForRange);
            const { maxFloodRange: obsMaxFlood, maxEbbRange: obsMaxEbb } = calculateTidalRanges(obsTurningPoints);
            obsMaxFloodRangeEl.textContent = `${obsMaxFlood.toFixed(3)} m`;
            obsMaxEbbRangeEl.textContent = `${obsMaxEbb.toFixed(3)} m`;
        }

        const predictedPointsForRange = filteredPredicted.map((val, i) => ({ time: filteredTimestamps[i], value: val }));
        const predTurningPoints = findTidalTurningPoints(predictedPointsForRange);
        const { maxFloodRange: predMaxFlood, maxEbbRange: predMaxEbb } = calculateTidalRanges(predTurningPoints);
        predMaxFloodRangeEl.textContent = `${predMaxFlood.toFixed(3)} m`;
        predMaxEbbRangeEl.textContent = `${predMaxEbb.toFixed(3)} m`;
    }

    function createChart(chartData, extremaData, year) {
        if (tideChart) {
            tideChart.destroy();
        }

        const datasets = [];
        const hasObservedData = chartData.observed && chartData.observed.length > 0;

        // Add observed data if it exists
        if (hasObservedData) {
            datasets.push({
                type: 'line',
                label: '觀測值 (Observed)',
                data: chartData.timestamps.map((t, i) => ({ x: t.getTime(), y: chartData.observed[i] })),
                borderColor: 'rgb(54, 162, 235)',
                borderWidth: 1.5,
                pointRadius: 0,
                tension: 0.1
            });
        }

        // Predicted data is always present
        datasets.push({
            type: 'line',
            label: '預測值 (Predicted)',
            data: chartData.timestamps.map((t, i) => ({ x: t.getTime(), y: chartData.predicted[i] })),
            borderColor: 'rgb(255, 99, 132)',
            borderWidth: 1.5,
            pointRadius: 0,
            tension: 0.1,
            borderDash: hasObservedData ? [5, 5] : [] // Only dash if comparing
        });

        // Add observed extrema if they exist
        if (extremaData.observedHHW) {
            datasets.push({
                type: 'scatter',
                label: '觀測高潮 (Obs HHW)',
                data: extremaData.observedHHW,
                backgroundColor: 'blue',
                pointStyle: 'triangle',
                radius: 6,
                rotation: 0,
            });
            datasets.push({
                type: 'scatter',
                label: '觀測低潮 (Obs LLW)',
                data: extremaData.observedLLW,
                backgroundColor: 'blue',
                pointStyle: 'triangle',
                radius: 6,
                rotation: 180,
            });
        }

        // Add predicted extrema
        if (extremaData.predictedHHW) {
            datasets.push({
                type: 'scatter',
                label: '預測高潮 (Pred HHW)',
                data: extremaData.predictedHHW,
                backgroundColor: 'red',
                pointStyle: 'triangle',
                radius: 6,
                rotation: 0,
            });
            datasets.push({
                type: 'scatter',
                label: '預測低潮 (Pred LLW)',
                data: extremaData.predictedLLW,
                backgroundColor: 'green',
                pointStyle: 'triangle',
                radius: 6,
                rotation: 180,
            });
        }

        tideChart = new Chart(tideChartCanvas, {
            data: {
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: hasObservedData ? `${year}年 潮位觀測 vs. 預測` : `${year}年 潮位預測`,
                        font: {
                            size: 20
                        },
                        padding: { top: 10, bottom: 20 }
                    },
                    zoom: {
                        pan: {
                            enabled: true,
                            mode: 'x',
                        },
                        zoom: {
                            wheel: {
                                enabled: true,
                            },
                            drag: {
                                enabled: true,
                            },
                            pinch: {
                                enabled: true
                            },
                            mode: 'x',
                        },
                        limits: {
                            x: { min: 'original', max: 'original' }
                        },
                        onZoomComplete: updateSummaryForVisibleRange,
                        onPanComplete: updateSummaryForVisibleRange
                    },
                    legend: {
                        position: 'top',
                    },
                },
                scales: {
                    x: {
                        type: 'time',
                        time: {
                            unit: 'day',
                            tooltipFormat: 'yyyy-MM-dd HH:mm',
                            displayFormats: {
                                day: 'MM-dd'
                            }
                        },
                        title: {
                            display: true,
                            text: '日期'
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: '潮位 (m)'
                        }
                    }
                }
            }
        });
    }
});