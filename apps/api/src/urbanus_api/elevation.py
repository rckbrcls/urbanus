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
DEM_TYPES = ("SRTMGL3", "SRTMGL1", "COP30", "COP90", "AW3D30", "NASADEM", "EU_DTM", "GEDI_L3")
DEFAULT_DEM = "COP30"
NODATA_THRESHOLD = -9000


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

    # 1) Baixa o GeoTIFF da área solicitada
    tiff_bytes = _fetch_geotiff(south, north, west, east, dem_type)
    features = geojson.get("features") or []
    enriched = []

    # 2) Abre o GeoTIFF em memória (sem escrever em disco)
    with MemoryFile(tiff_bytes) as mem:
        with mem.open() as src:
            nodatavals = src.nodatavals
            n0 = nodatavals[0] if nodatavals else None
            try:
                no_val = float(n0) if n0 is not None and not (isinstance(n0, float) and np.isnan(n0)) else -9999.0
            except (TypeError, ValueError):
                no_val = -9999.0

            # 3) Enriquecimento por feature
            for f in features:
                geom = f.get("geometry")
                if not geom or geom.get("type") != "LineString":
                    enriched.append(f)
                    continue

                coords = list(geom.get("coordinates") or [])
                if len(coords) < 2:
                    enriched.append(f)
                    continue

                # Pares (lng, lat) para amostragem
                pairs = [(float(c[0]), float(c[1])) for c in coords]
                elevations = _sample_elevations_at(src, pairs, no_val)
                stats = _elevation_stats(elevations)

                # Injeta propriedades calculadas
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
