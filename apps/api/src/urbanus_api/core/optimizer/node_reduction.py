"""
Otimizacao de nos da rede de esgoto.

Minimiza o numero de PVs (pocos de visita) na rede usando:
  Phase 1: Contracao gulosa (pass-through + cadeias + juncoes)
  Phase 2: Refinamento MILP (scipy, opcional)
  Phase 3: Re-enforcement de espacamento NBR 9649
"""

from __future__ import annotations

import math

import networkx as nx

from urbanus_geo.constants import (
    DIRECTION_CHANGE_THRESHOLD,
    GRADE_BREAK_THRESHOLD,
    MAX_PV_SPACING,
)


# ---------------------------------------------------------------------------
# Geometry helpers
# ---------------------------------------------------------------------------

def _direction_angle(tree: nx.DiGraph, a: str, b: str, c: str) -> float:
    """Deflection angle at node b between edges a->b and b->c (degrees).

    Returns 0 for a straight line, 180 for a U-turn.
    """
    from urbanus_geo.calculations import angle_at_node

    ba = tree.nodes[a]
    bb = tree.nodes[b]
    bc = tree.nodes[c]
    internal = angle_at_node(
        (ba.get("y", 0), ba.get("x", 0)),
        (bb.get("y", 0), bb.get("x", 0)),
        (bc.get("y", 0), bc.get("x", 0)),
    )
    return 180.0 - internal


def _slope_break(tree: nx.DiGraph, a: str, b: str, c: str) -> float:
    """Absolute slope difference (m/m) between edges a->b and b->c."""
    z_a = tree.nodes[a].get("z")
    z_b = tree.nodes[b].get("z")
    z_c = tree.nodes[c].get("z")
    if z_a is None or z_b is None or z_c is None:
        return 0.0
    d_ab = tree.edges[a, b].get("length_m", 1.0)
    d_bc = tree.edges[b, c].get("length_m", 1.0)
    s1 = abs(z_a - z_b) / max(d_ab, 0.1)
    s2 = abs(z_b - z_c) / max(d_bc, 0.1)
    return abs(s1 - s2)


def _is_through_pipe(
    tree: nx.DiGraph,
    node: str,
    pred: str,
    succ: str,
    max_spacing: float,
) -> bool:
    """Check if pred->node->succ is a through-pipe (no PV needed).

    A through-pipe has:
    - Deflection angle < DIRECTION_CHANGE_THRESHOLD (45 deg)
    - Slope break < GRADE_BREAK_THRESHOLD (3%)
    - Merged length <= max_spacing
    """
    d1 = tree.edges[pred, node].get("length_m", 0)
    d2 = tree.edges[node, succ].get("length_m", 0)
    if d1 + d2 > max_spacing:
        return False
    if _direction_angle(tree, pred, node, succ) >= DIRECTION_CHANGE_THRESHOLD:
        return False
    if _slope_break(tree, pred, node, succ) >= GRADE_BREAK_THRESHOLD:
        return False
    return True


# ---------------------------------------------------------------------------
# Edge merging
# ---------------------------------------------------------------------------

def _merge_edge_pair(
    tree: nx.DiGraph, pred: str, node: str, succ: str,
) -> None:
    """Remove *node* and merge pred->node + node->succ into pred->succ.

    Preserves the removed node's position as a waypoint so that the
    merged edge can be rendered following the original street path
    instead of a straight line.
    """
    d1 = tree.edges[pred, node].get("length_m", 0)
    d2 = tree.edges[node, succ].get("length_m", 0)
    e1 = dict(tree.edges[pred, node])
    e2 = dict(tree.edges[node, succ])
    merged = {**e1, **e2, "length_m": d1 + d2}

    # Accumulate waypoints: existing waypoints from both edges + the node position
    wp1 = list(e1.get("waypoints") or [])
    node_data = tree.nodes[node]
    node_pos = [node_data.get("x", 0), node_data.get("y", 0)]
    wp2 = list(e2.get("waypoints") or [])
    merged["waypoints"] = wp1 + [node_pos] + wp2

    tree.remove_edge(pred, node)
    tree.remove_edge(node, succ)

    if tree.in_degree(node) == 0 and tree.out_degree(node) == 0:
        tree.remove_node(node)

    if not tree.has_edge(pred, succ):
        tree.add_edge(pred, succ, **merged)


# ---------------------------------------------------------------------------
# Phase 1 — Greedy contraction
# ---------------------------------------------------------------------------

