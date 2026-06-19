"use strict";

const CONFIG = {
  refreshMs: 15 * 60 * 1000,
  trendThresholdMPerHour: 0.005,
  rainfallResponseMmThreshold: 2.0,
  rainfallLevelResponseMPerMm: 0.002,
  rainfallResponseLagHours: 2,
  maxRainfallAdjustmentM: 0.15,
  epaChartUrl: "https://epawebapp.epa.ie/Hydronet/output/internet/stations/CAS/33008/S/extralarge_3m_extralarge.png",
  epaZipUrl: "https://epawebapp.epa.ie/Hydronet/output/internet/stations/CAS/33008/S/3_months.zip",
  highLowTidesUrl: "https://erddap.marine.ie/erddap/tabledap/IMI_TidePrediction_HighLow.json?stationID,time,longitude,latitude,tide_time_category,Water_Level_ODMalin&stationID=%22Ballyglass%22&time%3E=now&time%3C=now%2B7days&orderBy(%22time%22)",
  tideCurveUrl: "https://erddap.marine.ie/erddap/tabledap/IMI-TidePrediction.json?time,longitude,latitude,stationID,Water_Level,Water_Level_ODM&stationID=%22Ballyglass%22&time%3E=now&time%3C=now%2B7days&orderBy(%22time%22)",
  weatherSources: [
    {
      name: "Owenninney",
      url: "http://openaccess.pf.api.met.ie/metno-wdb2ts/locationforecast?lat=54.17367844330243;long=-9.557268307800891",
      sourceNote: "Original published endpoint uses HTTP. HTTPS is used here to avoid mixed-content blocking on GitHub Pages."
    },
    {
      name: "Altnabrocky",
      url: "http://openaccess.pf.api.met.ie/metno-wdb2ts/locationforecast?lat=54.060586257345676;long=-9.61700646706997",
      sourceNote: "Original published endpoint uses HTTP. HTTPS is used here to avoid mixed-content blocking on GitHub Pages."
    }
  ]
};

const TREND_THRESHOLD_M_PER_HOUR = CONFIG.trendThresholdMPerHour;
const TREND_THRESHOLD_CM_PER_HOUR = TREND_THRESHOLD_M_PER_HOUR * 100;
const RAINFALL_RESPONSE_MM_THRESHOLD = CONFIG.rainfallResponseMmThreshold;
const RAINFALL_LEVEL_RESPONSE_M_PER_MM = CONFIG.rainfallLevelResponseMPerMm;
const RAINFALL_RESPONSE_LAG_HOURS = CONFIG.rainfallResponseLagHours;
const MAX_RAINFALL_ADJUSTMENT_M = CONFIG.maxRainfallAdjustmentM;

const RANGES = { "6h": 6, "12h": 12, "24h": 24, "48h": 48, "3d": 72, "7d": 168 };

const state = {
  isRefreshing: false,
  activeRange: "6h",
  epaRecords: [],
  epaMeta: {},
  weatherData: [],
  rainfallSnapshots: [],
  highLowTides: [],
  tideCurve: [],
  riverPrediction: null,
  lastSuccessfulUpdate: null,
  statuses: { epa: "waiting", weather: "waiting", tide: "waiting" },
  errors: [],
  charts: { river: null, rainfall: null, tide: null }
};

const $ = (id) => document.getElementById(id);

document.addEventListener("DOMContentLoaded", () => {
  $("refreshButton").addEventListener("click", refreshAllData);
  document.querySelectorAll(".range-button").forEach((button) => {
    button.addEventListener("click", () => setActiveTimeRange(button.dataset.range));
  });

  state.rainfallSnapshots = loadStoredRainfallSnapshots();
  refreshAllData();
  setInterval(refreshAllData, CONFIG.refreshMs);
});

