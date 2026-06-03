import json
import os
import sys
from unittest.mock import MagicMock, patch

import pytest

# Ensure the api directory is on sys.path so blob_store can be imported
_API_DIR = os.path.join(os.path.dirname(__file__), "..")
if _API_DIR not in sys.path:
    sys.path.insert(0, _API_DIR)

from azure.core.exceptions import ResourceNotFoundError  # noqa: E402


@patch("blob_store.BlobServiceClient")
def test_read_json_returns_parsed_dict(mock_client_class):
    """read_json returns the deserialised JSON for an existing blob."""
    mock_blob = MagicMock()
    mock_blob.download_blob.return_value.readall.return_value = b'{"key": "value"}'
    mock_client_class.from_connection_string.return_value.get_blob_client.return_value = mock_blob

    from blob_store import BlobStore  # noqa: E402 (imported after patch)

    store = BlobStore(connection_string="UseDevelopmentStorage=true")
    result = store.read_json("garmin/activities.json")

    assert result == {"key": "value"}
    mock_client_class.from_connection_string.assert_called_once_with(
        "UseDevelopmentStorage=true"
    )
    mock_client_class.from_connection_string.return_value.get_blob_client.assert_called_once_with(
        "activities", "garmin/activities.json"
    )


@patch("blob_store.BlobServiceClient")
def test_read_json_returns_none_for_missing_blob(mock_client_class):
    """read_json returns None without raising when the blob does not exist."""
    mock_blob = MagicMock()
    mock_blob.download_blob.side_effect = ResourceNotFoundError("blob not found")
    mock_client_class.from_connection_string.return_value.get_blob_client.return_value = mock_blob

    from blob_store import BlobStore  # noqa: E402

    store = BlobStore(connection_string="UseDevelopmentStorage=true")
    result = store.read_json("garmin/tokens.json")

    assert result is None


@patch("blob_store.BlobServiceClient")
def test_write_json_uploads_serialised_content_with_overwrite(mock_client_class):
    """write_json serialises data to JSON and uploads with overwrite=True."""
    mock_blob = MagicMock()
    mock_client_class.from_connection_string.return_value.get_blob_client.return_value = mock_blob

    from blob_store import BlobStore  # noqa: E402

    store = BlobStore(connection_string="UseDevelopmentStorage=true")
    data = [{"id": 1, "name": "Run"}]
    store.write_json("garmin/activities.json", data)

    mock_blob.upload_blob.assert_called_once_with(
        json.dumps(data, ensure_ascii=False), overwrite=True
    )


@patch("blob_store.BlobServiceClient")
def test_container_defaults_to_activities(mock_client_class, monkeypatch):
    """Container name defaults to 'activities' when BLOB_CONTAINER is not set."""
    monkeypatch.delenv("BLOB_CONTAINER", raising=False)
    mock_blob = MagicMock()
    mock_blob.download_blob.return_value.readall.return_value = b"[]"
    mock_client_class.from_connection_string.return_value.get_blob_client.return_value = mock_blob

    from blob_store import BlobStore  # noqa: E402

    store = BlobStore(connection_string="UseDevelopmentStorage=true")
    store.read_json("strava/activities.json")

    mock_client_class.from_connection_string.return_value.get_blob_client.assert_called_once_with(
        "activities", "strava/activities.json"
    )


@patch("blob_store.BlobServiceClient")
def test_container_reads_from_env_var(mock_client_class, monkeypatch):
    """Container name is read from BLOB_CONTAINER env var when set."""
    monkeypatch.setenv("BLOB_CONTAINER", "custom-container")
    mock_blob = MagicMock()
    mock_blob.download_blob.return_value.readall.return_value = b"[]"
    mock_client_class.from_connection_string.return_value.get_blob_client.return_value = mock_blob

    from blob_store import BlobStore  # noqa: E402

    store = BlobStore(connection_string="UseDevelopmentStorage=true")
    store.read_json("garmin/activities.json")

    mock_client_class.from_connection_string.return_value.get_blob_client.assert_called_once_with(
        "custom-container", "garmin/activities.json"
    )
