"""
Elevation enrichment service.

O que faz:
- busca um GeoTIFF do OpenTopography para a bbox solicitada
- amostra elevação nos vértices de cada LineString
- injeta `vertex_elevations` e estatísticas no GeoJSON

Este módulo é usado pelo backend Python (FastAPI) e roda server-side
para evitar trabalho pesado no navegador.
"""

from __future__ import annotations

import os
from typing import Any

import httpx
import numpy as np
from rasterio.io import MemoryFile

from urbanus_geo.calculations import area_km2 as _area_km2
from urbanus_geo.constants import MAX_AREA_KM2

OPENTOPOGRAPHY_URL = "https://portal.opentopography.org/API/globaldem"
DEM_TYPES = ("SRTMGL3", "SRTMGL1", "COP30", "COP90", "AW3D30", "NASADEM", "EU_DTM", "GEDI_L3", "FABDEM")
DEFAULT_DEM = "COP30"
NODATA_THRESHOLD = -9000
BOUNDARY_EPSILON = 1e-9
SPURIOUS_ZERO_THRESHOLD = 50.0


def _is_meaningful_elevation(value: float | None) -> bool:
    """Return True for valid, non-zero elevations."""
    return value is not None and value != 0


def _is_bbox_edge_vertex(
    lon: float,
    lat: float,
    south: float,
    north: float,
    west: float,
    east: float,
    epsilon: float = BOUNDARY_EPSILON,
) -> bool:
    """Return True when the coordinate lies on the request bbox boundary."""
    return (
        abs(lat - south) <= epsilon
        or abs(lat - north) <= epsilon
        or abs(lon - west) <= epsilon
        or abs(lon - east) <= epsilon
    )


def _nearest_nonzero_neighbors(
    elevations: list[float | None],
    index: int,
) -> list[float]:
    """Collect nearest non-zero neighbors to the left and right of index."""
    neighbors: list[float] = []

    for j in range(index - 1, -1, -1):
        value = elevations[j]
        if _is_meaningful_elevation(value):
            neighbors.append(value)
            break

    for j in range(index + 1, len(elevations)):
        value = elevations[j]
        if _is_meaningful_elevation(value):
            neighbors.append(value)
            break

    return neighbors


def _fetch_geotiff(south: float, north: float, west: float, east: float, dem_type: str) -> bytes:
    """
    Busca o GeoTIFF no OpenTopography.
    - valida API key
    - limita área máxima para proteger custo/latência
    """
    api_key = os.getenv("OPENTOPOGRAPHY_API_KEY")
    if not api_key:
        raise ValueError("OPENTOPOGRAPHY_API_KEY environment variable is required")

    area = _area_km2(south, north, west, east)
    if area > MAX_AREA_KM2:
        raise ValueError(f"Area too large ({area:.0f} km²). Maximum: {MAX_AREA_KM2} km²")

    params = {
        "demtype": dem_type,
        "south": south,
        "north": north,
        "west": west,
        "east": east,
        "outputFormat": "GTiff",
        "API_Key": api_key,
    }
    with httpx.Client(timeout=120) as client:
        resp = client.get(OPENTOPOGRAPHY_URL, params=params)
        resp.raise_for_status()
        ct = resp.headers.get("content-type", "")
        if "json" in ct or "html" in ct:
            raise ValueError(f"Unexpected response from OpenTopography: {resp.text[:500]}")
        return resp.content


def _sample_elevations_at(
    src: Any,
    coords: list[tuple[float, float]],
    no_val: float,
) -> list[float | None]:
    """
    Amostra elevação no raster para cada par (lng, lat).
    Retorna lista com valores (m) ou None quando fora/nodata.
    """
    out: list[float | None] = []
    for lon, lat in coords:
        try:
            it = src.sample([(lon, lat)])
            arr = next(it)
        except (StopIteration, Exception):
            out.append(None)
            continue
        v = float(np.atleast_1d(arr)[0])
        if v > NODATA_THRESHOLD and v != no_val:
            out.append(v)
        else:
            out.append(None)
    return out


def _elevation_stats(elevations: list[float | None]) -> dict[str, Any]:
    """Calcula estatísticas simples (min, max, avg, range)."""
    valid = [e for e in elevations if e is not None]
    if not valid:
        return {"min": None, "max": None, "avg": None, "range": None}
    mn, mx = min(valid), max(valid)
    avg = sum(valid) / len(valid)
    return {"min": mn, "max": mx, "avg": avg, "range": mx - mn}


