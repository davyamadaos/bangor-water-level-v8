<!doctype html>
<html lang="en-IE">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Bangor Water Level</title>
  <meta name="description" content="River level, rainfall, weather, and tide conditions for Bangor salmon fishing">
  <link rel="stylesheet" href="styles.css">
  <!-- Chart.js, MIT Licence, https://www.chartjs.org/ -->
  <script defer src="https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js"></script>
  <!-- JSZip, MIT or GPLv3 dual licence, https://stuk.github.io/jszip/ -->
  <script defer src="https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js"></script>
  <script defer src="app.js"></script>
</head>
<body>
  <a class="skip-link" href="#main">Skip to main content</a>

  <header class="site-header">
    <div class="header-main">
      <div>
        <h1>Bangor Water Level</h1>
        <p class="subtitle">River level, rainfall, weather, and tide conditions for Bangor salmon fishing</p>
      </div>
      <button id="refreshButton" class="refresh-button" type="button" aria-label="Refresh river, weather, rainfall, and tide data">
        Refresh
      </button>
    </div>

    <div class="status-row" aria-label="Data source status">
      <span id="lastUpdated" class="last-updated">Last updated: Not yet loaded</span>
      <span id="epaStatus" class="status-badge status-waiting">EPA</span>
      <span id="weatherStatus" class="status-badge status-waiting">Met Éireann</span>
      <span id="tideStatus" class="status-badge status-waiting">Marine Institute</span>
    </div>
  </header>

  <main id="main">
    <section id="messages" class="messages" aria-live="polite"></section>

    <section class="card summary-card" aria-labelledby="summaryTitle">
      <div class="section-heading">
        <h2 id="summaryTitle">Current conditions</h2>
        <span class="source-chip observed">Observed</span>
      </div>
      <div id="summaryGrid" class="summary-grid loading-grid">
        <p>Loading current conditions.</p>
      </div>
    </section>

    <section class="card warning-card" aria-labelledby="warningsTitle">
      <div class="section-heading">
        <h2 id="warningsTitle">Met Éireann weather warnings</h2>
        <span class="source-chip forecast">External check</span>
      </div>
      <p>
        Check current Met Éireann weather warnings before relying on forecast conditions:
        <a href="https://www.met.ie/warnings" rel="noopener noreferrer" target="_blank">Met Éireann weather warnings</a>.
      </p>
    </section>

    <section class="card" aria-labelledby="officialEpaTitle">
      <div class="section-heading">
        <h2 id="officialEpaTitle">Official EPA Hydronet chart</h2>
        <span class="source-chip observed">Observed</span>
      </div>
      <figure class="epa-figure">
        <img
          id="epaChartImage"
          src="https://epawebapp.epa.ie/Hydronet/output/internet/stations/CAS/33008/S/extralarge_3m_extralarge.png"
          alt="Official EPA Hydronet 3-month level chart for Bangor station 33008"
          loading="lazy">
        <figcaption>Official EPA Hydronet 3-month level chart for Bangor station 33008.</figcaption>
      </figure>
    </section>

    <section class="card chart-card" aria-labelledby="riverChartTitle">
      <div class="section-heading">
        <h2 id="riverChartTitle">River level chart</h2>
        <span class="source-chip predicted">Predicted shown separately</span>
      </div>
      <div class="range-controls" role="group" aria-label="River chart time range">
        <button type="button" class="range-button active" data-range="6h" aria-label="Show last 6 hours">6h</button>
        <button type="button" class="range-button" data-range="12h" aria-label="Show last 12 hours">12h</button>
        <button type="button" class="range-button" data-range="24h" aria-label="Show last 24 hours">24h</button>
        <button type="button" class="range-button" data-range="48h" aria-label="Show last 48 hours">48h</button>
        <button type="button" class="range-button" data-range="3d" aria-label="Show last 3 days">3d</button>
        <button type="button" class="range-button" data-range="7d" aria-label="Show last 7 days">7d</button>
      </div>
      <div class="chart-wrap">
        <canvas id="riverChart" aria-label="River level to TBM and adjusted gauge level chart"></canvas>
      </div>
      <p class="chart-note">Left axis: EPA Level to TBM, m. Right axis: Adjusted Gauge Level, displayed to 1 decimal place.</p>
      <div id="riverChartFallback" class="chart-fallback" hidden></div>
    </section>

    <section class="card chart-card" aria-labelledby="rainfallChartTitle">
      <div class="section-heading">
        <h2 id="rainfallChartTitle">Rainfall history and forecast</h2>
        <span class="source-chip archived">Archived forecast</span>
        <span class="source-chip forecast">Forecast</span>
      </div>
      <div id="rainfallTotals" class="mini-grid"></div>
      <div class="chart-wrap">
        <canvas id="rainfallChart" aria-label="Rainfall bar chart for Owenninney and Altnabrocky"></canvas>
      </div>
      <p id="rainfallLookbackMessage" class="chart-note">
        Historic rainfall lookback will build as this browser captures forecast snapshots.
      </p>
    </section>

    <section class="card" aria-labelledby="weatherTitle">
      <div class="section-heading">
        <h2 id="weatherTitle">Seven-day weather forecast</h2>
        <span class="source-chip forecast">Forecast</span>
      </div>
      <div id="weatherForecast" class="forecast-grid"></div>
    </section>

    <section class="card" aria-labelledby="tideTitle">
      <div class="section-heading">
        <h2 id="tideTitle">Seven-day tide forecast</h2>
        <span class="source-chip corrected">Corrected tide</span>
      </div>
      <p class="important-note">
        Times shown are Marine Institute Ballyglass tidal predictions adjusted to Irish local time and delayed by +1 hour for observed Blacksod Bay timing.
      </p>
      <div id="tideSummary" class="mini-grid"></div>
      <div id="todayTides" class="tide-list"></div>
      <div class="chart-wrap tide-chart-wrap">
        <canvas id="tideChart" aria-label="Corrected Ballyglass tide prediction curve"></canvas>
      </div>
      <div id="weekTides" class="tide-list"></div>
    </section>
  </main>

  <footer class="site-footer">
    <h2>Attribution, licence, and notes</h2>
    <p>EPA Hydronet river level data and chart from EPA Hydronet, Bangor station 33008.</p>
    <p>Copyright Met Éireann. Source: met.ie. Met Éireann data is published under a Creative Commons Attribution 4.0 International licence with Met Éireann custom terms where applicable. Met Éireann does not accept liability for errors, omissions, availability, loss, or damage arising from use of the data. Forecast data may have been modified, aggregated, or visualised in this application.</p>
    <p>Marine Institute tide prediction data is used under Creative Commons Attribution 4.0.</p>
    <p>Times shown are Marine Institute Ballyglass tidal predictions adjusted to Irish local time and delayed by +1 hour for observed Blacksod Bay timing.</p>
    <p>Predicted river level is a simple extrapolation from recent EPA readings with a rough rainfall-response adjustment. It is not a calibrated hydrological forecast.</p>
    <p>Historic rainfall lookback uses locally archived Met Éireann forecast snapshots unless an observed rainfall source is added.</p>
    <p>Open-source libraries: Chart.js, MIT Licence. JSZip, MIT or GPLv3 dual licence.</p>
  </footer>
</body>
</html>
