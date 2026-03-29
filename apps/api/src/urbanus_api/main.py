from __future__ import annotations

from typing import List

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession

from urbanus_api.models import (
    Project,
    NodesExtractRequest,
    ElevationEnrichRequest,
)
from urbanus_api.services.elevation import enrich_geojson as _enrich_geojson
from urbanus_api.core.graph.classification import (
    extract_nodes as _extract_nodes,
    enforce_direction_changes,
)
from urbanus_api.core.graph.builder import build_graph_from_postgis, build_graph_from_geojson, save_graph_to_postgis
from urbanus_api.core.graph.sanitization import (
    sanitize_long_edges,
    subdivide_steep_edges,
    remove_redundant_nodes,
    resolve_curve_clusters,
    detect_grade_breaks,
    enforce_min_pv_spacing,
)
from urbanus_api.core.graph.accessories import assign_accessory_types
from urbanus_api.core.elevation.extrema import detect_extrema
from urbanus_api.core.routing.rsph import rsph_sewer_routing
from urbanus_api.core.optimizer.low_points import resolve_low_points
from urbanus_api.core.hydraulics.dimensioning import dimension_network
from urbanus_api.core.hydraulics.costing import compute_total_cost
from urbanus_api.data.database import get_db
from urbanus_api.data.repositories import ProjectRepository

app = FastAPI()

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _row_to_project(row) -> dict:
    """Convert a ProjectTable row back to the API response format."""
    # Reconstruct bounds from JSONB stored in streets_geojson context
    # We store the raw project data, so we can reconstruct it
    return {
        "id": row.id,
        "name": row.name,
        "createdAt": row.created_at,
        "bounds": row.streets_geojson.get("_bounds") if row.streets_geojson else {"southWest": {"lat": 0, "lng": 0}, "northEast": {"lat": 0, "lng": 0}},
        "areaKm2": row.area_km2,
        "center": row.streets_geojson.get("_center", [0, 0]) if row.streets_geojson else [0, 0],
        "zoom": row.zoom,
        "stats": {"streetCount": row.street_count},
        "streets": {k: v for k, v in (row.streets_geojson or {}).items() if not k.startswith("_")},
    }


@app.get("/")
def read_root():
    return {"status": "ok"}


@app.post("/projects", response_model=Project)
async def create_project(project: Project, db: AsyncSession = Depends(get_db)):
    data = project.model_dump()
    # Stash bounds and center in streets_geojson for round-trip reconstruction
    streets = data.get("streets") or {}
    streets["_bounds"] = data["bounds"]
    streets["_center"] = data["center"]
    data["streets"] = streets

    repo = ProjectRepository(db)
    await repo.upsert(data)
    return project


@app.get("/projects", response_model=List[Project])
async def get_projects(db: AsyncSession = Depends(get_db)):
    repo = ProjectRepository(db)
    rows = await repo.get_all()
    return [_row_to_project(r) for r in rows]


@app.get("/projects/{project_id}", response_model=Project)
async def get_project(project_id: str, db: AsyncSession = Depends(get_db)):
    repo = ProjectRepository(db)
    row = await repo.get_by_id(project_id)
    if row:
        return _row_to_project(row)
    raise HTTPException(status_code=404, detail="Project not found")


