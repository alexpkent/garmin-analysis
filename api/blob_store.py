import json
import os

from azure.core.exceptions import ResourceNotFoundError
from azure.storage.blob import BlobServiceClient


class BlobStore:
    def __init__(self, connection_string: str | None = None, container: str | None = None):
        conn = connection_string or os.environ["BLOB_CONNECTION_STRING"]
        self._container = container or os.environ.get("BLOB_CONTAINER", "activities")
        self._client = BlobServiceClient.from_connection_string(conn)

    def read_json(self, blob_name: str) -> dict | list | None:
        try:
            blob = self._client.get_blob_client(self._container, blob_name)
            data = blob.download_blob().readall()
            return json.loads(data)
        except ResourceNotFoundError:
            return None

    def write_json(self, blob_name: str, data: dict | list) -> None:
        blob = self._client.get_blob_client(self._container, blob_name)
        blob.upload_blob(json.dumps(data, ensure_ascii=False), overwrite=True)
