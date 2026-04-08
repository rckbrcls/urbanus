"""Repository helpers for database operations and persistence."""

from __future__ import annotations

from typing import Any

from geoalchemy2.functions import ST_MakePoint, ST_MakeEnvelope, ST_SetSRID
from geoalchemy2.shape import from_shape
from shapely.geometry import LineString, Point
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from urbanus_api.data.tables import (
    EdgeTable,
    NodeTable,
    PipeSegmentTable,
    ProjectTable,
    PumpStationTable,
)


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
        existing_streets = existing.streets_geojson if existing and isinstance(existing.streets_geojson, dict) else {}
        merged_streets = dict(existing_streets)
        if isinstance(streets, dict):
            merged_streets.update(streets)

        merged_streets["_bounds"] = data["bounds"]
        merged_streets["_center"] = data["center"]

        if "sewerNetwork" in data:
            sewer_network = data.get("sewerNetwork")
            if sewer_network is None:
                merged_streets.pop("_sewerNetwork", None)
            else:
                merged_streets["_sewerNetwork"] = sewer_network

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
            "streets_geojson": merged_streets,
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


async def save_sewer_network_to_postgis(
    project_id: str,
    network: dict[str, Any],
    session: AsyncSession,
) -> None:
    """Persist a complete SewerNetwork payload to PostGIS tables."""
    await session.execute(
        PumpStationTable.__table__.delete().where(PumpStationTable.project_id == project_id)
    )
    await session.execute(
        PipeSegmentTable.__table__.delete().where(PipeSegmentTable.project_id == project_id)
    )
    await session.execute(
        EdgeTable.__table__.delete().where(EdgeTable.project_id == project_id)
    )
    await session.execute(
        NodeTable.__table__.delete().where(NodeTable.project_id == project_id)
    )

    nodes = network.get("nodes") or []
    edges = network.get("edges") or []
    pipes = network.get("pipes") or []
    pump_stations = network.get("pump_stations") or []

    node_lookup: dict[str, dict[str, Any]] = {}
    for node in nodes:
        node_id = str(node["id"])
        node_lookup[node_id] = node
        point = from_shape(Point(node.get("lng", 0), node.get("lat", 0)), srid=4326)
        session.add(NodeTable(
            id=node_id,
            project_id=project_id,
            geometry=point,
            elevation=node.get("elevation"),
            degree=node.get("degree", 0),
            is_intersection=node.get("is_intersection", False),
            is_endpoint=node.get("is_endpoint", False),
            node_type=node.get("node_type"),
            pv_obrigatorio=node.get("pv_obrigatorio", False),
            accessory_type=node.get("accessory_type"),
            properties={
                "is_collection_point": node.get("is_collection_point", False),
            },
        ))

    for edge in edges:
        source_id = str(edge["source_node_id"])
        target_id = str(edge["target_node_id"])
        source = node_lookup.get(source_id)
        target = node_lookup.get(target_id)
        if source is None or target is None:
            continue

        coordinates = [
            (source.get("lng", 0), source.get("lat", 0)),
            *[
                (point[0], point[1])
                for point in (edge.get("waypoints") or [])
                if isinstance(point, list) and len(point) >= 2
            ],
            (target.get("lng", 0), target.get("lat", 0)),
        ]
        line = from_shape(LineString(coordinates), srid=4326)

        session.add(EdgeTable(
            id=str(edge["id"]),
            project_id=project_id,
            geometry=line,
            name=edge.get("name"),
            highway=edge.get("highway"),
            length_m=edge.get("length_m"),
            slope=edge.get("slope"),
            cost=edge.get("cost"),
            properties={
                "source_node_id": source_id,
                "target_node_id": target_id,
                "waypoints": edge.get("waypoints"),
            },
        ))

    for pipe in pipes:
        session.add(PipeSegmentTable(
            id=f"{project_id}:{pipe['edge_id']}",
            project_id=project_id,
            edge_id=str(pipe["edge_id"]),
            diameter_mm=pipe.get("diameter_mm", 150),
            manning_n=pipe.get("manning_n", 0.013),
            slope=pipe.get("slope"),
            cover_depth=pipe.get("cover_depth"),
            flow_depth_ratio=pipe.get("flow_depth_ratio"),
            velocity=pipe.get("velocity"),
            tractive_stress=pipe.get("tractive_stress"),
            flow_rate=pipe.get("flow_rate"),
            is_pressurized=pipe.get("is_pressurized", False),
        ))

    for pump_station in pump_stations:
        session.add(PumpStationTable(
            id=str(pump_station["id"]),
            project_id=project_id,
            node_id=pump_station.get("node_id"),
            capacity_ls=pump_station.get("capacity_ls"),
            head_m=pump_station.get("head_m"),
            capex=pump_station.get("capex"),
            annual_opex=pump_station.get("annual_opex"),
            npv=pump_station.get("npv"),
        ))

    await session.commit()
