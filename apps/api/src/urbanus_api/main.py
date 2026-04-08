from __future__ import annotations

from typing import List

import networkx as nx

from pydantic import BaseModel
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
from urbanus_api.core.graph.builder import (
    build_graph_from_geojson,
    save_sewer_network_to_postgis,
)
from urbanus_api.core.graph.sanitization import (
    remove_redundant_nodes,
    resolve_curve_clusters,
    detect_grade_breaks,
    enforce_min_pv_spacing,
)
from urbanus_api.core.graph.accessories import assign_accessory_types
from urbanus_api.core.graph.coverage import ensure_full_coverage
from urbanus_api.core.optimizer.node_reduction import optimize_node_placement
from urbanus_api.core.elevation.extrema import detect_extrema
from urbanus_api.core.routing.rsph import rsph_sewer_routing
from urbanus_api.core.optimizer.low_points import resolve_low_points
from urbanus_api.core.hydraulics.dimensioning import dimension_network
from urbanus_api.core.hydraulics.costing import compute_total_cost
from urbanus_api.data.database import get_db
from urbanus_api.data.repositories import ProjectRepository
from urbanus_geo.calculations import haversine
from urbanus_geo.constants import MIN_PV_SPACING

app = FastAPI()

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _row_to_project(row, *, include_sewer_network: bool = True) -> dict:
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
        "sewerNetwork": (
            row.streets_geojson.get("_sewerNetwork")
            if include_sewer_network and row.streets_geojson
            else None
        ),
    }


@app.get("/")
def read_root():
    return {"status": "ok"}


@app.post("/projects", response_model=Project)
async def create_project(project: Project, db: AsyncSession = Depends(get_db)):
    data = project.model_dump(exclude_none=True)

    repo = ProjectRepository(db)
    await repo.upsert(data)
    if project.sewerNetwork is not None:
        await save_sewer_network_to_postgis(project.id, project.sewerNetwork.model_dump(), db)
    return project


@app.get("/projects", response_model=List[Project])
async def get_projects(db: AsyncSession = Depends(get_db)):
    repo = ProjectRepository(db)
    rows = await repo.get_all()
    return [_row_to_project(r, include_sewer_network=False) for r in rows]


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