def _sanitize_boundary_elevations(
    coords: list[tuple[float, float]],
    elevations: list[float | None],
    south: float,
    north: float,
    west: float,
    east: float,
    threshold: float = SPURIOUS_ZERO_THRESHOLD,
) -> list[float | None]:
    """Convert suspicious bbox-edge zeros into None before interpolation."""
    if not coords or not elevations:
        return elevations

    result = list(elevations)
    valid = [value for value in result if _is_meaningful_elevation(value)]
    if not valid:
        return result

    median_valid = sorted(valid)[len(valid) // 2]

    for i, ((lon, lat), value) in enumerate(zip(coords, result)):
        if value != 0:
            continue
        if not _is_bbox_edge_vertex(lon, lat, south, north, west, east):
            continue

        neighbor_values = _nearest_nonzero_neighbors(result, i)
        if neighbor_values:
            if max(neighbor_values) > threshold:
                result[i] = None
                continue

        if median_valid > threshold:
            result[i] = None

    return result


def _interpolate_missing_elevations(elevations: list[float | None]) -> list[float | None]:
    """Fill None values by interpolating from nearest valid neighbors.

    Boundary vertices created by bbox clipping often lack valid elevation
    (DEM edge artifacts return 0 or nodata). This fills gaps by linearly
    interpolating from the closest valid vertices on the same LineString.

    Also treats 0 as suspicious if valid neighbors are much higher (>50m).
    """
    n = len(elevations)
    if n == 0:
        return elevations

    # First pass: detect spurious zeros that escaped initial sanitization.
    result = list(elevations)
    valid = [e for e in result if _is_meaningful_elevation(e)]
    if valid:
        median_valid = sorted(valid)[len(valid) // 2]
        for i in range(n):
            if result[i] != 0:
                continue

            neighbor_values = _nearest_nonzero_neighbors(result, i)
            if neighbor_values and (
                max(neighbor_values) > SPURIOUS_ZERO_THRESHOLD
                or median_valid > SPURIOUS_ZERO_THRESHOLD
            ):
                result[i] = None

    # Second pass: interpolate None from nearest valid neighbors
    for i in range(n):
        if result[i] is not None:
            continue

        # Find nearest valid left neighbor
        left_val, left_dist = None, 0
        for j in range(i - 1, -1, -1):
            if result[j] is not None:
                left_val = result[j]
                left_dist = i - j
                break

        # Find nearest valid right neighbor
        right_val, right_dist = None, 0
        for j in range(i + 1, n):
            if result[j] is not None:
                right_val = result[j]
                right_dist = j - i
                break

        if left_val is not None and right_val is not None:
            # Linear interpolation between neighbors
            total = left_dist + right_dist
            result[i] = left_val * (right_dist / total) + right_val * (left_dist / total)
        elif left_val is not None:
            result[i] = left_val
        elif right_val is not None:
            result[i] = right_val
        # else: no valid neighbors at all, stays None

    return result


def enrich_geojson(
    geojson: dict[str, Any],
    south: float,
    north: float,
    west: float,
    east: float,
    dem_type: str = DEFAULT_DEM,
) -> dict[str, Any]:
    """
    Enrich a GeoJSON FeatureCollection with elevation.

    Fetches GeoTIFF for bbox, samples at each LineString vertex,
    adds vertex_elevations and elevation stats to each feature.
    """
    if dem_type not in DEM_TYPES:
        dem_type = DEFAULT_DEM

    tiff_bytes = _fetch_geotiff(south, north, west, east, dem_type)
    features = geojson.get("features") or []
    enriched = []

    with MemoryFile(tiff_bytes) as mem:
        with mem.open() as src:
            nodatavals = src.nodatavals
            n0 = nodatavals[0] if nodatavals else None
            try:
                no_val = float(n0) if n0 is not None and not (isinstance(n0, float) and np.isnan(n0)) else -9999.0
            except (TypeError, ValueError):
                no_val = -9999.0

            for f in features:
                geom = f.get("geometry")
                if not geom or geom.get("type") != "LineString":
                    enriched.append(f)
                    continue

                coords = list(geom.get("coordinates") or [])
                if len(coords) < 2:
                    enriched.append(f)
                    continue

                pairs = [(float(c[0]), float(c[1])) for c in coords]
                elevations = _sample_elevations_at(src, pairs, no_val)
                elevations = _sanitize_boundary_elevations(
                    pairs, elevations, south, north, west, east,
                )
                elevations = _interpolate_missing_elevations(elevations)
                stats = _elevation_stats(elevations)

                props = dict(f.get("properties") or {})
                props["vertex_elevations"] = elevations
                props["elevation"] = stats

                enriched.append({
                    **f,
                    "properties": props,
                })

    return {
        **geojson,
        "features": enriched,
    }
