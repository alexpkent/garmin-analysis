import json

import azure.functions as func

from activity_service import ActivityService
from blob_store import BlobStore
from garmin_client import GarminClient

app = func.FunctionApp(http_auth_level=func.AuthLevel.ANONYMOUS)


@app.route(route="activities", methods=["GET"])
def get_activities(req: func.HttpRequest) -> func.HttpResponse:
    blob_store = BlobStore()
    garmin_client = GarminClient(blob_store)
    service = ActivityService(blob_store, garmin_client)
    activities, sync_failed = service.get_activities()

    headers = {}
    if sync_failed:
        headers["X-Sync-Error"] = "true"

    return func.HttpResponse(
        json.dumps(activities),
        status_code=200,
        mimetype="application/json",
        headers=headers,
    )