def _sanitize_spurious_zero_elevations(G: nx.Graph, threshold: float = 50.0) -> None:
    """Final safeguard for boundary zero artifacts that escaped earlier stages.

    Enrichment and graph building should already prefer valid coincident values.
    This only clears residual elevation=0 nodes when surrounding nodes are
    clearly much higher, preventing spurious outlets and wrong routing.
    """
    for node in list(G.nodes):
        z = G.nodes[node].get("z")
        if z is None or z != 0:
            continue

        neighbor_elevs = [
            G.nodes[nb].get("z")
            for nb in G.neighbors(node)
            if G.nodes[nb].get("z") is not None and G.nodes[nb].get("z") != 0
        ]
        if not neighbor_elevs:
            continue

        median_z = sorted(neighbor_elevs)[len(neighbor_elevs) // 2]
        if median_z > threshold:
            G.nodes[node]["z"] = None


def _break_cycles(tree: nx.DiGraph) -> None:
    """Remove edges to break all cycles, preferring to cut uphill edges."""
    while True:
        try:
            cycle = nx.find_cycle(tree)
        except nx.NetworkXNoCycle:
            break

        # Find the worst edge: the one going most uphill (smallest elevation drop)
        worst_edge = None
        worst_score = float("inf")
        for u, v in cycle:
            z_u = tree.nodes[u].get("z")
            z_v = tree.nodes[v].get("z")
            drop = (z_u - z_v) if (z_u is not None and z_v is not None) else 0.0
            if drop < worst_score:
                worst_score = drop
                worst_edge = (u, v)

        if worst_edge is None:
            worst_edge = cycle[-1][:2]

        tree.remove_edge(*worst_edge)


def _select_collection_points(
    G: nx.Graph,
    outlet: str,
    cluster_radius_m: float = MIN_PV_SPACING,
    explicit_points: set[str] | None = None,
) -> set[str]:
    """Select collection points for routing.

    Priority:
    1. Explicitly marked collection points from the edited graph.
    2. Automatic low points (`AZUL_ESCURO`), spatially deduplicated so we
       keep only the deepest low point inside each local cluster.

    The outlet is always preserved.
    """
    if explicit_points:
        return explicit_points | {outlet}

    candidates = [
        node for node, data in G.nodes(data=True)
        if data.get("node_type") == "AZUL_ESCURO"
    ]
    candidates.sort(
        key=lambda node: (
            G.nodes[node].get("z") is None,
            G.nodes[node].get("z", float("inf")),
            str(node),
        ),
    )

    selected = {outlet}
    for candidate in candidates:
        cand_y = G.nodes[candidate].get("y")
        cand_x = G.nodes[candidate].get("x")
        if cand_y is None or cand_x is None:
            continue

        is_redundant = False
        for existing in selected:
            existing_y = G.nodes[existing].get("y")
            existing_x = G.nodes[existing].get("x")
            if existing_y is None or existing_x is None:
                continue
            if haversine(cand_y, cand_x, existing_y, existing_x) < cluster_radius_m:
                is_redundant = True
                break

        if not is_redundant:
            selected.add(candidate)

    return selected


class ProcessRequest(BaseModel):
    """Optional request body for processing with an edited graph."""
    nodes: list[dict] | None = None
    edges: list[dict] | None = None

    model_config = {"extra": "allow"}


def _build_graph_from_edited(data: ProcessRequest) -> nx.Graph:
    """Build a NetworkX graph from an edited node/edge list sent by the frontend."""
    G = nx.Graph()
    for n in data.nodes or []:
        G.add_node(
            n["id"],
            x=n.get("lng", n.get("x", 0)),
            y=n.get("lat", n.get("y", 0)),
            z=n.get("elevation", n.get("z")),
            node_type=n.get("node_type") or n.get("nodeType"),
            pv_obrigatorio=n.get("pv_obrigatorio") or n.get("pvObrigatorio", False),
            is_intersection=n.get("is_intersection") or n.get("isIntersection", False),
            is_endpoint=n.get("is_endpoint") or n.get("isEndpoint", False),
            is_collection_point=n.get("is_collection_point") or n.get("isCollectionPoint", False),
        )
    for e in data.edges or []:
        src = e.get("source_node_id") or e.get("sourceId", "")
        tgt = e.get("target_node_id") or e.get("targetId", "")
        if src and tgt and src in G and tgt in G:
            G.add_edge(
                src, tgt,
                length_m=e.get("length_m") or e.get("length", 0),
                name=e.get("name") or e.get("streetName"),
                highway=e.get("highway"),
                street_id=e.get("street_id") or e.get("streetId", ""),
            )
    return G


@app.post("/projects/{project_id}/process")
async def process_sewer_network(
    project_id: str,
    body: ProcessRequest | None = None,
    db: AsyncSession = Depends(get_db),
):
    """Execute the full sewer network pipeline.

    If a request body with nodes/edges is provided, uses that edited graph
    instead of rebuilding from the stored streets_geojson.
    """
    repo = ProjectRepository(db)
    project = await repo.get_by_id(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Use edited graph if provided, otherwise rebuild from streets_geojson
    if body and body.nodes:
        G = _build_graph_from_edited(body)
    else:
        streets_geojson = project.streets_geojson
        if not streets_geojson or not isinstance(streets_geojson, dict):
            raise HTTPException(
                status_code=400,
                detail="No streets data. Select an area and extract streets first.",
            )
        clean_geojson = {k: v for k, v in streets_geojson.items() if not k.startswith("_")}
        G = build_graph_from_geojson(clean_geojson)

    if len(G.nodes) == 0:
        raise HTTPException(
            status_code=400,
            detail="Could not extract graph from streets data.",
        )

    # Sanity check: elevation=0 surrounded by high neighbors is a DEM edge artifact
    _sanitize_spurious_zero_elevations(G)

    # Sanitization modifies G in-place but preserves street coverage —
    # every original street edge is represented by one or more edges in the
    # sanitized graph. ensure_full_coverage will use this sanitized G
    # so that node IDs match the RSPH tree (no shortcut mismatch).

    # Etapa 1: Classification (already done during extraction)
    mandatory = {
        n for n, d in G.nodes(data=True)
        if d.get("pv_obrigatorio", False)
    }

    # Etapa 1.5: Enforce direction changes > 45° → PV obrigatório
    enforce_direction_changes(G)

    # Etapas 2/2.5 (subdivisão) removidas — criavam centenas de nós
    # intermediários que inflavam a rede. O pipeline atual trabalha
    # diretamente com arestas longas e reduz nós apenas no estágio
    # posterior de otimização.

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

    explicit_collection_points = {
        node for node, data in G.nodes(data=True)
        if data.get("is_collection_point")
    }

    # Reset stale flags before recomputing collection points for this run.
    for _, data in G.nodes(data=True):
        data["is_collection_point"] = False

    # Identify collection points. Explicit user selections win when present;
    # otherwise use automatic low points, but collapse nearby minima into a
    # single sink to avoid over-populating the graph with local collectors.
    collection_points = _select_collection_points(
        G,
        outlet,
        explicit_points=explicit_collection_points,
    )

    # Mark collection points in node data
    for cp in collection_points:
        if cp in G:
            G.nodes[cp]["is_collection_point"] = True
            G.nodes[cp]["pv_obrigatorio"] = True

    # Etapa 6: RSPH gravity routing (multi-outlet via super-sink)
    tree, unreachable = rsph_sewer_routing(G, outlet, mandatory, collection_points)

    # Etapa 7: Resolve low points
    tree, pump_stations = resolve_low_points(tree, unreachable, G, outlet)

    # Etapa 7.5: Ensure full street coverage — every street needs a collector.
    # Uses sanitized G so node IDs match the RSPH tree exactly.
    ensure_full_coverage(tree, G)

    # Safety net: ensure tree is a DAG before dimensioning
    if not nx.is_directed_acyclic_graph(tree):
        _break_cycles(tree)
        # Cycle breaking may have removed coverage edges — repair.
        # The tree is now a DAG, so re-adding edges is safe.
        ensure_full_coverage(tree, G)

    # Etapa 7.8: Optimize node placement — minimize PVs using greedy
    # contraction with junction simplification + MILP refinement.
    optimize_node_placement(tree, outlet=outlet)

    # Etapa 8: Hydraulic dimensioning
    pipes = dimension_network(tree)

    # Etapa 9: Accessory type assignment
    tree = assign_accessory_types(tree, pipes)

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
            is_collection_point=d.get("is_collection_point", False),
            accessory_type=d.get("accessory_type"),
        ))

    edges_out = []
    for u, v, d in tree.edges(data=True):
        edges_out.append(SewerEdge(
            id=f"{u}->{v}",
            source_node_id=str(u),
            target_node_id=str(v),
            length_m=d.get("length_m", 0),
            slope=d.get("slope"),
            cost=d.get("cost"),
            name=d.get("name"),
            highway=d.get("highway"),
            waypoints=d.get("waypoints"),
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

    await save_sewer_network_to_postgis(project_id, result.model_dump(), db)
    if isinstance(project.streets_geojson, dict):
        project.streets_geojson = {
            **project.streets_geojson,
            "_sewerNetwork": result.model_dump(),
        }
        await db.commit()

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
