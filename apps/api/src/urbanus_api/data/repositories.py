"""Repository pattern for database operations."""

from __future__ import annotations

from typing import Any

from geoalchemy2.functions import ST_MakePoint, ST_MakeEnvelope, ST_SetSRID
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from urbanus_api.data.tables import ProjectTable


def _bbox_to_polygon(bounds: dict[str, Any]) -> Any:
    """Convert a BoundingBox dict to a PostGIS POLYGON WKB expression."""
    sw = bounds["southWest"]
    ne = bounds["northEast"]
    return ST_SetSRID(
        ST_MakeEnvelope(sw["lng"], sw["lat"], ne["lng"], ne["lat"]),
        4326,
    )


def _center_to_point(center: list[float]) -> Any:
    """Convert [lat, lng] to a PostGIS POINT expression."""
    return ST_SetSRID(ST_MakePoint(center[1], center[0]), 4326)


class ProjectRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def upsert(self, data: dict[str, Any]) -> ProjectTable:
        existing = await self.session.get(ProjectTable, data["id"])
        streets = data.get("streets")
        street_count = streets.get("features", []) if isinstance(streets, dict) else []

        values = {
            "id": data["id"],
            "name": data["name"],
            "created_at": data["createdAt"],
            "bounds": _bbox_to_polygon(data["bounds"]),
            "area_km2": data["areaKm2"],
            "center": _center_to_point(data["center"]),
            "zoom": data["zoom"],
            "street_count": len(street_count) if isinstance(street_count, list) else data.get("stats", {}).get("streetCount", 0),
            "streets_geojson": streets,
        }

        if existing:
            for key, val in values.items():
                if key != "id":
                    setattr(existing, key, val)
            row = existing
        else:
            row = ProjectTable(**values)
            self.session.add(row)

        await self.session.commit()
        await self.session.refresh(row)
        return row

    async def get_all(self) -> list[ProjectTable]:
        result = await self.session.execute(select(ProjectTable))
        return list(result.scalars().all())

    async def get_by_id(self, project_id: str) -> ProjectTable | None:
        return await self.session.get(ProjectTable, project_id)

    async def delete(self, project_id: str) -> bool:
        result = await self.session.execute(
            delete(ProjectTable).where(ProjectTable.id == project_id)
        )
        await self.session.commit()
        return result.rowcount > 0
