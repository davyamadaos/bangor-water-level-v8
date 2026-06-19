# Bangor Water Level

Bangor Water Level is a static GitHub Pages web application for salmon fishers on a spate river. It displays river level, rainfall history and forecast, weather forecast, wind, pressure trend, tide information, and supporting charts for Bangor salmon fishing.

The application runs entirely in the browser. It uses no server-side code, no database, no authentication, no paid services, and no build step.

## Files

```text
index.html
styles.css
app.js
README.md
LICENSE
.github/workflows/pages.yml
```

## Data sources

The app uses these public data sources.

1. EPA Hydronet river level data and official chart for Bangor station 33008.
   - Chart image: `https://epawebapp.epa.ie/Hydronet/output/internet/stations/CAS/33008/S/extralarge_3m_extralarge.png`
   - 3-month ZIP: `https://epawebapp.epa.ie/Hydronet/output/internet/stations/CAS/33008/S/3_months.zip`

2. Met Éireann point forecast XML.
   - Owenninney Catchment: `http://openaccess.pf.api.met.ie/metno-wdb2ts/locationforecast?lat=54.17367844330243;long=-9.557268307800891`
   - Altnabrocky Catchment: `http://openaccess.pf.api.met.ie/metno-wdb2ts/locationforecast?lat=54.060586257345676;long=-9.61700646706997`

   The app uses HTTPS equivalents in code because GitHub Pages is served over HTTPS and browsers commonly block mixed HTTP content.

3. Marine Institute ERDDAP tide prediction data for Ballyglass.
   - High and low tide events: `https://erddap.marine.ie/erddap/tabledap/IMI_TidePrediction_HighLow.json?stationID,time,longitude,latitude,tide_time_category,Water_Level_ODMalin&stationID=%22Ballyglass%22&time%3E=now&time%3C=now%2B7days&orderBy(%22time%22)`
   - Continuous tide prediction: `https://erddap.marine.ie/erddap/tabledap/IMI-TidePrediction.json?time,longitude,latitude,stationID,Water_Level,Water_Level_ODM&stationID=%22Ballyglass%22&time%3E=now&time%3C=now%2B7days&orderBy(%22time%22)`

## Deployment to GitHub Pages

1. Create a new GitHub repository.
2. Copy all files and folders from this package into the repository.
3. Commit and push to the `main` branch.
4. Open the repository in GitHub.
5. Go to **Settings** > **Pages**.
6. Set **Source** to **GitHub Actions**.
7. The included `.github/workflows/pages.yml` workflow will publish the static site after the next push.

No Node.js build, package installation, or server is required.

## EPA ZIP parsing

The EPA ZIP file is fetched in the browser and read using JSZip. The ZIP contains a delimited text file with metadata rows beginning with `#` and data rows similar to:

```text
#Station Name;BANGOR
#Station Number;33008
#Station Parameter Name;Stage
#Unit Symbol;m
#station_gauge_datum_unit;m (TBM)
#Timestamp;Value;Absolute Value;Quality Code Name
2026-03-19 00:00:00;0.472;99.176;Unchecked
```

The parser treats `#Timestamp;Value;Absolute Value;Quality Code Name` as the column header, not as metadata. It parses:

- `Timestamp`
- `Value`
- `Absolute Value`
- `Quality Code Name`

The app treats `Value` as the EPA relative stage level in metres. It treats `Absolute Value` as the EPA level to TBM in metres because the metadata states `#station_gauge_datum_unit;m (TBM)`.

The dynamic river graph primary y-axis uses `Absolute Value`, labelled:

```text
EPA Level to TBM, m
```

## Adjusted gauge level

The adjusted gauge level is calculated from EPA level to TBM using:

```javascript
adjustedGaugeLevel = (14.663747029404 * epaLevelToTbmM) - 1452.0249992852;
```

The equation uses the EPA `Absolute Value` column as the input. It does not use the relative `Value` stage column.

