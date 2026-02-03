import math
import time
from typing import Any, Dict, List, Optional

from sewer_standards import resolve_rules


def _haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371000.0
    d_lat = math.radians(lat2 - lat1)
    d_lng = math.radians(lng2 - lng1)
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(d_lng / 2) ** 2
    )
    return r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _interpolate(a: float, b: float, alpha: float) -> float:
    return a + alpha * (b - a)


def _extract_elevations(feature: Dict[str, Any], expected_len: int) -> Optional[List[Optional[float]]]:
    props = feature.get("properties") or {}
    elevations = props.get("vertex_elevations")
    if not isinstance(elevations, list) or len(elevations) != expected_len:
        return None
    return [None if v is None else float(v) for v in elevations]


def _init_checks() -> Dict[str, int]:
    return {
        "segmentCount": 0,
        "tooLong": 0,
        "tooShort": 0,
        "belowMinSlope": 0,
        "aboveMaxSlope": 0,
        "missingElevation": 0,
    }


def _accumulate_checks(target: Dict[str, int], addition: Dict[str, int]) -> None:
    for key, value in addition.items():
        target[key] = target.get(key, 0) + value


def _summarize_segments(
    coords: List[List[float]],
    elevations: Optional[List[Optional[float]]],
    min_segment_length: Optional[float],
    max_segment_length: Optional[float],
    min_slope: Optional[float],
    max_slope: Optional[float],
) -> Dict[str, int]:
    summary = _init_checks()

    if len(coords) < 2:
        return summary

    for i in range(len(coords) - 1):
        start = coords[i]
        end = coords[i + 1]
        length = _haversine_m(start[1], start[0], end[1], end[0])

        summary["segmentCount"] += 1

        if max_segment_length is not None and length > max_segment_length:
            summary["tooLong"] += 1
        if min_segment_length is not None and length < min_segment_length:
            summary["tooShort"] += 1

        if elevations is None:
            continue

        start_elev = elevations[i]
        end_elev = elevations[i + 1]
        if start_elev is None or end_elev is None or length <= 0:
            summary["missingElevation"] += 1
            continue

        slope = abs((end_elev - start_elev) / length)
        if min_slope is not None and slope < min_slope:
            summary["belowMinSlope"] += 1
        if max_slope is not None and slope > max_slope:
            summary["aboveMaxSlope"] += 1

    return summary


def analyze_geojson(
    geojson: Dict[str, Any],
    max_edge_length: float,
) -> Dict[str, int]:
    needs_subdivision = 0
    total_nodes_needed = 0
    skipped_edges = 0
    total_edges = 0

    for feature in geojson.get("features", []):
        geometry = feature.get("geometry") or {}
        if geometry.get("type") != "LineString":
            continue

        coords = geometry.get("coordinates") or []
        if len(coords) < 2:
            continue

        for i in range(len(coords) - 1):
            start = coords[i]
            end = coords[i + 1]
            distance = _haversine_m(start[1], start[0], end[1], end[0])
            total_edges += 1
            if distance > max_edge_length:
                needs_subdivision += 1
                total_nodes_needed += int(math.floor(distance / max_edge_length))
            else:
                skipped_edges += 1

    return {
        "needsSubdivision": needs_subdivision,
        "totalNodesNeeded": total_nodes_needed,
        "skippedEdges": skipped_edges,
        "totalEdges": total_edges,
    }


def process_geojson(
    geojson: Dict[str, Any],
    max_edge_length: float,
    preserve_elevations: bool,
    rules: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    start_time = time.perf_counter()

    resolved_rules = resolve_rules(max_edge_length, rules)
    max_segment_length = resolved_rules.get("maxSegmentLength") or max_edge_length
    min_segment_length = resolved_rules.get("minSegmentLength")
    min_slope = resolved_rules.get("minSlope")
    max_slope = resolved_rules.get("maxSlope")

    original_node_count = 0
    new_node_count = 0
    processed_edges = 0
    skipped_edges = 0

    checks_before = _init_checks()
    checks_after = _init_checks()

    new_features: List[Dict[str, Any]] = []

    for feature in geojson.get("features", []):
        geometry = feature.get("geometry") or {}
        if geometry.get("type") != "LineString":
            new_features.append(feature)
            continue

        coords = geometry.get("coordinates") or []
        original_node_count += len(coords)

        if len(coords) < 2:
            new_features.append(feature)
            continue

        elevations = _extract_elevations(feature, len(coords))

        _accumulate_checks(
            checks_before,
            _summarize_segments(coords, elevations, min_segment_length, max_segment_length, min_slope, max_slope),
        )

        new_coords: List[List[float]] = []
        new_elevations: Optional[List[Optional[float]]] = [] if elevations is not None else None

        for i in range(len(coords) - 1):
            start = coords[i]
            end = coords[i + 1]
            start_lat, start_lng = start[1], start[0]
            end_lat, end_lng = end[1], end[0]

            start_elev = elevations[i] if elevations is not None else None
            end_elev = elevations[i + 1] if elevations is not None else None

            if i == 0:
                new_coords.append([start_lng, start_lat])
                if new_elevations is not None:
                    new_elevations.append(start_elev)

            distance = _haversine_m(start_lat, start_lng, end_lat, end_lng)
            if distance > max_segment_length:
                processed_edges += 1
                num_intermediates = int(math.floor(distance / max_segment_length))
                for j in range(1, num_intermediates + 1):
                    alpha = j / (num_intermediates + 1)
                    new_lat = _interpolate(start_lat, end_lat, alpha)
                    new_lng = _interpolate(start_lng, end_lng, alpha)
                    new_coords.append([new_lng, new_lat])
                    if new_elevations is not None:
                        if preserve_elevations and start_elev is not None and end_elev is not None:
                            new_elevations.append(_interpolate(start_elev, end_elev, alpha))
                        else:
                            new_elevations.append(None)
                new_node_count += num_intermediates
            else:
                skipped_edges += 1

            new_coords.append([end_lng, end_lat])
            if new_elevations is not None:
                new_elevations.append(end_elev)

        new_feature = {
            **feature,
            "geometry": {
                **geometry,
                "coordinates": new_coords,
            },
        }

        if new_elevations is not None:
            props = dict(feature.get("properties") or {})
            props["vertex_elevations"] = new_elevations
            new_feature["properties"] = props

        _accumulate_checks(
            checks_after,
            _summarize_segments(
                new_coords,
                new_elevations,
                min_segment_length,
                max_segment_length,
                min_slope,
                max_slope,
            ),
        )

        new_features.append(new_feature)

    processed_geojson = {k: v for k, v in geojson.items() if k != "features"}
    processed_geojson["features"] = new_features

    processing_time_ms = (time.perf_counter() - start_time) * 1000

    return {
        "geojson": processed_geojson,
        "stats": {
            "originalNodeCount": original_node_count,
            "newNodeCount": new_node_count,
            "processedEdges": processed_edges,
            "skippedEdges": skipped_edges,
            "processingTime": processing_time_ms,
        },
        "checks": {
            "rules": resolved_rules,
            "before": checks_before,
            "after": checks_after,
        },
    }
