import importlib
import json
import os
import sys
from unittest.mock import patch

import azure.functions as func


def _get_api_dir() -> str:
    return os.path.join(os.path.dirname(__file__), "..")


def _load_function_app():
    os.environ.setdefault("BLOB_CONNECTION_STRING", "UseDevelopmentStorage=true")
    os.environ.setdefault("GARMIN_EMAIL", "test@example.com")
    os.environ.setdefault("GARMIN_PASSWORD", "secret")
    api_dir = _get_api_dir()
    if api_dir not in sys.path:
        sys.path.insert(0, api_dir)
    if "function_app" in sys.modules:
        return importlib.reload(sys.modules["function_app"])
    import function_app  # noqa: E402
    return function_app


def _find_handler(module):
    for registered in module.app.get_functions():
        bindings = registered.get_bindings_dict().get("bindings", [])
        for binding in bindings:
            if binding.get("route") == "activities":
                return registered.get_user_function()
    return None


def _make_request():
    return func.HttpRequest(
        method="GET",
        url="/api/activities",
        body=b"",
        params={},
        headers={},
    )


def test_get_activities_returns_200():
    module = _load_function_app()
    handler = _find_handler(module)
    assert handler is not None, "No handler registered for route 'activities'"

    with patch.object(module, "_activity_service") as mock_svc:
        mock_svc.get_activities.return_value = ([], False)
        response = handler(_make_request())

    assert response.status_code == 200


def test_get_activities_sync_error_sets_header():
    module = _load_function_app()
    handler = _find_handler(module)
    assert handler is not None

    with patch.object(module, "_activity_service") as mock_svc:
        mock_svc.get_activities.return_value = ([], True)
        response = handler(_make_request())

    assert response.status_code == 200
    assert response.headers.get("X-Sync-Error") == "true"
