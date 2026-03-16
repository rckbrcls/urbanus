from pydantic import BaseModel


class LatLng(BaseModel):
    lat: float
    lng: float


class BoundingBox(BaseModel):
    southWest: LatLng
    northEast: LatLng