Adjusted gauge values are calculated internally using full numerical precision. Displayed adjusted gauge values are rounded to 1 decimal place in the summary card, secondary chart axis, chart tooltips, and any river detail display.

## River trend

River trend is calculated from recent EPA level to TBM readings. The app compares the most recent reading with a reading approximately 1 hour earlier and calculates a rate in metres per hour internally.

The displayed rate is converted to centimetres per hour:

```javascript
const rateCmPerHour = rateMPerHour * 100;
```

The default trend threshold is:

```text
0.005 m/hour = 0.5 cm/hour
```

The display uses:

- `Rising` where the rate is greater than `+0.5 cm/hour`
- `Falling` where the rate is less than `-0.5 cm/hour`
- `Steady` where the change is within the threshold

## Predicted current river level

If the latest EPA timestamp lags behind the current browser time, the app estimates a current level. This prediction is intentionally simple and transparent. It is not a calibrated hydrological forecast.

The prediction uses recent EPA level trend, elapsed time since the latest EPA reading, a rough rainfall-response adjustment, and a confidence label.

The rough rainfall adjustment uses configurable constants in `app.js`:

```javascript
const RAINFALL_RESPONSE_MM_THRESHOLD = 2.0;
const RAINFALL_LEVEL_RESPONSE_M_PER_MM = 0.002;
const RAINFALL_RESPONSE_LAG_HOURS = 2;
const MAX_RAINFALL_ADJUSTMENT_M = 0.15;
```

The conceptual method is:

```javascript
rainExcessMm = Math.max(0, weightedRainMm - RAINFALL_RESPONSE_MM_THRESHOLD);
rainAdjustmentM = Math.min(
  rainExcessMm * RAINFALL_LEVEL_RESPONSE_M_PER_MM,
  MAX_RAINFALL_ADJUSTMENT_M
);
predictedLevelToTbmM = latestLevelToTbmM + trendAdjustmentM + rainAdjustmentM;
```

Confidence is shown as high, medium, low, or unavailable depending on EPA data age, rainfall adjustment size, and available recent readings.

The UI includes this note:

```text
Predicted river level is a simple extrapolation from recent EPA readings with a rough rainfall-response adjustment. It is not a calibrated hydrological forecast.
```

## Rainfall history and forecast

No separate observed historic rainfall source has been provided. The app saves Met Éireann forecast rainfall snapshots locally in the browser using `localStorage`.

Each saved record includes snapshot creation time, catchment name, forecast time, rainfall amount, source model name if available, and forecast or nowcast category.

Saved rainfall snapshots are retained for approximately 14 days and are used to build at least a 7-day historic lookback. Historic bars derived from saved forecasts are labelled as archived forecast rainfall. They are not labelled as observed rainfall. The app deduplicates snapshots by catchment and forecast time to avoid repeated refreshes double-counting rainfall.

The UI includes this note:

```text
Historic rainfall lookback uses locally archived Met Éireann forecast snapshots unless an observed rainfall source is added.
```

If the browser is opened for the first time, historic rainfall may be unavailable until snapshots have accumulated.

## Weather forecast parsing

Met Éireann XML is parsed client-side using `DOMParser`. The app extracts, where present:

- Forecast time
- Temperature
- Wind direction, degrees and compass name
- Wind speed, Beaufort, and description
- Wind gust
- Pressure
- Cloudiness
- Low, medium, and high cloud values
- Humidity
- Rainfall or precipitation fields
- Metadata such as forecast creation time and model details where available

Rainfall parsing is defensive. It checks likely tags such as `precipitation`, `minprecipitation`, `maxprecipitation`, `rain`, and `rainfall`. If rainfall fields are absent, affected periods are shown as unavailable and the app continues to render other data.

## Tide correction

Marine Institute ERDDAP time values are treated as UTC ISO 8601 timestamps. The app preserves the original source time as:

```javascript
sourceTimeUtc
```

It then applies the Blacksod Bay timing correction exactly as:

