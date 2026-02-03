from typing import Any, Dict, Optional

DEFAULT_RULES: Dict[str, Optional[float]] = {
    "maxSegmentLength": None,  # meters
    "minSegmentLength": None,  # meters
    "minSlope": None,  # m/m
    "maxSlope": None,  # m/m
}


def resolve_rules(max_edge_length: float, rules: Optional[Dict[str, Any]]) -> Dict[str, Optional[float]]:
    resolved: Dict[str, Optional[float]] = dict(DEFAULT_RULES)
    resolved["maxSegmentLength"] = max_edge_length

    if not rules:
        return resolved

    for key in resolved:
        value = rules.get(key)
        if value is None:
            continue
        try:
            resolved[key] = float(value)
        except (TypeError, ValueError):
            continue

    return resolved
