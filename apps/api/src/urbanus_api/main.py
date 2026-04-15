from __future__ import annotations

from typing import List

import networkx as nx

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession

from urbanus_api.models import (
    ElevationEnrichRequest,
    NodesExtractRequest,
    ProcessRequest,
    Project,
)
from urbanus_api.services.elevation import enrich_geojson as _enrich_geojson
from urbanus_api.core.graph.classification import (
    extract_nodes as _extract_nodes,
    enforce_direction_changes,
)
from urbanus_api.core.graph.sanitization import (
    detect_grade_breaks,
    enforce_min_pv_spacing,
    remove_redundant_nodes,
    resolve_curve_clusters,
)
from urbanus_api.core.graph.accessories import assign_accessory_types
from urbanus_api.core.graph.coverage import ensure_full_coverage
from urbanus_api.core.optimizer.node_reduction import optimize_node_placement
from urbanus_api.core.elevation.extrema import detect_extrema
from urbanus_api.core.routing.rsph import rsph_sewer_routing
from urbanus_api.data.database import get_db
from urbanus_api.data.repositories import ProjectRepository, save_sewer_network_to_postgis
from urbanus_geo.calculations import haversine
from urbanus_geo.constants import MIN_PV_SPACING
from urbanus_geo.types import NodeType, normalize_node_type

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
    2. Automatic low points (`LOW_POINT`), spatially deduplicated so we
       keep only the deepest low point inside each local cluster.

    The outlet is always preserved.
    """
    if explicit_points:
        return explicit_points | {outlet}

    candidates = [
        node for node, data in G.nodes(data=True)
        if normalize_node_type(data.get("node_type")) == NodeType.LOW_POINT
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


def _build_graph_from_edited(data: ProcessRequest) -> nx.Graph:
    """Build a NetworkX graph from the edited node/edge payload."""
    if not data.nodes or not data.edges:
        raise ValueError("Edited graph payload must include non-empty nodes and edges.")

    G = nx.Graph()
    for n in data.nodes or []:
        node_type = normalize_node_type(n.get("node_type") or n.get("nodeType"))
        G.add_node(
            n["id"],
            x=n.get("lng", n.get("x", 0)),
            y=n.get("lat", n.get("y", 0)),
            z=n.get("elevation", n.get("z")),
            node_type=node_type.value if node_type else None,
            pv_obrigatorio=n.get("pv_obrigatorio") or n.get("pvObrigatorio", False),
            is_intersection=n.get("is_intersection") or n.get("isIntersection", False),
            is_endpoint=n.get("is_endpoint") or n.get("isEndpoint", False),
            is_collection_point=n.get("is_collection_point") or n.get("isCollectionPoint", False),
        )

    invalid_edges = 0
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
        else:
            invalid_edges += 1

    if len(G.nodes) == 0:
        raise ValueError("Edited graph payload must include at least one node.")
    if invalid_edges > 0:
        raise ValueError("Edited graph payload contains edges that reference missing nodes.")
    if len(G.edges) == 0:
        raise ValueError("Edited graph payload must include at least one valid edge.")

    return G


@app.post("/projects/{project_id}/process")
async def process_sewer_network(
    project_id: str,
    body: ProcessRequest | None = None,
    db: AsyncSession = Depends(get_db),
):
    """Execute the sewer pipeline from the edited graph sent by the frontend."""
    repo = ProjectRepository(db)
    project = await repo.get_by_id(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if body is None:
        raise HTTPException(
            status_code=400,
            detail="Edited graph payload with nodes and edges is required.",
        )

    try:
        G = _build_graph_from_edited(body)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

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

    # Etapa 2: Enforce direction changes > 45° → PV obrigatório
    enforce_direction_changes(G)

    # Etapa 3: Remove redundant nodes
    G = remove_redundant_nodes(G)

    # Etapa 4: Resolve curve clusters
    G = resolve_curve_clusters(G)

    # Etapa 5: Enforce minimum PV spacing (80m)
    G = enforce_min_pv_spacing(G)

    # Etapa 6: Detect elevation extrema
    G = detect_extrema(G)

    # Etapa 7: Detect grade breaks (slope change > 3%)
    G = detect_grade_breaks(G)

    # Update mandatory set after sanitization
    mandatory = {
        n for n, d in G.nodes(data=True)
        if d.get("pv_obrigatorio", False) or normalize_node_type(d.get("node_type")) == NodeType.MANDATORY
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

    # Etapa 8: RSPH gravity routing (multi-outlet via super-sink)
    tree, unreachable = rsph_sewer_routing(G, outlet, mandatory, collection_points)

    # Etapa 9: Ensure full street coverage — every street needs a collector.
    # Uses sanitized G so node IDs match the RSPH tree exactly.
    ensure_full_coverage(tree, G)

    # Safety net: ensure tree is a DAG before serialization
    if not nx.is_directed_acyclic_graph(tree):
        _break_cycles(tree)
        # Cycle breaking may have removed coverage edges — repair.
        # The tree is now a DAG, so re-adding edges is safe.
        ensure_full_coverage(tree, G)

    # Etapa 10: Optimize node placement — minimize PVs using greedy
    # contraction with junction simplification + MILP refinement.
    optimize_node_placement(tree, outlet=outlet)

    # Etapa 11: Accessory type assignment
    tree = assign_accessory_types(tree)

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
            name=d.get("name"),
            highway=d.get("highway"),
            waypoints=d.get("waypoints"),
        ))

    result = SewerNetwork(
        project_id=project_id,
        nodes=nodes_out,
        edges=edges_out,
        unreachable_nodes=unreachable,
    )

    result_payload = result.model_dump()
    await save_sewer_network_to_postgis(project_id, result_payload, db)
    if isinstance(project.streets_geojson, dict):
        project.streets_geojson = {
            **project.streets_geojson,
            "_sewerNetwork": result_payload,
        }
        await db.commit()

    return result_payload


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
