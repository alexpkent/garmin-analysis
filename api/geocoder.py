"""Lightweight reverse-geocoding helper using the reverse_geocoder package.

The package bundles a local dataset so no network calls are made.
Returns the ISO 3166-1 alpha-2 country code (e.g. "GB", "FR") for a lat/lon
pair, or None when the coordinates are missing.
"""
from __future__ import annotations

import logging

_rg = None  # lazy-loaded singleton


def _load():
    global _rg
    if _rg is None:
        try:
            import reverse_geocoder as rg
            _rg = rg
        except Exception as exc:  # pragma: no cover
            logging.warning("reverse_geocoder not available: %s", exc)
            _rg = False  # sentinel so we don't retry


def country_code(lat: float | None, lon: float | None) -> str | None:
    """Return ISO country code for the given coordinates, or None."""
    if lat is None or lon is None:
        return None
    _load()
    if not _rg:
        return None
    try:
        results = _rg.search([(lat, lon)], verbose=False)
        if results:
            return results[0].get("cc") or None
    except Exception as exc:
        logging.warning("reverse_geocoder.search failed: %s", exc)
    return None


def fill_countries(activities: list) -> bool:
    """Batch-fill the 'country' field for activities that need geocoding.

    Processes activities where country is missing entirely, or where coordinates
    are present but country is null (e.g. geocoding failed on a previous attempt).
    Returns True if any were changed.
    """
    _load()
    if not _rg:
        return False

    changed = False

    # Activities with coords where country is null or missing → geocode them
    to_geocode = [
        (i, act)
        for i, act in enumerate(activities)
        if act.get("start_latitude") is not None
        and act.get("start_longitude") is not None
        and act.get("country") is None
    ]

    # Activities with no coords that are missing the key entirely → mark null
    to_nullify = [
        (i, act)
        for i, act in enumerate(activities)
        if "country" not in act
        and (act.get("start_latitude") is None or act.get("start_longitude") is None)
    ]

    for _, act in to_nullify:
        act["country"] = None
        changed = True

    if to_geocode:
        coords = [(act["start_latitude"], act["start_longitude"]) for _, act in to_geocode]
        try:
            results = _rg.search(coords, verbose=False)
            for (_, act), result in zip(to_geocode, results):
                cc = result.get("cc") or None
                act["country"] = cc
                if cc is not None:
                    changed = True
        except Exception as exc:
            logging.warning("reverse_geocoder.search failed: %s", exc)

    return changed
