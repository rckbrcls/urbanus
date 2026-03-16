import math

KM_PER_DEGREE_LAT = 111.32


def area_km2(south: float, north: float, west: float, east: float) -> float:
    """Estimate area (km²) from a lat/lng bounding box."""
    avg_lat = (north + south) / 2
    km_per_deg_lon = KM_PER_DEGREE_LAT * max(0.01, abs(math.cos(math.radians(avg_lat))))
    return (north - south) * KM_PER_DEGREE_LAT * (east - west) * km_per_deg_lon
