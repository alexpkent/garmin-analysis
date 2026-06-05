# Garmin Data Analysis

Uses Garmin activity and health data to display the following on an Angular SPA hosted/backed by a very low cost (free!) Azure set-up.

Analysis Graphs

![site image](screenshots/analysis-graphs.png)

Analysis Heatmaps

![site image](screenshots/analysis-heatmaps.png)

Overlays all training activities from **Garmin Connect** on a [Leaflet](https://leafletjs.com/) map with summary data and activity selection controls.

More base maps can be added as [listed here](https://leaflet-extras.github.io/leaflet-providers/preview/).

Routes are darker colours the more they have been run/ridden and cluster markers display the number of activities starting in each area automatically updating with the zoom level.

With a number of filters and options such as viewing activities by time, by type, with detail popups and with different map providers.

![site image](screenshots/site_no_map.png)

Region count summary markers.

![site image](screenshots/markers.png)

Training Log

![site image](screenshots/training-log.png)

# Azure Setup

## Azure Storage Account

Create a storage account and add a container called `activities`. Inside it, create the following blob structure:

```
activities/
  garmin/
    activities.json   ← created automatically on first sync (can pre-create as [])
    tokens.json       ← created automatically on first Garmin login
    health.json       ← created automatically on first sync
```

`garmin/activities.json` stores all activities in a unified normalised schema. It is managed automatically.

`garmin/health.json` stores a time-series of daily health snapshots (VO₂ max, training status, and load focus). One entry is appended per day on the first successful Garmin sync of that day.

## Static Web App

- Create a Static Web App and sign in to GitHub selecting the repo. Azure will generate the workflow file for the deployment.

This contains the actions that will:

- On creation of a PR, deploy to a staging environment in the Azure Static Web App to test changes.
- On merge of PR into master, delete the staging deployment, build master, and deploy the new build into the main deployment.

## CDN (Optional)

Static Web Apps by default allocate a unique URL. An easy way to provide a custom URL is to put a CDN in front of the static site.

- Create Azure CDN (Standard Microsoft tier)
- Create Endpoint with desired name (`azureedge.net` will be appended)
- Origin Type: Custom Origin
- Origin Hostname: URL of the Static Web App (without `https://`)
- Origin Host header: URL of the Static Web App (without `https://`)
- Disable HTTP

To prevent cached responses hiding new activities:

- Go to Rules Engine → Add Rule
- `If Request URL` set to `Any`
- Then `Cache Expiration` set to `Bypass cache`

# Code Settings

Angular environment settings than can be set in environment files or passed into the ng build process:

- `mapCenter` — LatLong coordinates to centre the map on load (i.e. the area where most activities exist).
- `userDob` - Users DOB for heart rate zone calculations.

# Deployment Settings

In the Static Web App configuration (Application settings) set the following environment variables, which are loaded by the Python Azure Function:

| Setting                  | Description                                 |
| ------------------------ | ------------------------------------------- |
| `BLOB_CONNECTION_STRING` | Azure Storage connection string             |
| `BLOB_CONTAINER`         | Blob container name (default: `activities`) |
| `GARMIN_EMAIL`           | Garmin Connect account email                |
| `GARMIN_PASSWORD`        | Garmin Connect account password             |

# How It Works

## Activities — `GET /api/activities`

On each page load the Azure Function (`GET /api/activities`) is called:

1. Loads saved Garmin OAuth tokens from `garmin/tokens.json` in blob storage (or performs a fresh login if none exist).
2. Fetches new Garmin activities since the last sync and retrieves GPS route data for each, using [python-garminconnect](https://github.com/cyberjunky/python-garminconnect).
3. Reads all activities from `garmin/activities.json`, merges new ones, and returns them sorted newest-first.
4. If Garmin Connect is unreachable the response still returns cached activities, with an `X-Sync-Error: true` header so the UI can show an error banner.
5. On every successful Garmin connection, captures today’s health snapshot (see below) and appends it to `garmin/health.json` if an entry for today doesn’t already exist.

## Health Data — `GET /api/health`

Returns the full contents of `garmin/health.json` as a JSON array, newest entries first. Each entry is written automatically by the activities sync and contains:

| Field             | Description                                                                                    |
| ----------------- | ---------------------------------------------------------------------------------------------- |
| `date`            | ISO date the snapshot was taken (`YYYY-MM-DD`)                                                 |
| `vo2max_running`  | VO₂ max estimate for running (precise value)                                                   |
| `vo2max_cycling`  | VO₂ max estimate for cycling (precise value)                                                   |
| `training_status` | Garmin training status phrase (e.g. `PRODUCTIVE_1`, `MAINTAINING_2`)                           |
| `load_focus`      | Object with monthly aerobic/anaerobic load actuals, target ranges, and a `load_balance_phrase` |

The `load_focus` object fields:

| Field                       | Description                                            |
| --------------------------- | ------------------------------------------------------ |
| `low_aerobic_actual`        | Actual low-aerobic load this month                     |
| `low_aerobic_low` / `high`  | Target range min/max for low-aerobic load              |
| `high_aerobic_actual`       | Actual high-aerobic load this month                    |
| `high_aerobic_low` / `high` | Target range min/max for high-aerobic load             |
| `anaerobic_actual`          | Actual anaerobic load this month                       |
| `anaerobic_low` / `high`    | Target range min/max for anaerobic load                |
| `load_balance_phrase`       | Garmin load balance phrase (e.g. `AEROBIC_HIGH_FOCUS`) |

# Local Development

## Prerequisites

- [Azure Functions Core Tools v4](https://learn.microsoft.com/azure/azure-functions/functions-run-local) (`func` CLI)
- Python 3.11+
- Node.js / npm
- SWA CLI: `npm install -g @azure/static-web-apps-cli`

## 1. Create `api/local.settings.json`

This file is gitignored. It holds all environment variables for local runs, including your Garmin credentials:

```json
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "UseDevelopmentStorage=true",
    "FUNCTIONS_WORKER_RUNTIME": "python",
    "BLOB_CONNECTION_STRING": "<your Azure Storage connection string>",
    "BLOB_CONTAINER": "activities",
    "GARMIN_EMAIL": "<your Garmin Connect email>",
    "GARMIN_PASSWORD": "<your Garmin Connect password>"
  }
}
```

Get `BLOB_CONNECTION_STRING` from your Azure Storage Account → **Access keys** → Connection string.

## 2. Install Python dependencies

```bash
cd api
pip install -r requirements.txt
```

## 3. Start the API (terminal 1)

```bash
cd api
func start --python
```

The function runs at `http://localhost:7071/api/activities`.

## 4. Start the Angular dev server (terminal 2)

```bash
ng serve
```

## 5. Start the SWA proxy (terminal 3)

```bash
swa start http://localhost:4200 --api-devserver-url http://localhost:7071
```

Open **http://localhost:4280** — this routes `/api/*` to the function and everything else to the Angular dev server.

> **Note:** Use `--api-devserver-url` (not `--api-location`) when the function is already running. `--api-location` tells SWA CLI to start func itself, which triggers a download that fails on corporate networks with proxy certificate inspection.
