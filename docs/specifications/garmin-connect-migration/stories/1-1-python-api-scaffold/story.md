# EN-1: Python API Scaffold

**Wave:** 1
**Parallel Index:** 1
**Source:** EN-1

---

## Description

As a developer, I want the `api/` folder replaced with a Python Azure Functions v2 scaffold, so that all backend stories can be developed and deployed

---

## Acceptance Criteria

- Given the existing Node.js `api/` folder, when EN-1 is complete, then `api/` contains `function_app.py`, `requirements.txt`, and an updated `host.json` using extension bundle `[4.0.0, 5.0.0)`, and the Node.js files (`index.js`, `package.json`, `HttpTrigger/function.json`, `proxies.json`) are removed
- Given the scaffold is deployed to Azure Static Web Apps, when a GET request is made to `/api/activities`, then the Python function handles the request and returns a 200 response
- Given `staticwebapp.config.json` in the workspace root, when EN-1 is complete, then it contains `"platform": { "apiRuntime": "python:3.11" }` so Azure Static Web Apps selects the Python runtime

---

## Dependencies

None
