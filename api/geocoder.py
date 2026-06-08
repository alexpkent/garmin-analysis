"""Reverse-geocoding helper using the BigDataCloud free API (no key required).

Used only for new activities that arrive without a country code.
All existing activities were already backfilled, so this runs rarely.
"""
from __future__ import annotations

import logging
import urllib.request
import json


_BASE = "https://api.bigdatacloud.net/data/reverse-geocode-client"


def country_code(lat: float | None, lon: float | None) -> str | None:
    """Return ISO 3166-1 alpha-2 country code for the given coordinates, or None."""
    if lat is None or lon is None:
        return None
    try:
        url = f"{_BASE}?latitude={lat}&longitude={lon}&localityLanguage=en"
        with urllib.request.urlopen(url, timeout=5) as resp:
            data = json.loads(resp.read())
        return data.get("countryCode") or None
    except Exception as exc:
        logging.warning("reverse geocode failed (%s, %s): %s", lat, lon, exc)
        return None


def fill_countries(activities: list) -> bool:
    """Fill the 'country' field for activities that need geocoding.

    Only processes activities where coordinates are present but country is
    null/missing. Returns True if any were changed.
    """
    to_geocode = [
        (i, act)
        for i, act in enumerate(activities)
        if act.get("start_latitude") is not None
        and act.get("start_longitude") is not None
        and act.get("country") is None
    ]

    to_nullify = [
        (i, act)
        for i, act in enumerate(activities)
        if "country" not in act
        and (act.get("start_latitude") is None or act.get("start_longitude") is None)
    ]

    if not to_geocode and not to_nullify:
        return False

    changed = False

    for _, act in to_nullify:
        act["country"] = None
        changed = True

    for _, act in to_geocode:
        cc = country_code(act["start_latitude"], act["start_longitude"])
        act["country"] = cc
        changed = True

    return changed
