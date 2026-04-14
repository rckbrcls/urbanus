"""
Sewer node reduction and PV placement optimization.

This module minimizes the number of physical access nodes left in the directed
sewer network while preserving constraints that make a through-pipe valid:
maximum PV spacing, maximum direction deflection, and maximum terrain grade
break. The optimizer mutates the NetworkX graph in-place and keeps the outlet
protected from removal.
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

    The internal geometric angle is converted to deflection so a straight line
    returns 0 degrees and a U-turn returns 180 degrees.

    Args:
        tree: Directed sewer graph with node coordinates in ``x``/``y``.
        a: Upstream neighbor id.
        b: Node where the direction changes.
        c: Downstream neighbor id.

    Returns:
        Deflection angle in degrees.
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
    """Return the absolute terrain-slope change at a pass-through node.

    Missing elevation means the grade break cannot be proven, so the helper
    returns ``0`` and lets other constraints decide whether the node can merge.

    Args:
        tree: Directed sewer graph with ``z`` node elevations.
        a: Upstream neighbor id.
        b: Candidate node id.
        c: Downstream neighbor id.

    Returns:
        Absolute slope difference in m/m between ``a -> b`` and ``b -> c``.
    """
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

    Args:
        tree: Directed sewer graph.
        node: Candidate node that may be removed.
        pred: The only upstream node for this through-pipe check.
        succ: The only downstream node for this through-pipe check.
        max_spacing: Maximum allowed length after merging both edges.

    Returns:
        ``True`` when the middle node can be removed without violating the
        current geometric and spacing constraints.
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

    Preserves only pre-existing edge waypoints. The removed node position
    is intentionally not promoted to the merged edge geometry, so the
    processed network reflects the simplified topology immediately.

    Args:
        tree: Directed sewer graph to mutate.
        pred: Upstream node id.
        node: Middle node id to remove.
        succ: Downstream node id.

    Returns:
        None. The graph is rewired in-place when no ``pred -> succ`` edge
        already exists.
    """
    d1 = tree.edges[pred, node].get("length_m", 0)
    d2 = tree.edges[node, succ].get("length_m", 0)
    e1 = dict(tree.edges[pred, node])
    e2 = dict(tree.edges[node, succ])
    merged = {**e1, **e2, "length_m": d1 + d2}

    # Keep only geometry that already existed on the input edges. The removed
    # node is a topology simplification, not a new waypoint to render.
    wp1 = list(e1.get("waypoints") or [])
    wp2 = list(e2.get("waypoints") or [])
    waypoints = wp1 + wp2
    if waypoints:
        merged["waypoints"] = waypoints
    else:
        merged.pop("waypoints", None)

    tree.remove_edge(pred, node)
    tree.remove_edge(node, succ)

    # The node may still have other incident edges when called from junction
    # simplification; remove it only after the local pair is fully detached.
    if tree.in_degree(node) == 0 and tree.out_degree(node) == 0:
        tree.remove_node(node)

    if not tree.has_edge(pred, succ):
        tree.add_edge(pred, succ, **merged)


# ---------------------------------------------------------------------------
# Phase 1 - Greedy contraction
# ---------------------------------------------------------------------------