```javascript
correctedTime = new Date(sourceUtcTime).getTime() + 60 * 60 * 1000;
```

The corrected time is used for display, next high tide, next low tide, today tide filtering, seven-day tide list, and optional tide curve plotting.

All user-facing tide times are displayed in Irish local time using the `Europe/Dublin` time zone.

The UI includes this exact note:

```text
Times shown are Marine Institute Ballyglass tidal predictions adjusted to Irish local time and delayed by +1 hour for observed Blacksod Bay timing.
```

## Time handling

All user-facing times are formatted using `Intl.DateTimeFormat` with:

```javascript
timeZone: "Europe/Dublin"
```

EPA timestamps do not include an explicit timezone in the source CSV. This implementation appends `Z` and parses them consistently as UTC timestamps before displaying them in Irish local time. Verify the EPA timestamp convention before relying on exact time comparisons in production.

Met Éireann forecast timestamps are parsed from ISO values in the XML. Marine Institute timestamps are parsed as UTC ISO timestamps.

## Refresh behaviour

The app fetches data on page load and refreshes every 15 minutes using `setInterval`. It prevents overlapping refreshes, shows source-specific status badges, and keeps previously loaded values on screen if a refresh fails.

## Error handling

The app handles failed fetch requests, CORS or mixed-content failures, missing XML fields, missing JSON fields, empty datasets, malformed EPA rows, missing rainfall values, unexpected ZIP content, invalid dates, non-numeric river levels, chart rendering failures, data refresh failures, and localStorage quota or corruption issues.

Technical details are logged to the browser console. Plain-language messages are displayed in the UI.

## Browser compatibility

The app assumes a modern browser with support for `fetch`, `Promise`, `async` and `await`, `DOMParser`, `Intl.DateTimeFormat`, `localStorage`, Canvas, and ES2020 JavaScript features.

It is designed for mobile-first use on phones outdoors.

## Third-party libraries

| Library | Purpose | CDN URL | Licence |
|---|---|---|---|
| Chart.js | River, rainfall, and tide charts | `https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js` | MIT Licence |
| JSZip | Browser-side EPA ZIP parsing | `https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js` | MIT or GPLv3 dual licence |

Verify dependency licences before public deployment.

## Data licensing and attribution

### EPA Hydronet

River level data and chart are from EPA Hydronet, Bangor station 33008.

The exact reuse terms for the specific EPA Hydronet ZIP and PNG endpoints should be verified before public launch. This README does not imply an open licence for EPA Hydronet data unless confirmed by EPA.

### Met Éireann

Use this acknowledgement in public deployments:

```text
Copyright Met Éireann.
Source: met.ie.
Met Éireann data is published under a Creative Commons Attribution 4.0 International licence with Met Éireann custom terms where applicable.
Met Éireann does not accept liability for errors, omissions, availability, loss, or damage arising from use of the data.
Forecast data may have been modified, aggregated, or visualised in this application.
```

### Marine Institute

Marine Institute tide prediction data is used under Creative Commons Attribution 4.0.

## Met Éireann warnings compliance note

Because Met Éireann forecast data is displayed publicly, the operator should verify compliance with Met Éireann custom open data licence requirements before public deployment. The app includes a visible link to current Met Éireann weather warnings:

```text
https://www.met.ie/warnings
```

The app does not invent, cache, or display warning data unless a reliable public warnings endpoint is later added.

## Known limitations

- The river prediction is a transparent estimate, not a calibrated hydrological model.
- Historic rainfall is archived forecast rainfall unless an observed rainfall source is added.
- First-time users will not have a rainfall lookback until the browser has collected forecast snapshots.
- EPA timestamp timezone assumptions should be verified before public launch.
- Browser CORS or mixed-content policy may affect access to some public endpoints.
- EPA Hydronet reuse terms must be verified before publication.
- The app does not include a public safety warning.

## Licence

The application code is released under the MIT Licence. See `LICENSE`.
