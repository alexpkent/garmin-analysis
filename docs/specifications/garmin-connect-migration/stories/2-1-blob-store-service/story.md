# EN-2: Blob Store Service

**Wave:** 2
**Parallel Index:** 1
**Source:** EN-2

---

## Description

As a developer, I want a `BlobStore` service that reads and writes JSON to Azure Blob Storage, so that all functions can access activity and token data without duplicating blob SDK calls

---

## Acceptance Criteria

- Given a valid `BLOB_CONNECTION_STRING` environment variable, when `BlobStore.read_json(blob_name)` is called for an existing blob, then the parsed JSON content is returned
- Given a valid `BLOB_CONNECTION_STRING`, when `BlobStore.read_json(blob_name)` is called for a non-existent blob, then `None` is returned without raising an exception
- Given a valid `BLOB_CONNECTION_STRING`, when `BlobStore.write_json(blob_name, data)` is called, then the blob is created or overwritten with the serialised JSON

---

## Dependencies

- EN-1 → `1-1-python-api-scaffold`