@app.delete("/projects/{project_id}")
async def delete_project(project_id: str, db: AsyncSession = Depends(get_db)):
    repo = ProjectRepository(db)
    deleted = await repo.delete(project_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Project not found")
    return {"status": "deleted"}


@app.post("/nodes/extract")
async def nodes_extract(req: NodesExtractRequest):
    """Extract nodes from enriched GeoJSON."""
    try:
        result = _extract_nodes(req.geojson, mode=req.mode)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/projects/{project_id}/process")
async def process_sewer_network(project_id: str, db: AsyncSession = Depends(get_db)):
    """Execute the full 8-step sewer network pipeline.

    1. Classification — mandatory nodes (ROSA)
    2. Sanitization — subdivide long edges (VERDE)
    3. Sanitization — remove redundant nodes (VERMELHO)
    4. Sanitization — resolve curve clusters
    5. Elevation — detect maxima (AMARELO) and minima (AZUL_ESCURO)
    6. Routing — RSPH gravity routing
    7. Optimization — resolve low points (pumps or deep excavation)
    8. Dimensioning — pipe sizing (Manning, NBR 9649)
    """
    repo = ProjectRepository(db)
    project = await repo.get_by_id(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Load graph from PostGIS (existing processed data)
    G = await build_graph_from_postgis(project_id, db)

    # Fallback: build from streets_geojson if PostGIS has no graph data yet
    if len(G.nodes) == 0:
        streets_geojson = project.streets_geojson
        if not streets_geojson or not isinstance(streets_geojson, dict):
            raise HTTPException(
                status_code=400,
                detail="No streets data. Select an area and extract streets first.",
            )
        # Filter out metadata keys (prefixed with _)
        clean_geojson = {k: v for k, v in streets_geojson.items() if not k.startswith("_")}
        G = build_graph_from_geojson(clean_geojson)
        if len(G.nodes) == 0:
            raise HTTPException(
                status_code=400,
                detail="Could not extract graph from streets data.",
            )

    # Etapa 1: Classification (already done during extraction)
    mandatory = {
        n for n, d in G.nodes(data=True)
        if d.get("pv_obrigatorio", False)
    }

    # Etapa 1.5: Enforce direction changes > 45° → PV obrigatório
    enforce_direction_changes(G)

    # Etapa 2: Subdivide long edges
    G = sanitize_long_edges(G)

    # Etapa 2.5: Subdivide steep edges (terrain slope > 15%)
    G = subdivide_steep_edges(G)

    # Etapa 3: Remove redundant nodes
    G = remove_redundant_nodes(G)

    # Etapa 4: Resolve curve clusters
    G = resolve_curve_clusters(G)

    # Etapa 4.5: Enforce minimum PV spacing (80m)
    G = enforce_min_pv_spacing(G)

    # Etapa 5: Detect elevation extrema
    G = detect_extrema(G)

    # Etapa 5.5: Detect grade breaks (slope change > 3%)
    G = detect_grade_breaks(G)

    # Update mandatory set after sanitization
    mandatory = {
        n for n, d in G.nodes(data=True)
        if d.get("pv_obrigatorio", False) or d.get("node_type") == "ROSA"
    }

    # Find outlet (lowest elevation node)
    outlet = min(
        (n for n in G.nodes if G.nodes[n].get("z") is not None),
        key=lambda n: (G.nodes[n]["z"], str(n)),
        default=None,
    )
    if outlet is None:
        raise HTTPException(status_code=400, detail="No nodes with elevation data found")

    # Etapa 6: RSPH gravity routing
    tree, unreachable = rsph_sewer_routing(G, outlet, mandatory)

    # Etapa 7: Resolve low points
    tree, pump_stations = resolve_low_points(tree, unreachable, G, outlet)

    # Etapa 8: Hydraulic dimensioning
    pipes = dimension_network(tree)

    # Etapa 9: Accessory type assignment
    tree = assign_accessory_types(tree, pipes)

    # Save results to PostGIS
    await save_graph_to_postgis(project_id, tree, db)

    # Build response
    from urbanus_geo.types import SewerNode, SewerEdge, SewerNetwork

    nodes_out = []
    for n, d in tree.nodes(data=True):
        nodes_out.append(SewerNode(
            id=str(n),
            lat=d.get("y", 0),
            lng=d.get("x", 0),
            elevation=d.get("z"),
            node_type=d.get("node_type"),
            pv_obrigatorio=d.get("pv_obrigatorio", False),
            degree=tree.degree(n),
            is_intersection=d.get("is_intersection", False),
            is_endpoint=d.get("is_endpoint", False),
            accessory_type=d.get("accessory_type"),
        ))

    edges_out = []
    for u, v, d in tree.edges(data=True):
        edges_out.append(SewerEdge(
            id=d.get("edge_id", f"{u}->{v}"),
            source_node_id=str(u),
            target_node_id=str(v),
            length_m=d.get("length_m", 0),
            slope=d.get("slope"),
            cost=d.get("cost"),
            name=d.get("name"),
            highway=d.get("highway"),
        ))

    result = SewerNetwork(
        project_id=project_id,
        nodes=nodes_out,
        edges=edges_out,
        pipes=pipes,
        pump_stations=pump_stations,
        unreachable_nodes=unreachable,
        total_cost=compute_total_cost(pipes, pump_stations, tree),
    )

    return result.model_dump()


@app.post("/elevation/enrich")
async def elevation_enrich(req: ElevationEnrichRequest):
    """Enrich GeoJSON with elevation from GeoTIFF (OpenTopography)."""
    try:
        enriched = _enrich_geojson(
            req.geojson,
            south=req.bbox.south,
            north=req.bbox.north,
            west=req.bbox.west,
            east=req.bbox.east,
            dem_type=req.demType or "COP30",
        )
        return enriched
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