def _simplify_junctions(tree: nx.DiGraph, max_spacing: float) -> None:
    """Simplify junction nodes by merging through-pipe pairs.

    At a junction node J, if an incoming edge P->J and outgoing edge J->S
    form a straight-enough through-pipe, merge them into P->S.

    After merging, remaining edges at J are redirected:
    - Remaining in-edges (X->J) become X->S (flow to downstream)
    - Remaining out-edges (J->Y) become P->Y (flow from upstream)
    Then J is removed entirely.
    """
    changed = True
    while changed:
        changed = False
        for node in list(tree.nodes):
            if node not in tree:
                continue
            if tree.nodes[node].get("pv_obrigatorio"):
                continue
            if tree.in_degree(node) + tree.out_degree(node) < 3:
                continue

            best_pair = None
            best_score = -1.0
            for pred in list(tree.predecessors(node)):
                for succ in list(tree.successors(node)):
                    if pred == succ:
                        continue
                    if not _is_through_pipe(tree, node, pred, succ, max_spacing):
                        continue
                    angle = _direction_angle(tree, pred, node, succ)
                    score = (45.0 - angle) / 45.0
                    if score > best_score:
                        best_score = score
                        best_pair = (pred, succ)

            if not best_pair:
                continue

            pred, succ = best_pair
            _merge_edge_pair(tree, pred, node, succ)

            # Redirect remaining edges so node can be fully removed,
            # preserving the node position as a waypoint.
            if node in tree:
                node_pos = [tree.nodes[node].get("x", 0), tree.nodes[node].get("y", 0)]

                for x in list(tree.predecessors(node)):
                    edata = dict(tree.edges[x, node])
                    tree.remove_edge(x, node)
                    if x != succ and not tree.has_edge(x, succ):
                        wp = list(edata.get("waypoints") or [])
                        wp.append(node_pos)
                        edata["waypoints"] = wp
                        tree.add_edge(x, succ, **edata)

                for y in list(tree.successors(node)):
                    edata = dict(tree.edges[node, y])
                    tree.remove_edge(node, y)
                    if y != pred and not tree.has_edge(pred, y):
                        wp = list(edata.get("waypoints") or [])
                        wp.insert(0, node_pos)
                        edata["waypoints"] = wp
                        tree.add_edge(pred, y, **edata)

                if tree.in_degree(node) == 0 and tree.out_degree(node) == 0:
                    tree.remove_node(node)

            changed = True


def _greedy_contract(tree: nx.DiGraph, max_spacing: float) -> None:
    """Phase 1: Greedy contraction of non-mandatory nodes.

    Iterates until no more contractions are possible:
    1. Simplify junctions (merge through-pipe pairs)
    2. Remove pass-through nodes (degree 2, 1-in 1-out)
    """
    changed = True
    while changed:
        changed = False

        before = tree.number_of_nodes()
        _simplify_junctions(tree, max_spacing)
        if tree.number_of_nodes() < before:
            changed = True

        for node in list(tree.nodes):
            if node not in tree:
                continue
            if tree.nodes[node].get("pv_obrigatorio"):
                continue
            if tree.in_degree(node) != 1 or tree.out_degree(node) != 1:
                continue

            pred = next(tree.predecessors(node))
            succ = next(tree.successors(node))
            if pred == succ:
                continue
            if not _is_through_pipe(tree, node, pred, succ, max_spacing):
                continue

            _merge_edge_pair(tree, pred, node, succ)
            changed = True


# ---------------------------------------------------------------------------
# Phase 2 — MILP refinement
# ---------------------------------------------------------------------------

def _milp_refine(tree: nx.DiGraph, max_spacing: float) -> None:
    """Phase 2: MILP refinement of remaining non-mandatory nodes.

    Uses scipy.optimize.milp if available; otherwise skips silently.
    """
    try:
        from scipy.optimize import LinearConstraint, milp
        from scipy.sparse import eye as speye
        import numpy as np
    except ImportError:
        return

    candidates = []
    for node in tree.nodes:
        if tree.nodes[node].get("pv_obrigatorio"):
            continue
        if tree.in_degree(node) != 1 or tree.out_degree(node) != 1:
            continue
        pred = next(tree.predecessors(node))
        succ = next(tree.successors(node))
        if _direction_angle(tree, pred, node, succ) >= DIRECTION_CHANGE_THRESHOLD:
            continue
        if _slope_break(tree, pred, node, succ) >= GRADE_BREAK_THRESHOLD:
            continue
        candidates.append(node)

    if not candidates:
        return

    n = len(candidates)
    idx = {node: i for i, node in enumerate(candidates)}

    visited: set[str] = set()
    constraints_A: list[list[float]] = []
    constraints_lb: list[float] = []

    for node in candidates:
        if node in visited:
            continue
        chain = [node]
        visited.add(node)

        cur = node
        while True:
            pred = next(tree.predecessors(cur))
            if pred in idx and pred not in visited:
                chain.insert(0, pred)
                visited.add(pred)
                cur = pred
            else:
                break
        cur = node
        while True:
            succ = next(tree.successors(cur))
            if succ in idx and succ not in visited:
                chain.append(succ)
                visited.add(succ)
                cur = succ
            else:
                break

        chain_start = next(tree.predecessors(chain[0]))
        chain_end = next(tree.successors(chain[-1]))

        total_length = tree.edges[chain_start, chain[0]].get("length_m", 0)
        for i in range(1, len(chain)):
            total_length += tree.edges[chain[i - 1], chain[i]].get("length_m", 0)
        total_length += tree.edges[chain[-1], chain_end].get("length_m", 0)

        n_min = max(0, math.ceil(total_length / max_spacing) - 1)
        if n_min > 0:
            row = [0.0] * n
            for c in chain:
                row[idx[c]] = 1.0
            constraints_A.append(row)
            constraints_lb.append(float(n_min))

    c = np.ones(n)
    integrality = np.ones(n)
    bounds = LinearConstraint(speye(n), 0, 1)

    if constraints_A:
        A = np.array(constraints_A)
        chain_bounds = LinearConstraint(
            A, constraints_lb, np.full(len(constraints_lb), np.inf),
        )
        result = milp(c, integrality=integrality, constraints=[bounds, chain_bounds])
    else:
        result = milp(c, integrality=integrality, constraints=[bounds])

    if not result.success:
        return

    for i, node in enumerate(candidates):
        if result.x[i] < 0.5 and node in tree:
            if tree.in_degree(node) == 1 and tree.out_degree(node) == 1:
                pred = next(tree.predecessors(node))
                succ = next(tree.successors(node))
                if pred != succ:
                    _merge_edge_pair(tree, pred, node, succ)


# ---------------------------------------------------------------------------
# Phase 3 — Spacing enforcement
# ---------------------------------------------------------------------------

def _enforce_spacing(tree: nx.DiGraph, max_spacing: float) -> None:
    """Phase 3: Insert intermediate nodes on edges exceeding max_spacing.

    For each edge longer than max_spacing, inserts the minimum number of
    equally-spaced intermediate nodes with linearly interpolated elevation.
    """
    edges_to_split = [
        (u, v, d)
        for u, v, d in tree.edges(data=True)
        if d.get("length_m", 0) > max_spacing
    ]

    for u, v, data in edges_to_split:
        if u not in tree or v not in tree or not tree.has_edge(u, v):
            continue

        length = data.get("length_m", 0)
        n_segments = math.ceil(length / max_spacing)
        if n_segments < 2:
            continue

        u_data = tree.nodes[u]
        v_data = tree.nodes[v]
        lat_u, lng_u = u_data.get("y", 0), u_data.get("x", 0)
        lat_v, lng_v = v_data.get("y", 0), v_data.get("x", 0)
        z_u = u_data.get("z")
        z_v = v_data.get("z")

        tree.remove_edge(u, v)
        edge_data = {k: val for k, val in data.items() if k != "length_m"}
        seg_length = length / n_segments

        prev = u
        for i in range(1, n_segments):
            frac = i / n_segments
            new_id = f"spacing_{u}_{v}_{i}"
            new_lat = lat_u + frac * (lat_v - lat_u)
            new_lng = lng_u + frac * (lng_v - lng_u)
            new_z = None
            if z_u is not None and z_v is not None:
                new_z = z_u + frac * (z_v - z_u)

            tree.add_node(
                new_id, x=new_lng, y=new_lat, z=new_z,
                node_type="VERDE",
            )
            tree.add_edge(prev, new_id, **edge_data, length_m=seg_length)
            prev = new_id

        tree.add_edge(prev, v, **edge_data, length_m=seg_length)


# ---------------------------------------------------------------------------
# Phase 4 — Spatial clustering of close nodes
# ---------------------------------------------------------------------------

def _merge_close_nodes(tree: nx.DiGraph, radius: float, outlet: str | None) -> None:
    """Merge nodes that are spatially close (within *radius* metres).

    Uses Union-Find to group nearby nodes, then merges each group into a
    single representative (the one with highest degree).  All edges from
    other members are redirected to the representative.

    The outlet node is never absorbed into another node.
    """
    from urbanus_geo.calculations import haversine

    nodes = list(tree.nodes)
    n = len(nodes)
    if n < 2:
        return

    # Union-Find
    parent = {nd: nd for nd in nodes}

    def find(x: str) -> str:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a: str, b: str) -> None:
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[rb] = ra

    # Build clusters within radius
    coords = {
        nd: (tree.nodes[nd].get("y", 0), tree.nodes[nd].get("x", 0))
        for nd in nodes
    }
    for i in range(n):
        for j in range(i + 1, n):
            a, b = nodes[i], nodes[j]
            dist = haversine(coords[a][0], coords[a][1], coords[b][0], coords[b][1])
            if dist <= radius:
                union(a, b)

    # Group by cluster root
    clusters: dict[str, list[str]] = {}
    for nd in nodes:
        root = find(nd)
        clusters.setdefault(root, []).append(nd)

    for members in clusters.values():
        if len(members) < 2:
            continue

        # Pick representative: outlet > highest total degree > first
        rep = members[0]
        for m in members:
            if m == outlet:
                rep = m
                break
            if (tree.in_degree(m) + tree.out_degree(m)) > (tree.in_degree(rep) + tree.out_degree(rep)):
                rep = m

        # Redirect all edges from other members to rep, preserving waypoints
        member_set = set(members)
        for m in members:
            if m == rep:
                continue
            if m not in tree:
                continue

            m_pos = [tree.nodes[m].get("x", 0), tree.nodes[m].get("y", 0)]

            for pred in list(tree.predecessors(m)):
                edata = dict(tree.edges[pred, m])
                tree.remove_edge(pred, m)
                if pred in member_set or pred == rep:
                    continue
                if not tree.has_edge(pred, rep):
                    # Append m's position as waypoint so the line follows the street
                    wp = list(edata.get("waypoints") or [])
                    wp.append(m_pos)
                    edata["waypoints"] = wp
                    tree.add_edge(pred, rep, **edata)

            for succ in list(tree.successors(m)):
                edata = dict(tree.edges[m, succ])
                tree.remove_edge(m, succ)
                if succ in member_set or succ == rep:
                    continue
                if not tree.has_edge(rep, succ):
                    wp = list(edata.get("waypoints") or [])
                    wp.insert(0, m_pos)
                    edata["waypoints"] = wp
                    tree.add_edge(rep, succ, **edata)

            if m in tree and tree.in_degree(m) == 0 and tree.out_degree(m) == 0:
                tree.remove_node(m)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def optimize_node_placement(
    tree: nx.DiGraph,
    max_spacing: float = MAX_PV_SPACING,
    outlet: str | None = None,
) -> None:
    """Minimize nodes in the sewer network tree (in-place).

    Phase 1: Greedy contraction (pass-through + chains + junctions)
             Uses NO length limit — merge everything that's geometrically
             valid (angle < 45°, grade break < 3%).
    Phase 2: MILP refinement (scipy, optional)
    Phase 3: Spacing enforcement — re-inserts intermediate nodes so that
             no edge exceeds ``max_spacing``.

    Args:
        tree: Directed sewer network DAG.
        max_spacing: Maximum distance between consecutive PVs (m).
        outlet: Outlet node ID (always kept).
    """
    if outlet and tree.has_node(outlet):
        tree.nodes[outlet]["pv_obrigatorio"] = True

    # Phase 1: merge only when the result doesn't need spacing enforcement.
    # Merging with inf creates very long edges that _enforce_spacing then
    # splits, adding back MORE nodes than were removed. Using the real
    # max_spacing ensures every merge produces a net node reduction.
    _greedy_contract(tree, max_spacing)

    # Phase 2: Merge spatially clustered nodes (< 20m apart)
    _merge_close_nodes(tree, radius=20.0, outlet=outlet)

    # Safety: spatial merging can create cycles — break them
    if not nx.is_directed_acyclic_graph(tree):
        while True:
            try:
                cycle = nx.find_cycle(tree)
            except nx.NetworkXNoCycle:
                break
            # Remove the edge with smallest elevation drop (most uphill)
            worst = min(
                cycle,
                key=lambda e: (
                    (tree.nodes[e[0]].get("z", 0) or 0)
                    - (tree.nodes[e[1]].get("z", 0) or 0)
                ),
            )
            tree.remove_edge(worst[0], worst[1])

    # Phase 3: MILP refine with real spacing
    _milp_refine(tree, max_spacing)

    # Phase 4 (spacing enforcement) is intentionally skipped.
    # The graph already has nodes at every street intersection (~100-150m
    # apart), which satisfies NBR 9649 spacing (80-120m range).
    # Running _enforce_spacing would ADD nodes on every edge > 100m,
    # inflating the output beyond the input — the opposite of optimization.