def _simplify_junctions(tree: nx.DiGraph, max_spacing: float) -> None:
    """Simplify junction nodes by merging through-pipe pairs.

    At a junction node J, if an incoming edge P->J and outgoing edge J->S
    form a straight-enough through-pipe, merge them into P->S.

    After merging, remaining edges at J are redirected:
    - Remaining in-edges (X->J) become X->S (flow to downstream)
    - Remaining out-edges (J->Y) become P->Y (flow from upstream)
    Then J is removed entirely.

    Args:
        tree: Directed sewer graph to mutate.
        max_spacing: Maximum allowed length for any merged through-pipe.

    Returns:
        None. Eligible junctions are simplified in-place until stable.
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
                    # Prefer the straightest valid through-pipe so the junction
                    # keeps the most natural trunk alignment.
                    angle = _direction_angle(tree, pred, node, succ)
                    score = (45.0 - angle) / 45.0
                    if score > best_score:
                        best_score = score
                        best_pair = (pred, succ)

            if not best_pair:
                continue

            pred, succ = best_pair
            _merge_edge_pair(tree, pred, node, succ)

            # Redirect remaining edges so node can be fully removed
            # without carrying the removed node into edge geometry.
            if node in tree:
                for x in list(tree.predecessors(node)):
                    edata = dict(tree.edges[x, node])
                    tree.remove_edge(x, node)
                    if x != succ and not tree.has_edge(x, succ):
                        # Empty waypoint lists are removed to avoid serializing
                        # misleading geometry on synthetic shortcut edges.
                        if not edata.get("waypoints"):
                            edata.pop("waypoints", None)
                        tree.add_edge(x, succ, **edata)

                for y in list(tree.successors(node)):
                    edata = dict(tree.edges[node, y])
                    tree.remove_edge(node, y)
                    if y != pred and not tree.has_edge(pred, y):
                        # Route outgoing branches through the upstream side of
                        # the selected trunk once the junction disappears.
                        if not edata.get("waypoints"):
                            edata.pop("waypoints", None)
                        tree.add_edge(pred, y, **edata)

                if tree.in_degree(node) == 0 and tree.out_degree(node) == 0:
                    tree.remove_node(node)

            changed = True


def _greedy_contract(tree: nx.DiGraph, max_spacing: float) -> None:
    """Phase 1: Greedy contraction of non-mandatory nodes.

    Iterates until no more contractions are possible:
    1. Simplify junctions (merge through-pipe pairs)
    2. Remove pass-through nodes (degree 2, 1-in 1-out)

    Args:
        tree: Directed sewer graph to mutate.
        max_spacing: Maximum allowed spacing between consecutive kept PVs.

    Returns:
        None. Nodes are removed in-place until no local merge is valid.
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

            # A pure pass-through node has exactly one upstream and one
            # downstream edge, so merging it cannot change branch topology.
            pred = next(tree.predecessors(node))
            succ = next(tree.successors(node))
            if pred == succ:
                continue
            if not _is_through_pipe(tree, node, pred, succ, max_spacing):
                continue

            _merge_edge_pair(tree, pred, node, succ)
            changed = True


# ---------------------------------------------------------------------------
# Optional MILP refinement
# ---------------------------------------------------------------------------

def _milp_refine(tree: nx.DiGraph, max_spacing: float) -> None:
    """Refine remaining non-mandatory nodes with an optional MILP solve.

    Candidate degree-2 nodes are modeled as binary variables where ``1`` means
    keep the node and ``0`` means remove it. Chain constraints keep enough nodes
    to satisfy ``max_spacing`` along long uninterrupted runs. If SciPy is not
    installed, or if the solver cannot find a valid solution, this refinement is
    skipped without changing the graph.

    Args:
        tree: Directed sewer graph to mutate.
        max_spacing: Maximum allowed spacing between consecutive kept PVs.

    Returns:
        None. Successful solves remove nodes in-place.
    """
    try:
        from scipy.optimize import LinearConstraint, milp
        from scipy.sparse import eye as speye
        import numpy as np
    except ImportError:
        return

    candidates = []
    for node in tree.nodes:
        # MILP only reasons about simple pass-through nodes. Branches and
        # mandatory PVs were already protected by earlier phases.
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

        # Expand left and right across adjacent candidates to build one linear
        # chain whose spacing can be constrained as a group.
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

        # Keep the minimum number of interior nodes needed so no segment
        # between preserved PVs exceeds max_spacing.
        n_min = max(0, math.ceil(total_length / max_spacing) - 1)
        if n_min > 0:
            row = [0.0] * n
            for c in chain:
                row[idx[c]] = 1.0
            constraints_A.append(row)
            constraints_lb.append(float(n_min))

    c = np.ones(n)
    integrality = np.ones(n)
    # Bound every binary variable to [0, 1]. The objective minimizes the number
    # of kept nodes, while chain constraints prevent over-aggressive removal.
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
                    # Re-check local topology before mutating because earlier
                    # removals in this loop may have changed neighboring edges.
                    _merge_edge_pair(tree, pred, node, succ)


# ---------------------------------------------------------------------------
# Spatial clustering of close nodes
# ---------------------------------------------------------------------------