function formatIrishTime(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "Unavailable";
  return new Intl.DateTimeFormat("en-IE", {
    timeZone: "Europe/Dublin",
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function formatIrishDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "Unavailable";
  return new Intl.DateTimeFormat("en-IE", {
    timeZone: "Europe/Dublin",
    weekday: "short",
    day: "2-digit",
    month: "short"
  }).format(date);
}

function formatIrishTimeOnly(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "Unavailable";
  return new Intl.DateTimeFormat("en-IE", {
    timeZone: "Europe/Dublin",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

async function refreshAllData() {
  if (state.isRefreshing) return;

  state.isRefreshing = true;
  state.errors = [];
  $("refreshButton").disabled = true;
  $("refreshButton").textContent = "Refreshing";

  const results = await Promise.allSettled([
    fetchEpaRiverData(),
    fetchWeatherForecasts(),
    Promise.all([fetchHighLowTides(), fetchTideCurve()])
  ]);

  if (results[0].status === "fulfilled") {
    state.epaRecords = results[0].value.records;
    state.epaMeta = results[0].value.meta;
    state.statuses.epa = "ok";
  } else {
    state.statuses.epa = "error";
    showError("EPA data unavailable. Showing last loaded values.", results[0].reason);
  }

  if (results[1].status === "fulfilled") {
    state.weatherData = results[1].value;
    saveForecastRainfallSnapshot(state.weatherData);
    state.rainfallSnapshots = loadStoredRainfallSnapshots();
    state.statuses.weather = "ok";
  } else {
    state.statuses.weather = "error";
    showError("Met Éireann forecast or rainfall unavailable. Showing any last loaded values.", results[1].reason);
  }

  if (results[2].status === "fulfilled") {
    state.highLowTides = results[2].value[0];
    state.tideCurve = results[2].value[1];
    state.statuses.tide = "ok";
  } else {
    state.statuses.tide = "error";
    showError("Marine Institute tide data unavailable. Showing any last loaded values.", results[2].reason);
  }

  if (results.some((result) => result.status === "fulfilled")) state.lastSuccessfulUpdate = new Date();

  state.riverPrediction = predictCurrentRiverLevel(state.epaRecords, state.weatherData);
  renderAll();

  state.isRefreshing = false;
  $("refreshButton").disabled = false;
  $("refreshButton").textContent = "Refresh";
}

async function fetchWeatherForecasts() {
  const forecasts = [];
  for (const source of CONFIG.weatherSources) {
    const response = await fetch(source.url, { cache: "no-store" });
    if (!response.ok) throw new Error(`Met Éireann forecast fetch failed for ${source.name} with HTTP ${response.status}.`);
    const xmlText = await response.text();
    const parsed = parseMetEireannXml(xmlText);
    parsed.catchment = source.name;
    parsed.sourceNote = source.sourceNote;
    forecasts.push(parsed);
  }
  return forecasts;
}

function parseMetEireannXml(xmlText) {
  const documentXml = new DOMParser().parseFromString(xmlText, "application/xml");
  const parserError = documentXml.querySelector("parsererror");
  if (parserError) throw new Error("Met Éireann XML could not be parsed.");

  const root = documentXml.querySelector("weatherdata");
  const created = root?.getAttribute("created") || null;
  const models = [...documentXml.querySelectorAll("meta model")].map((model) => ({
    name: model.getAttribute("name"),
    from: model.getAttribute("from"),
    to: model.getAttribute("to"),
    termin: model.getAttribute("termin"),
    runended: model.getAttribute("runended"),
    nextrun: model.getAttribute("nextrun")
  }));

  const points = [...documentXml.querySelectorAll("product > time")].map((timeNode) => {
    const location = timeNode.querySelector("location");
    const getAttr = (selector, attr) => location?.querySelector(selector)?.getAttribute(attr) ?? null;
    return {
      from: safeDate(timeNode.getAttribute("from")),
      to: safeDate(timeNode.getAttribute("to")),
      datatype: timeNode.getAttribute("datatype") || "forecast",
      modelName: models[0]?.name || "unknown",
      temperatureC: toNumber(getAttr("temperature", "value")),
      windDirectionDeg: toNumber(getAttr("windDirection", "deg")),
      windDirectionName: getAttr("windDirection", "name"),
      windSpeedMps: toNumber(getAttr("windSpeed", "mps")),
      windBeaufort: toNumber(getAttr("windSpeed", "beaufort")),
      windName: getAttr("windSpeed", "name"),
      windGustMps: toNumber(getAttr("windGust", "mps")),
      pressureHpa: toNumber(getAttr("pressure", "value")),
      cloudinessPct: toNumber(getAttr("cloudiness", "percent")),
      lowCloudsPct: toNumber(getAttr("lowClouds", "percent")),
      mediumCloudsPct: toNumber(getAttr("mediumClouds", "percent")),
      highCloudsPct: toNumber(getAttr("highClouds", "percent")),
      humidityPct: toNumber(getAttr("humidity", "value")),
      rainfallMm: readPrecipitation(location)
    };
  }).filter((point) => point.from || point.to);

  return { created: safeDate(created), models, points };
}

function readPrecipitation(location) {
  if (!location) return null;
  const selectors = ["precipitation", "minprecipitation", "maxprecipitation", "rain", "rainfall"];
  for (const selector of selectors) {
    const node = location.querySelector(selector);
    if (!node) continue;
    for (const attr of ["value", "amount", "mm", "precipitation", "rainfall"]) {
      const value = toNumber(node.getAttribute(attr));
      if (Number.isFinite(value)) return value;
    }
  }
  for (const child of [...location.children]) {
    const name = child.tagName.toLowerCase();
    if (!name.includes("precip") && !name.includes("rain")) continue;
    for (const attr of child.getAttributeNames()) {
      const value = toNumber(child.getAttribute(attr));
      if (Number.isFinite(value)) return value;
    }
  }
  return null;
}

async function fetchEpaRiverData() {
  if (!window.JSZip) throw new Error("JSZip library is not loaded.");
  const response = await fetch(CONFIG.epaZipUrl, { cache: "no-store" });
  if (!response.ok) throw new Error(`EPA ZIP fetch failed with HTTP ${response.status}.`);
  const buffer = await response.arrayBuffer();
  const zip = await JSZip.loadAsync(buffer);
  const file = Object.values(zip.files).find((entry) => !entry.dir);
  if (!file) throw new Error("EPA ZIP did not contain a readable data file.");
  const csvText = await file.async("text");
  return parseEpaCsv(csvText);
}

function parseEpaCsv(csvText) {
  const lines = csvText.split(/\r?\n/).filter(Boolean);
  const meta = {};
  const records = [];
  let header = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const delimiter = line.includes(";") ? ";" : ",";
    const cells = line.split(delimiter).map((part) => part.trim());
    const firstCell = cells[0].replace(/^#/, "").trim().toLowerCase();

    if (firstCell === "timestamp") {
      header = cells.map((name) => name.replace(/^#/, "").trim());
      continue;
    }

    if (line.startsWith("#")) {
      const key = cells[0].replace(/^#/, "").trim();
      meta[key] = cells.slice(1).join(delimiter).trim();
      continue;
    }

    if (!header) {
      const possibleHeader = cells.map((name) => name.replace(/^#/, "").trim());
      if (possibleHeader.some((name) => name.toLowerCase() === "timestamp")) header = possibleHeader;
      continue;
    }

    const row = Object.fromEntries(header.map((name, index) => [name, cells[index]]));
    const timestamp = parseEpaTimestamp(row.Timestamp);
    const epaStageM = toNumber(row.Value);
    const epaLevelToTbmM = toNumber(row["Absolute Value"]);
    const qualityCode = row["Quality Code Name"] || "Unknown";
    if (!timestamp || !Number.isFinite(epaLevelToTbmM)) continue;

    records.push({
      timestamp,
      epaStageM,
      epaLevelToTbmM,
      qualityCode,
      adjustedGaugeLevel: calculateAdjustedGaugeLevel(epaLevelToTbmM)
    });
  }

  records.sort((a, b) => a.timestamp - b.timestamp);
  if (!records.length) throw new Error("EPA CSV parsed successfully but contained no valid level records.");
  return { meta, records };
}

function parseEpaTimestamp(value) {
  if (!value) return null;
  const text = String(value).trim();
  const hasTimezone = /Z$|[+-]\d\d:?\d\d$/.test(text);
  const iso = hasTimezone ? text : text.replace(" ", "T") + "Z";
  return safeDate(iso);
}

function calculateAdjustedGaugeLevel(epaLevelToTbmM) {
  const value = toNumber(epaLevelToTbmM);
  if (!Number.isFinite(value)) return null;
  return (14.663747029404 * value) - 1452.0249992852;
}

function formatGaugeLevel(value) {
  const number = toNumber(value);
  if (!Number.isFinite(number)) return "Unavailable";
  return number.toFixed(1);
}

function calculateRateMPerHour(records) {
  if (!Array.isArray(records) || records.length < 2) return null;
  const latest = records[records.length - 1];
  const target = latest.timestamp.getTime() - 60 * 60 * 1000;
  const earlier = [...records].reverse().find((record) => record.timestamp.getTime() <= target) || records[0];
  const hours = (latest.timestamp - earlier.timestamp) / 36e5;
  if (hours <= 0) return null;
  return (latest.epaLevelToTbmM - earlier.epaLevelToTbmM) / hours;
}

function calculateRiverTrend(records) {
  const rateMPerHour = calculateRateMPerHour(records);
  if (!Number.isFinite(rateMPerHour)) return { label: "Unavailable", rateMPerHour: null, rateCmPerHour: null, text: "Insufficient readings" };
  const rateCmPerHour = rateMPerHour * 100;
  if (rateMPerHour > TREND_THRESHOLD_M_PER_HOUR) return { label: "Rising", rateMPerHour, rateCmPerHour, text: `Rising at ${rateCmPerHour.toFixed(1)} cm/hour` };
  if (rateMPerHour < -TREND_THRESHOLD_M_PER_HOUR) return { label: "Falling", rateMPerHour, rateCmPerHour, text: `Falling at ${Math.abs(rateCmPerHour).toFixed(1)} cm/hour` };
  return { label: "Steady", rateMPerHour, rateCmPerHour, text: `Steady, change less than ${TREND_THRESHOLD_CM_PER_HOUR.toFixed(1)} cm/hour` };
}

function predictCurrentRiverLevel(records, weatherData) {
  if (!Array.isArray(records) || records.length < 4) return { available: false, reason: "River prediction unavailable due to insufficient recent EPA readings." };
  const latest = records[records.length - 1];
  const now = new Date();
  const ageHours = (now - latest.timestamp) / 36e5;
  if (ageHours < 0) return { available: false, reason: "Latest EPA timestamp is later than current browser time." };
  if (ageHours > 6) return { available: false, reason: "EPA data is older than 6 hours." };

  const recentRecords = records.filter((record) => latest.timestamp - record.timestamp <= 3 * 36e5);
  const first = recentRecords[0] || records[records.length - 4];
  const spanHours = (latest.timestamp - first.timestamp) / 36e5;
  if (spanHours <= 0) return { available: false, reason: "Insufficient recent EPA span for prediction." };

  const slopeMPerHour = (latest.epaLevelToTbmM - first.epaLevelToTbmM) / spanHours;
  const trendAdjustmentM = slopeMPerHour * ageHours;
  const rainfall = aggregateRainfall(weatherData);
  const weightedRainMm = ((rainfall.future12.Owenninney || 0) + (rainfall.future12.Altnabrocky || 0)) / 2;
  const rainExcessMm = Math.max(0, weightedRainMm - RAINFALL_RESPONSE_MM_THRESHOLD);
  const rainAdjustmentM = Math.min(rainExcessMm * RAINFALL_LEVEL_RESPONSE_M_PER_MM, MAX_RAINFALL_ADJUSTMENT_M);
  const predictedLevelToTbmM = latest.epaLevelToTbmM + trendAdjustmentM + rainAdjustmentM;
  let confidence = "High";
  if (ageHours > 2 || rainAdjustmentM > 0.06) confidence = "Low";
  else if (ageHours > 0.5 || rainAdjustmentM > 0.025 || rainAdjustmentM > Math.abs(trendAdjustmentM)) confidence = "Medium";

  return { available: true, predictedLevelToTbmM, predictedAdjustedGauge: calculateAdjustedGaugeLevel(predictedLevelToTbmM), sourceLevelToTbmM: latest.epaLevelToTbmM, sourceTime: latest.timestamp, ageHours, slopeMPerHour, trendAdjustmentM, rainAdjustmentM, confidence };
}

async function fetchHighLowTides() {
  const response = await fetch(CONFIG.highLowTidesUrl, { cache: "no-store" });
  if (!response.ok) throw new Error(`High and low tide fetch failed with HTTP ${response.status}.`);
  const json = await response.json();
  return parseErddapTable(json).map(applyBlacksodTimeCorrection).filter((event) => event.correctedTime).sort((a, b) => a.correctedTime - b.correctedTime);
}

async function fetchTideCurve() {
  const response = await fetch(CONFIG.tideCurveUrl, { cache: "no-store" });
  if (!response.ok) throw new Error(`Tide curve fetch failed with HTTP ${response.status}.`);
  const json = await response.json();
  return parseErddapTable(json).map(applyBlacksodTimeCorrection).filter((point) => point.correctedTime).sort((a, b) => a.correctedTime - b.correctedTime);
}

function parseErddapTable(json) {
  const columns = json?.table?.columnNames;
  const rows = json?.table?.rows;
  if (!Array.isArray(columns) || !Array.isArray(rows)) return [];
  return rows.map((row) => Object.fromEntries(columns.map((column, index) => [column, row[index]])));
}

function applyBlacksodTimeCorrection(row) {
  const sourceUtcTime = row.time;
  const sourceDate = safeDate(sourceUtcTime);
  const correctedDate = sourceDate ? new Date(sourceDate.getTime() + 60 * 60 * 1000) : null;
  return { ...row, sourceTimeUtc: sourceUtcTime, correctedTime: correctedDate, waterLevelODMalin: toNumber(row.Water_Level_ODMalin), waterLevel: toNumber(row.Water_Level), waterLevelODM: toNumber(row.Water_Level_ODM), tideCategory: row.tide_time_category || row.tideCategory || "" };
}

function getNextHighLow(events) {
  const now = new Date();
  const future = events.filter((event) => event.correctedTime >= now);
  const high = future.find((event) => String(event.tideCategory).toLowerCase().includes("high"));
  const low = future.find((event) => String(event.tideCategory).toLowerCase().includes("low"));
  return { high, low };
}

function getTodayEvents(events) {
  const todayKey = irishDayKey(new Date());
  return events.filter((event) => irishDayKey(event.correctedTime) === todayKey);
}

function getWeekEvents(events) {
  const now = new Date();
  const limit = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  return events.filter((event) => event.correctedTime >= now && event.correctedTime <= limit);
}

function aggregateRainfall(weatherData) {
  const now = new Date();
  const pastStart = new Date(now.getTime() - 12 * 36e5);
  const futureEnd = new Date(now.getTime() + 12 * 36e5);
  const past12 = { Owenninney: null, Altnabrocky: null };
  const future12 = { Owenninney: null, Altnabrocky: null };

  for (const source of weatherData || []) {
    const historic = mergeRainfallHistoryAndForecast([source]).filter((item) => item.catchment === source.catchment && item.time >= pastStart && item.time <= now && Number.isFinite(item.rainfallMm));
    const future = (source.points || []).filter((point) => (point.from || point.to) >= now && (point.from || point.to) <= futureEnd && Number.isFinite(point.rainfallMm));
    past12[source.catchment] = historic.length ? sum(historic.map((item) => item.rainfallMm)) : null;
    future12[source.catchment] = future.length ? sum(future.map((item) => item.rainfallMm)) : null;
  }
  return { past12, future12 };
}

function saveForecastRainfallSnapshot(weatherData) {
  const existing = loadStoredRainfallSnapshots();
  const snapshotCreated = new Date();
  const additions = [];

  for (const source of weatherData || []) {
    for (const point of source.points || []) {
      const forecastTime = point.from || point.to;
      if (!forecastTime || !Number.isFinite(point.rainfallMm)) continue;
      additions.push({ snapshotCreated: snapshotCreated.toISOString(), catchment: source.catchment, forecastTime: forecastTime.toISOString(), rainfallMm: point.rainfallMm, sourceModelName: point.modelName || source.models?.[0]?.name || "unknown", category: forecastTime < snapshotCreated ? "nowcast" : "forecast" });
    }
  }

  const cutoff = snapshotCreated.getTime() - 14 * 24 * 36e5;
  const byCatchmentAndForecastTime = new Map();
  for (const item of [...existing, ...additions]) {
    const snapshotDate = safeDate(item.snapshotCreated);
    const forecastDate = safeDate(item.forecastTime);
    if (!snapshotDate || !forecastDate || snapshotDate.getTime() < cutoff) continue;
    const key = `${item.catchment}|${forecastDate.toISOString()}`;
    const previous = byCatchmentAndForecastTime.get(key);
    const previousSnapshotDate = previous ? safeDate(previous.snapshotCreated) : null;
    if (!previous || snapshotDate > previousSnapshotDate) byCatchmentAndForecastTime.set(key, { ...item, forecastTime: forecastDate.toISOString(), snapshotCreated: snapshotDate.toISOString() });
  }

  const combined = [...byCatchmentAndForecastTime.values()].sort((a, b) => safeDate(a.forecastTime) - safeDate(b.forecastTime)).slice(-5000);
  try { localStorage.setItem("bangorWaterLevel.rainfallSnapshots", JSON.stringify(combined)); }
  catch (error) { console.warn("Could not save rainfall snapshots.", error); }
}

function loadStoredRainfallSnapshots() {
  try {
    const raw = localStorage.getItem("bangorWaterLevel.rainfallSnapshots");
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const valid = parsed.map((item) => ({ ...item, snapshotDate: safeDate(item.snapshotCreated), time: safeDate(item.forecastTime), rainfallMm: toNumber(item.rainfallMm) })).filter((item) => item.snapshotDate && item.time && Number.isFinite(item.rainfallMm));
    const byCatchmentAndForecastTime = new Map();
    for (const item of valid) {
      const key = `${item.catchment}|${item.time.toISOString()}`;
      const previous = byCatchmentAndForecastTime.get(key);
      if (!previous || item.snapshotDate > previous.snapshotDate) byCatchmentAndForecastTime.set(key, item);
    }
    return [...byCatchmentAndForecastTime.values()];
  } catch (error) {
    console.warn("Stored rainfall snapshots are corrupt or unavailable.", error);
    return [];
  }
}

function mergeRainfallHistoryAndForecast(weatherData) {
  const now = new Date();
  const archived = loadStoredRainfallSnapshots().filter((item) => item.time <= now).map((item) => ({ catchment: item.catchment, time: item.time, rainfallMm: item.rainfallMm, category: "Archived forecast", sourceModelName: item.sourceModelName }));
  const future = [];
  for (const source of weatherData || []) {
    for (const point of source.points || []) {
      const time = point.from || point.to;
      if (!time || time < now || !Number.isFinite(point.rainfallMm)) continue;
      future.push({ catchment: source.catchment, time, rainfallMm: point.rainfallMm, category: "Forecast", sourceModelName: point.modelName });
    }
  }
  return [...archived, ...future].sort((a, b) => a.time - b.time);
}

function estimateRainfallLevelAdjustment(rainfallData) {
  const rainMm = Number.isFinite(rainfallData) ? rainfallData : 0;
  const excess = Math.max(0, rainMm - RAINFALL_RESPONSE_MM_THRESHOLD);
  return Math.min(excess * RAINFALL_LEVEL_RESPONSE_M_PER_MM, MAX_RAINFALL_ADJUSTMENT_M);
}

function renderAll() {
  renderStatus();
  renderMessages();
  renderSummaryCard();
  renderRiverChart();
  renderRainfallChart();
  renderWeatherForecast();
  renderTideForecast();
}

function renderStatus() {
  $("lastUpdated").textContent = state.lastSuccessfulUpdate ? `Last updated: ${formatIrishTime(state.lastSuccessfulUpdate)}` : "Last updated: Not yet loaded";
  updateStatusBadge("epaStatus", "EPA", state.statuses.epa);
  updateStatusBadge("weatherStatus", "Met Éireann", state.statuses.weather);
  updateStatusBadge("tideStatus", "Marine Institute", state.statuses.tide);
}

function updateStatusBadge(id, label, status) {
  const element = $(id);
  element.className = `status-badge status-${status}`;
  element.textContent = `${label}: ${status === "ok" ? "OK" : status === "error" ? "Warning" : "Loading"}`;
}

function renderMessages() {
  $("messages").innerHTML = state.errors.map((error) => `<div class="message">${escapeHtml(error.message)}</div>`).join("");
}

function renderSummaryCard() {
  const records = state.epaRecords;
  const latest = records[records.length - 1];
  const trend = calculateRiverTrend(records);
  const rainfall = aggregateRainfall(state.weatherData);
  const tides = getNextHighLow(state.highLowTides);
  const currentWeather = getNearestWeatherPoint();
  const pressureTrend = calculatePressureTrend();
  const lastHigh = [...state.highLowTides].reverse().find((event) => event.correctedTime < new Date() && event.tideCategory.toLowerCase().includes("high"));
  const lastLow = [...state.highLowTides].reverse().find((event) => event.correctedTime < new Date() && event.tideCategory.toLowerCase().includes("low"));
  const ageMinutes = latest ? Math.max(0, Math.round((new Date() - latest.timestamp) / 60000)) : null;

  const cells = [
    summaryCell("EPA level to TBM", latest ? `${latest.epaLevelToTbmM.toFixed(3)} m` : "Unavailable", "Observed EPA Absolute Value"),
    summaryCell("EPA stage level", latest && Number.isFinite(latest.epaStageM) ? `${latest.epaStageM.toFixed(3)} m` : "Unavailable", "EPA relative Value column"),
    summaryCell("Adjusted gauge level", latest ? formatGaugeLevel(latest.adjustedGaugeLevel) : "Unavailable", "Calculated from EPA level to TBM"),
    summaryCell("River trend", trend.label, trend.rateCmPerHour == null ? trend.text : `${trend.rateCmPerHour >= 0 ? "+" : ""}${trend.rateCmPerHour.toFixed(1)} cm/hour. Threshold ±0.5 cm/hour`),
    summaryCell("EPA data age", ageMinutes == null ? "Unavailable" : `${ageMinutes} min`, latest ? formatIrishTime(latest.timestamp) : "No timestamp"),
    summaryCell("Predicted current level", state.riverPrediction?.available ? `${state.riverPrediction.predictedLevelToTbmM.toFixed(3)} m` : "Unavailable", state.riverPrediction?.available ? `Confidence: ${state.riverPrediction.confidence}. Gauge ${formatGaugeLevel(state.riverPrediction.predictedAdjustedGauge)}` : state.riverPrediction?.reason || "No prediction"),
    summaryCell("Past 12h rainfall", rainfallText(rainfall.past12), "Archived forecast rainfall unless observed rainfall is added"),
    summaryCell("Next 12h rainfall", rainfallText(rainfall.future12), "Met Éireann forecast rainfall"),
    summaryCell("Last high tide", lastHigh ? formatIrishTime(lastHigh.correctedTime) : "Unavailable", tideLevelText(lastHigh)),
    summaryCell("Last low tide", lastLow ? formatIrishTime(lastLow.correctedTime) : "Unavailable", tideLevelText(lastLow)),
    summaryCell("Next high tide", tides.high ? formatIrishTime(tides.high.correctedTime) : "Unavailable", tideLevelText(tides.high)),
    summaryCell("Next low tide", tides.low ? formatIrishTime(tides.low.correctedTime) : "Unavailable", tideLevelText(tides.low)),
    summaryCell("Wind", currentWeather ? `${currentWeather.windDirectionName || ""} ${mpsToKmh(currentWeather.windSpeedMps)} km/h` : "Unavailable", currentWeather?.windName || "Nearest forecast wind"),
    summaryCell("Pressure", currentWeather?.pressureHpa ? `${currentWeather.pressureHpa.toFixed(0)} hPa` : "Unavailable", pressureTrend)
  ];

  $("summaryGrid").className = "summary-grid";
  $("summaryGrid").innerHTML = cells.join("");
}

function summaryCell(label, value, detail) {
  return `<article class="summary-item"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><div class="detail">${escapeHtml(detail || "")}</div></article>`;
}

function renderRiverChart() {
  const fallback = $("riverChartFallback");
  if (!window.Chart) {
    fallback.hidden = false;
    const latest = state.epaRecords[state.epaRecords.length - 1];
    fallback.innerHTML = latest ? `Latest EPA level to TBM: ${latest.epaLevelToTbmM.toFixed(3)} m. Adjusted gauge: ${formatGaugeLevel(latest.adjustedGaugeLevel)}. ${calculateRiverTrend(state.epaRecords).text}.` : "River chart unavailable because Chart.js could not load.";
    return;
  }
  fallback.hidden = true;
  const canvas = $("riverChart");
  const hours = RANGES[state.activeRange] || 6;
  const now = new Date();
  const start = new Date(now.getTime() - hours * 36e5);
  const records = state.epaRecords.filter((record) => record.timestamp >= start);
  const observed = records.map((record) => ({ x: record.timestamp.getTime(), y: record.epaLevelToTbmM }));
  const adjusted = records.map((record) => ({ x: record.timestamp.getTime(), y: record.adjustedGaugeLevel }));
  const predicted = [];

  if (state.riverPrediction?.available) {
    const latest = state.epaRecords[state.epaRecords.length - 1];
    predicted.push({ x: latest.timestamp.getTime(), y: latest.epaLevelToTbmM });
    predicted.push({ x: now.getTime(), y: state.riverPrediction.predictedLevelToTbmM });
  }

  const latestTimestamp = state.epaRecords[state.epaRecords.length - 1]?.timestamp?.getTime();
  const config = {
    type: "line",
    data: { datasets: [
      { label: "Observed EPA Level to TBM, m", data: observed, yAxisID: "y", pointRadius: 0, borderWidth: 2, tension: 0.2 },
      { label: "Predicted EPA Level to TBM, m", data: predicted, yAxisID: "y", pointRadius: 4, borderWidth: 2, borderDash: [7, 5], tension: 0 },
      { label: "Adjusted Gauge Level", data: adjusted, yAxisID: "y1", pointRadius: 0, borderWidth: 1, borderDash: [2, 4], tension: 0.2 }
    ]},
    options: {
      responsive: true,
      maintainAspectRatio: false,
      parsing: false,
      interaction: { mode: "nearest", intersect: false },
      plugins: { legend: { position: "bottom" }, tooltip: { callbacks: { title: (items) => formatIrishTime(new Date(items[0].parsed.x)), label: (item) => item.dataset.yAxisID === "y1" ? `${item.dataset.label}: ${formatGaugeLevel(item.parsed.y)}` : `${item.dataset.label}: ${item.parsed.y.toFixed(3)} m` } } },
      scales: {
        x: { type: "linear", min: start.getTime(), max: now.getTime(), ticks: { callback: (value) => formatIrishTimeOnly(new Date(value)), maxRotation: 0, autoSkip: true } },
        y: { title: { display: true, text: "EPA Level to TBM, m" }, ticks: { callback: (value) => Number(value).toFixed(3) } },
        y1: { position: "right", grid: { drawOnChartArea: false }, title: { display: true, text: "Adjusted Gauge Level" }, ticks: { callback: (value) => formatGaugeLevel(value) } }
      }
    },
    plugins: [timeMarkerPlugin(now.getTime(), latestTimestamp)]
  };
  if (state.charts.river) state.charts.river.destroy();
  state.charts.river = new Chart(canvas, config);
}

function renderRainfallChart() {
  if (!window.Chart) return;
  const now = new Date();
  const start = new Date(now.getTime() - 12 * 36e5);
  const end = new Date(now.getTime() + 12 * 36e5);
  const rainfall = mergeRainfallHistoryAndForecast(state.weatherData).filter((item) => item.time >= start && item.time <= end);
  const labels = [];
  for (let offset = -12; offset <= 12; offset += 3) labels.push(new Date(now.getTime() + offset * 36e5));
  const buckets = labels.map((labelTime, index) => ({ label: formatIrishTimeOnly(labelTime), start: labelTime, end: labels[index + 1] || end }));
  const makeData = (catchment, category) => buckets.map((bucket) => sum(rainfall.filter((item) => item.catchment === catchment && item.category === category && item.time >= bucket.start && item.time < bucket.end).map((item) => item.rainfallMm)));

  const totals = aggregateRainfall(state.weatherData);
  $("rainfallTotals").innerHTML = `${miniCell("Owenninney past 12h", mmText(totals.past12.Owenninney), "Archived forecast")}${miniCell("Altnabrocky past 12h", mmText(totals.past12.Altnabrocky), "Archived forecast")}${miniCell("Owenninney next 12h", mmText(totals.future12.Owenninney), "Forecast")}${miniCell("Altnabrocky next 12h", mmText(totals.future12.Altnabrocky), "Forecast")}`;
  $("rainfallLookbackMessage").textContent = state.rainfallSnapshots.length ? "Historic rainfall lookback uses locally archived Met Éireann forecast snapshots unless an observed rainfall source is added." : "Historic rainfall lookback will build as this browser captures forecast snapshots.";

  const config = {
    type: "bar",
    data: { labels: buckets.map((bucket) => bucket.label), datasets: [
      { label: "Owenninney archived forecast mm", data: makeData("Owenninney", "Archived forecast"), borderWidth: 2, borderDash: [3, 3] },
      { label: "Altnabrocky archived forecast mm", data: makeData("Altnabrocky", "Archived forecast"), borderWidth: 2, borderDash: [6, 3] },
      { label: "Owenninney future forecast mm", data: makeData("Owenninney", "Forecast"), borderWidth: 2 },
      { label: "Altnabrocky future forecast mm", data: makeData("Altnabrocky", "Forecast"), borderWidth: 2 }
    ]},
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom" } }, scales: { y: { beginAtZero: true, title: { display: true, text: "Rainfall, mm" } } } }
  };
  if (state.charts.rainfall) state.charts.rainfall.destroy();
  state.charts.rainfall = new Chart($("rainfallChart"), config);
}

function renderWeatherForecast() {
  const days = buildDailyWeather();
  $("weatherForecast").innerHTML = days.length ? days.map((day) => {
    const temperatureText = Number.isFinite(day.tempMin) && Number.isFinite(day.tempMax) ? `${day.tempMin.toFixed(0)} to ${day.tempMax.toFixed(0)} °C` : "Temp unavailable";
    const cloudText = Number.isFinite(day.cloud) ? `${day.cloud.toFixed(0)}% cloud` : "Cloud unavailable";
    return `<article class="forecast-day"><div class="weather-symbol" aria-hidden="true">${day.symbol}</div><div><h3>${escapeHtml(formatIrishDate(day.date))}</h3><div class="forecast-meta"><span>${escapeHtml(temperatureText)}</span><span>Ow ${escapeHtml(mmText(day.rainOwenninney))}</span><span>Alt ${escapeHtml(mmText(day.rainAltnabrocky))}</span><span>${escapeHtml(day.pressureText)}</span><span>${escapeHtml(cloudText)}</span><span>${escapeHtml(day.wind)}</span></div></div></article>`;
  }).join("") : `<p>Weather forecast unavailable.</p>`;
}

function renderTideForecast() {
  const next = getNextHighLow(state.highLowTides);
  $("tideSummary").innerHTML = `${miniCell("Next high tide", next.high ? formatIrishTime(next.high.correctedTime) : "Unavailable", tideLevelText(next.high))}${miniCell("Next low tide", next.low ? formatIrishTime(next.low.correctedTime) : "Unavailable", tideLevelText(next.low))}`;
  const today = getTodayEvents(state.highLowTides);
  $("todayTides").innerHTML = `<h3>Today corrected tides</h3>` + (today.length ? today.map(tideItem).join("") : "<p>No remaining corrected tide events for today.</p>");
  const week = getWeekEvents(state.highLowTides);
  $("weekTides").innerHTML = `<h3>Next 7 days corrected tides</h3>` + (week.length ? week.map(tideItem).join("") : "<p>Tide events unavailable.</p>");
  renderTideChart();
}

function renderTideChart() {
  if (!window.Chart || !state.tideCurve.length) return;
  const now = new Date();
  const end = new Date(now.getTime() + 7 * 24 * 36e5);
  const points = state.tideCurve.filter((point) => point.correctedTime >= now && point.correctedTime <= end).map((point) => ({ x: point.correctedTime.getTime(), y: Number.isFinite(point.waterLevelODM) ? point.waterLevelODM : point.waterLevel })).filter((point) => Number.isFinite(point.y));
  const config = { type: "line", data: { datasets: [{ label: "Corrected Ballyglass tide prediction", data: points, pointRadius: 0, borderWidth: 2, tension: 0.25 }] }, options: { responsive: true, maintainAspectRatio: false, parsing: false, plugins: { legend: { position: "bottom" }, tooltip: { callbacks: { title: (items) => formatIrishTime(new Date(items[0].parsed.x)), label: (item) => `${item.dataset.label}: ${item.parsed.y.toFixed(2)} m` } } }, scales: { x: { type: "linear", min: now.getTime(), max: end.getTime(), ticks: { callback: (value) => formatIrishDate(new Date(value)) } }, y: { title: { display: true, text: "Tide level, m" } } } } };
  if (state.charts.tide) state.charts.tide.destroy();
  state.charts.tide = new Chart($("tideChart"), config);
}

function setActiveTimeRange(range) {
  if (!RANGES[range]) return;
  state.activeRange = range;
  document.querySelectorAll(".range-button").forEach((button) => button.classList.toggle("active", button.dataset.range === range));
  renderRiverChart();
}

function showError(message, context) {
  console.warn(message, context);
  state.errors.push({ message, context });
}

function buildDailyWeather() {
  const days = new Map();
  for (const source of state.weatherData || []) {
    for (const point of source.points || []) {
      const date = point.from || point.to;
      if (!date) continue;
      const key = irishDayKey(date);
      if (!days.has(key)) days.set(key, { date, temps: [], rain: { Owenninney: 0, Altnabrocky: 0 }, clouds: [], pressure: [], wind: [], gust: [] });
      const day = days.get(key);
      if (Number.isFinite(point.temperatureC)) day.temps.push(point.temperatureC);
      if (Number.isFinite(point.rainfallMm)) day.rain[source.catchment] += point.rainfallMm;
      if (Number.isFinite(point.cloudinessPct)) day.clouds.push(point.cloudinessPct);
      if (Number.isFinite(point.pressureHpa)) day.pressure.push(point.pressureHpa);
      if (Number.isFinite(point.windSpeedMps)) day.wind.push({ speed: point.windSpeedMps, direction: point.windDirectionName });
      if (Number.isFinite(point.windGustMps)) day.gust.push(point.windGustMps);
    }
  }
  return [...days.values()].slice(0, 7).map((day) => {
    const rainTotal = day.rain.Owenninney + day.rain.Altnabrocky;
    const cloud = average(day.clouds);
    const tempMin = day.temps.length ? Math.min(...day.temps) : null;
    const tempMax = day.temps.length ? Math.max(...day.temps) : null;
    const windPoint = day.wind[Math.floor(day.wind.length / 2)] || {};
    const validGusts = day.gust.filter(Number.isFinite);
    const gust = validGusts.length ? Math.max(...validGusts) : null;
    return { date: day.date, symbol: rainTotal > 4 ? "☔" : cloud > 75 ? "☁" : cloud > 35 ? "⛅" : "☀", tempMin, tempMax, rainOwenninney: day.rain.Owenninney, rainAltnabrocky: day.rain.Altnabrocky, pressureText: pressureArrow(day.pressure), cloud: Number.isFinite(cloud) ? cloud : null, wind: `${windPoint.direction || ""} ${mpsToKmh(windPoint.speed)} km/h${Number.isFinite(gust) ? ` gust ${mpsToKmh(gust)}` : ""}` };
  });
}

function getNearestWeatherPoint() {
  const now = new Date();
  const points = state.weatherData.flatMap((source) => source.points || []);
  return points.filter((point) => point.from || point.to).sort((a, b) => Math.abs((a.from || a.to) - now) - Math.abs((b.from || b.to) - now))[0];
}

function calculatePressureTrend() {
  const points = state.weatherData.flatMap((source) => source.points || []).filter((point) => Number.isFinite(point.pressureHpa)).sort((a, b) => (a.from || a.to) - (b.from || b.to));
  return pressureArrow(points.map((point) => point.pressureHpa));
}

function pressureArrow(values) {
  if (!values || values.length < 2) return "Pressure trend unavailable";
  const delta = values[values.length - 1] - values[0];
  if (delta > 1) return "Pressure rising ↑";
  if (delta < -1) return "Pressure falling ↓";
  return "Pressure steady →";
}

function tideItem(event) {
  return `<article class="tide-item"><div><strong>${escapeHtml(event.tideCategory || "Tide")}</strong><div class="tide-meta"><span>${formatIrishTime(event.correctedTime)}</span><span>${tideLevelText(event)}</span></div></div><span class="source-chip corrected">Corrected tide</span></article>`;
}

function miniCell(label, value, detail) {
  return `<article class="mini-item"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><div class="detail">${escapeHtml(detail || "")}</div></article>`;
}

function timeMarkerPlugin(nowMs, latestMs) {
  return {
    id: "timeMarkerPlugin",
    afterDraw(chart) {
      const xScale = chart.scales.x;
      const area = chart.chartArea;
      if (!xScale || !area) return;
      const drawLine = (ms, label) => {
        if (!Number.isFinite(ms) || ms < xScale.min || ms > xScale.max) return;
        const x = xScale.getPixelForValue(ms);
        const ctx = chart.ctx;
        ctx.save();
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1;
        ctx.strokeStyle = "rgba(16,32,29,0.55)";
        ctx.beginPath();
        ctx.moveTo(x, area.top);
        ctx.lineTo(x, area.bottom);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "rgba(16,32,29,0.85)";
        ctx.font = "12px system-ui";
        ctx.fillText(label, x + 4, area.top + 14);
        ctx.restore();
      };
      drawLine(nowMs, "Now");
      drawLine(latestMs, "Last EPA");
    }
  };
}

function rainfallText(values) {
  return `Ow ${mmText(values.Owenninney)}. Alt ${mmText(values.Altnabrocky)}`;
}

function tideLevelText(event) {
  if (!event) return "Corrected tide prediction";
  const value = Number.isFinite(event.waterLevelODMalin) ? event.waterLevelODMalin : event.waterLevelODM;
  return Number.isFinite(value) ? `${value.toFixed(2)} m OD Malin` : "Level unavailable";
}

function mmText(value) { return Number.isFinite(value) ? `${value.toFixed(1)} mm` : "Unavailable"; }
function mpsToKmh(value) { return Number.isFinite(value) ? Math.round(value * 3.6) : "Unavailable"; }
function sum(values) { return values.reduce((total, value) => total + (Number.isFinite(value) ? value : 0), 0); }
function average(values) { const valid = values.filter(Number.isFinite); return valid.length ? sum(valid) / valid.length : null; }
function toNumber(value) { if (value === null || value === undefined || value === "") return null; const number = Number(String(value).replace(",", ".")); return Number.isFinite(number) ? number : null; }
function safeDate(value) { if (!value) return null; const date = value instanceof Date ? value : new Date(value); return Number.isNaN(date.getTime()) ? null : date; }
function irishDayKey(date) { return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Dublin", year: "numeric", month: "2-digit", day: "2-digit" }).format(date); }
function escapeHtml(value) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }
