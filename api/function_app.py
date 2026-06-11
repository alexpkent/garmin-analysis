import orjson

import azure.functions as func

from activity_service import ActivityService
from blob_store import BlobStore
from garmin_client import GarminClient

app = func.FunctionApp(http_auth_level=func.AuthLevel.ANONYMOUS)

# Module-level singletons — Azure Functions reuses the worker process between
# warm invocations, so creating BlobServiceClient and Garmin once per worker
# avoids ~50 ms of TCP/TLS setup on every request.
_blob_store = BlobStore()
_garmin_client = GarminClient(_blob_store)
_activity_service = ActivityService(_blob_store, _garmin_client)


@app.route(route="activities", methods=["GET"])
def get_activities(req: func.HttpRequest) -> func.HttpResponse:
    activities, sync_failed = _activity_service.get_activities()

    sync_status = _blob_store.read_json("garmin/sync-status.json")
    last_sync: str | None = None
    if isinstance(sync_status, dict):
        last_sync = sync_status.get("last_successful_sync") or None

    body = {
        "activities": activities,
        "last_sync_time": last_sync,
        "sync_error": sync_failed,
    }

    return func.HttpResponse(
        orjson.dumps(body),
        status_code=200,
        mimetype="application/json",
    )


@app.route(route="health", methods=["GET"])
def get_health(req: func.HttpRequest) -> func.HttpResponse:
    data = _blob_store.read_json("garmin/health.json") or []
    return func.HttpResponse(
        orjson.dumps(data),
        status_code=200,
        mimetype="application/json",
    )


@app.route(route="records", methods=["GET"])
def get_records(req: func.HttpRequest) -> func.HttpResponse:
    data = _blob_store.read_json("garmin/records.json") or {}
    return func.HttpResponse(
        orjson.dumps(data),
        status_code=200,
        mimetype="application/json",
    )