def _merge_close_nodes(tree: nx.DiGraph, radius: float, outlet: str | None) -> None:
    """Merge nodes that are spatially close (within *radius* metres).

    Uses Union-Find to group nearby nodes, then merges each group into a
    single representative (the one with highest degree).  All edges from
    other members are redirected to the representative.

    The outlet node is never absorbed into another node.

    Args:
        tree: Directed sewer graph to mutate.
        radius: Clustering radius in meters.
        outlet: Optional outlet node id that must remain the representative of
            any cluster containing it.

    Returns:
        None. Close nodes are merged in-place.
    """
    from urbanus_geo.calculations import haversine

    nodes = list(tree.nodes)
    n = len(nodes)
    if n < 2:
        return

    # Union-Find groups all nodes linked by pairwise proximity.
    parent = {nd: nd for nd in nodes}

    def find(x: str) -> str:
        """Return the representative id for a proximity cluster."""
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a: str, b: str) -> None:
        """Merge two proximity clusters."""
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[rb] = ra

    # Cache coordinates so the pair scan does not repeatedly touch node attrs.
    coords = {
        nd: (tree.nodes[nd].get("y", 0), tree.nodes[nd].get("x", 0))
        for nd in nodes
    }
    # Quick degree filter avoids haversine calls for obviously distant nodes.
    deg_threshold = radius / 111_000
    for i in range(n):
        ai = coords[nodes[i]]
        for j in range(i + 1, n):
            bj = coords[nodes[j]]
            # The pre-filter is conservative near the equator and acceptable as
            # an early rejection before the exact haversine distance.
            if abs(ai[0] - bj[0]) > deg_threshold or abs(ai[1] - bj[1]) > deg_threshold:
                continue
            dist = haversine(ai[0], ai[1], bj[0], bj[1])
            if dist <= radius:
                union(nodes[i], nodes[j])

    # Convert Union-Find parent links into explicit member lists.
    clusters: dict[str, list[str]] = {}
    for nd in nodes:
        root = find(nd)
        clusters.setdefault(root, []).append(nd)

    for members in clusters.values():
        if len(members) < 2:
            continue

        # Preserve the outlet when present; otherwise keep the node with the
        # most incident flow because it best represents the local topology.
        rep = members[0]
        for m in members:
            if m == outlet:
                rep = m
                break
            if (tree.in_degree(m) + tree.out_degree(m)) > (tree.in_degree(rep) + tree.out_degree(rep)):
                rep = m

        # Redirect all edges from other members to rep without injecting
        # absorbed-node positions into the resulting geometry.
        member_set = set(members)
        for m in members:
            if m == rep:
                continue
            if m not in tree:
                continue

            for pred in list(tree.predecessors(m)):
                edata = dict(tree.edges[pred, m])
                tree.remove_edge(pred, m)
                if pred in member_set or pred == rep:
                    # Internal cluster edges disappear because all members now
                    # collapse to the same representative.
                    continue
                if not tree.has_edge(pred, rep):
                    if not edata.get("waypoints"):
                        edata.pop("waypoints", None)
                    tree.add_edge(pred, rep, **edata)

            for succ in list(tree.successors(m)):
                edata = dict(tree.edges[m, succ])
                tree.remove_edge(m, succ)
                if succ in member_set or succ == rep:
                    # Avoid self-loops after the cluster collapses.
                    continue
                if not tree.has_edge(rep, succ):
                    if not edata.get("waypoints"):
                        edata.pop("waypoints", None)
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

    The optimizer protects the outlet, greedily removes valid through-pipe
    nodes and junction shortcuts, merges spatially duplicated nodes, repairs any
    cycles created by spatial merging, and finally runs an optional MILP pass to
    remove additional simple pass-through nodes while respecting spacing.

    Args:
        tree: Directed sewer network DAG to mutate.
        max_spacing: Maximum distance between consecutive PVs (m).
        outlet: Outlet node ID (always kept).

    Returns:
        None. ``tree`` is modified in-place.
    """
    if outlet and tree.has_node(outlet):
        # The discharge point must survive every optimization phase.
        tree.nodes[outlet]["pv_obrigatorio"] = True

    # Phase 1: merge only when the result fits the real spacing target.
    # Using the real max_spacing ensures every merge produces a net
    # node reduction in the current pipeline.
    _greedy_contract(tree, max_spacing)

    # Spatial cleanup: merge clustered nodes (< 20m apart).
    _merge_close_nodes(tree, radius=20.0, outlet=outlet)

    # Safety: spatial merging can create cycles, so break them.
    if not nx.is_directed_acyclic_graph(tree):
        while True:
            try:
                cycle = nx.find_cycle(tree)
            except nx.NetworkXNoCycle:
                break
            # Remove the least gravity-friendly edge in the cycle. This keeps
            # the strongest downhill edges when there is a topological conflict.
            worst = min(
                cycle,
                key=lambda e: (
                    (tree.nodes[e[0]].get("z", 0) or 0)
                    - (tree.nodes[e[1]].get("z", 0) or 0)
                ),
            )
            tree.remove_edge(worst[0], worst[1])

    # Optional final refinement with real spacing.
    _milp_refine(tree, max_spacing)
