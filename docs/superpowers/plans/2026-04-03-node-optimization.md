# Node Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Minimize sewer network nodes (PVs/manholes) using greedy graph contraction + MILP refinement, reducing construction cost by ~60-70%.

**Architecture:** New module `core/optimizer/node_reduction.py` replaces the simple `reduce_pass_through_nodes`. Three phases: (1) greedy contraction with junction simplification, (2) MILP refinement via scipy, (3) spacing re-enforcement. Operates on the directed tree after RSPH + coverage.

**Tech Stack:** NetworkX (graph operations), NumPy (numerics), scipy.optimize.milp (MILP solver, optional)

**Spec:** `docs/superpowers/specs/2026-04-03-node-optimization-design.md`

---

### Task 1: Geometry helpers for node reduction

**Files:**
- Create: `apps/api/src/urbanus_api/core/optimizer/node_reduction.py`
- Test: `apps/api/tests/core/test_node_reduction.py`

- [ ] **Step 1: Write failing tests for geometry helpers**

```python
# tests/core/test_node_reduction.py
"""Tests for node optimization (Phase 1-3)."""

import networkx as nx
import pytest

from urbanus_api.core.optimizer.node_reduction import (
    _direction_angle,
    _slope_break,
    _is_through_pipe,
)


class TestDirectionAngle:
    def test_straight_line_zero_deflection(self):
        """A→B→C in a straight line: deflection = 0."""
        tree = nx.DiGraph()
        tree.add_node("A", x=0.0, y=0.0)
        tree.add_node("B", x=0.0, y=0.001)
        tree.add_node("C", x=0.0, y=0.002)
        assert _direction_angle(tree, "A", "B", "C") < 5.0

    def test_right_angle_90_deflection(self):
        """A→B→C at 90 degrees: deflection = 90."""
        tree = nx.DiGraph()
        tree.add_node("A", x=0.0, y=0.0)
        tree.add_node("B", x=0.0, y=0.001)
        tree.add_node("C", x=0.001, y=0.001)
        angle = _direction_angle(tree, "A", "B", "C")
        assert 85 < angle < 95

    def test_u_turn_180_deflection(self):
        """A→B→C going back: deflection = 180."""
        tree = nx.DiGraph()
        tree.add_node("A", x=0.0, y=0.002)
        tree.add_node("B", x=0.0, y=0.001)
        tree.add_node("C", x=0.0, y=0.002)
        angle = _direction_angle(tree, "A", "B", "C")
        assert angle > 170


class TestSlopeBreak:
    def test_no_break_same_slope(self):
        tree = nx.DiGraph()
        tree.add_node("A", z=10)
        tree.add_node("B", z=9)
        tree.add_node("C", z=8)
        tree.add_edge("A", "B", length_m=50)
        tree.add_edge("B", "C", length_m=50)
        assert _slope_break(tree, "A", "B", "C") < 0.01

    def test_break_different_slopes(self):
        tree = nx.DiGraph()
        tree.add_node("A", z=10)
        tree.add_node("B", z=8)  # steep
        tree.add_node("C", z=7.5)  # gentle
        tree.add_edge("A", "B", length_m=20)
        tree.add_edge("B", "C", length_m=50)
        assert _slope_break(tree, "A", "B", "C") > 0.03


class TestIsThroughPipe:
    def test_straight_through_qualifies(self):
        tree = nx.DiGraph()
        tree.add_node("P", x=0.0, y=0.0, z=10)
        tree.add_node("J", x=0.0, y=0.001, z=9)
        tree.add_node("S", x=0.0, y=0.002, z=8)
        tree.add_edge("P", "J", length_m=40)
        tree.add_edge("J", "S", length_m=40)
        assert _is_through_pipe(tree, "J", "P", "S", max_spacing=100)

    def test_sharp_turn_disqualifies(self):
        tree = nx.DiGraph()
        tree.add_node("P", x=0.0, y=0.0, z=10)
        tree.add_node("J", x=0.0, y=0.001, z=9)
        tree.add_node("S", x=0.001, y=0.0, z=8)  # 90 deg turn
        tree.add_edge("P", "J", length_m=40)
        tree.add_edge("J", "S", length_m=40)
        assert not _is_through_pipe(tree, "J", "P", "S", max_spacing=100)

    def test_too_long_disqualifies(self):
        tree = nx.DiGraph()
        tree.add_node("P", x=0.0, y=0.0, z=10)
        tree.add_node("J", x=0.0, y=0.001, z=9)
        tree.add_node("S", x=0.0, y=0.002, z=8)
        tree.add_edge("P", "J", length_m=60)
        tree.add_edge("J", "S", length_m=60)
        assert not _is_through_pipe(tree, "J", "P", "S", max_spacing=100)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && uv run python -m pytest tests/core/test_node_reduction.py -v`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement geometry helpers**

```python
# apps/api/src/urbanus_api/core/optimizer/node_reduction.py
"""
Otimização de nós da rede de esgoto.

Minimiza o número de PVs (poços de visita) na rede usando:
  Phase 1: Contração gulosa (pass-through + cadeias + junções)
  Phase 2: Refinamento MILP (scipy, opcional)
  Phase 3: Re-enforcement de espaçamento NBR 9649
"""

from __future__ import annotations

import math

import networkx as nx

from urbanus_geo.constants import (
    DIRECTION_CHANGE_THRESHOLD,
    GRADE_BREAK_THRESHOLD,
    MAX_PV_SPACING,
)


def _direction_angle(tree: nx.DiGraph, a: str, b: str, c: str) -> float:
    """Deflection angle at node b between edges a→b and b→c (degrees).

    Returns 0 for a straight line, 180 for a U-turn.
    Uses the internal angle from ``angle_at_node`` and converts to
    deflection = 180 - internal_angle.
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
    """Absolute slope difference (m/m) between edges a→b and b→c."""
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
    """Check if pred→node→succ is a through-pipe (no PV needed).

    A through-pipe has:
    - Deflection angle < DIRECTION_CHANGE_THRESHOLD (45 deg)
    - Slope break < GRADE_BREAK_THRESHOLD (3%)
    - Merged length ≤ max_spacing
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/api && uv run python -m pytest tests/core/test_node_reduction.py -v`
Expected: all 8 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/urbanus_api/core/optimizer/node_reduction.py apps/api/tests/core/test_node_reduction.py
git commit -m "feat: add geometry helpers for node optimization"
```

---

### Task 2: Phase 1 — Greedy contraction (pass-through + junctions)

**Files:**
- Modify: `apps/api/src/urbanus_api/core/optimizer/node_reduction.py`
- Test: `apps/api/tests/core/test_node_reduction.py`

- [ ] **Step 1: Write failing tests for greedy contraction**

```python
# Append to tests/core/test_node_reduction.py
from urbanus_api.core.optimizer.node_reduction import (
    _greedy_contract,
    _simplify_junctions,
)


class TestGreedyContract:
    def test_removes_pass_through_chain(self):
        """A→B→C→D with B,C non-mandatory: all removed."""
        tree = nx.DiGraph()
        tree.add_node("A", x=0.0, y=0.0, z=10, pv_obrigatorio=True)
        tree.add_node("B", x=0.0, y=0.0003, z=9.5)
        tree.add_node("C", x=0.0, y=0.0006, z=9.0)
        tree.add_node("D", x=0.0, y=0.0009, z=8.5, pv_obrigatorio=True)
        tree.add_edge("A", "B", length_m=30)
        tree.add_edge("B", "C", length_m=30)
        tree.add_edge("C", "D", length_m=30)

        _greedy_contract(tree, max_spacing=100)
        assert "B" not in tree
        assert "C" not in tree
        assert tree.has_edge("A", "D")
        assert tree.edges["A", "D"]["length_m"] == 90

    def test_keeps_mandatory_in_chain(self):
        """A→B→C→D with B mandatory: keeps B, removes C."""
        tree = nx.DiGraph()
        tree.add_node("A", x=0.0, y=0.0, z=10, pv_obrigatorio=True)
        tree.add_node("B", x=0.0, y=0.0003, z=9.5, pv_obrigatorio=True)
        tree.add_node("C", x=0.0, y=0.0006, z=9.0)
        tree.add_node("D", x=0.0, y=0.0009, z=8.5, pv_obrigatorio=True)
        tree.add_edge("A", "B", length_m=30)
        tree.add_edge("B", "C", length_m=30)
        tree.add_edge("C", "D", length_m=30)

        _greedy_contract(tree, max_spacing=100)
        assert "B" in tree
        assert "C" not in tree

    def test_respects_max_spacing(self):
        """A→B→C where A-C = 120m > 100m: keeps B."""
        tree = nx.DiGraph()
        tree.add_node("A", x=0.0, y=0.0, z=10, pv_obrigatorio=True)
        tree.add_node("B", x=0.0, y=0.0005, z=9)
        tree.add_node("C", x=0.0, y=0.001, z=8, pv_obrigatorio=True)
        tree.add_edge("A", "B", length_m=60)
        tree.add_edge("B", "C", length_m=60)

        _greedy_contract(tree, max_spacing=100)
        assert "B" in tree


class TestSimplifyJunctions:
    def test_through_pipe_removes_junction(self):
        """Junction with 2-in 2-out where one pair is straight: simplified."""
        tree = nx.DiGraph()
        # North-south through-pipe (straight)
        tree.add_node("N", x=0.0, y=0.001, z=10)
        tree.add_node("J", x=0.0, y=0.0005, z=9)
        tree.add_node("S", x=0.0, y=0.0, z=8)
        # East pipe joins at J
        tree.add_node("E", x=0.001, y=0.0005, z=10)
        tree.add_edge("N", "J", length_m=40)
        tree.add_edge("J", "S", length_m=40)
        tree.add_edge("E", "J", length_m=40)

        _simplify_junctions(tree, max_spacing=100)
        # N→S should be merged (straight through-pipe)
        assert tree.has_edge("N", "S")
        # J might still exist for E→J, or E→J→S rerouted

    def test_keeps_junction_with_all_turns(self):
        """Junction where no pair is straight: kept intact."""
        tree = nx.DiGraph()
        tree.add_node("N", x=0.0, y=0.001, z=10)
        tree.add_node("J", x=0.0, y=0.0, z=9)
        tree.add_node("E", x=0.001, y=0.0, z=8)
        tree.add_node("W", x=-0.001, y=0.0, z=10)
        tree.add_edge("N", "J", length_m=40)
        tree.add_edge("W", "J", length_m=40)
        tree.add_edge("J", "E", length_m=40)

        n_before = tree.number_of_nodes()
        _simplify_junctions(tree, max_spacing=100)
        assert tree.number_of_nodes() == n_before  # No change
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && uv run python -m pytest tests/core/test_node_reduction.py::TestGreedyContract -v`
Expected: FAIL (functions not imported)

- [ ] **Step 3: Implement greedy contraction + junction simplification**

```python
# Append to apps/api/src/urbanus_api/core/optimizer/node_reduction.py

def _merge_edge_pair(
    tree: nx.DiGraph, pred: str, node: str, succ: str,
) -> None:
    """Remove *node* and merge pred→node + node→succ into pred→succ."""
    d1 = tree.edges[pred, node].get("length_m", 0)
    d2 = tree.edges[node, succ].get("length_m", 0)
    e1 = dict(tree.edges[pred, node])
    e2 = dict(tree.edges[node, succ])
    merged = {**e1, **e2, "length_m": d1 + d2}

    tree.remove_edge(pred, node)
    tree.remove_edge(node, succ)

    # If node has no remaining edges, remove it
    if tree.in_degree(node) == 0 and tree.out_degree(node) == 0:
        tree.remove_node(node)

    if not tree.has_edge(pred, succ):
        tree.add_edge(pred, succ, **merged)


def _simplify_junctions(tree: nx.DiGraph, max_spacing: float) -> None:
    """Simplify junction nodes by merging through-pipe pairs.

    At a junction node J, if an incoming edge P→J and outgoing edge J→S
    form a straight-enough through-pipe (angle < 45°, grade break < 3%,
    merged length ≤ max_spacing), merge them into P→S.

    This models pipe crossings at different depths — no manhole needed.
    """
    changed = True
    while changed:
        changed = False
        for node in list(tree.nodes):
            if node not in tree:
                continue
            if tree.nodes[node].get("pv_obrigatorio"):
                continue
            in_deg = tree.in_degree(node)
            out_deg = tree.out_degree(node)
            if in_deg + out_deg < 3:
                continue  # Not a junction

            # Find best through-pipe pair
            best_pair = None
            best_score = -1.0
            for pred in list(tree.predecessors(node)):
                for succ in list(tree.successors(node)):
                    if pred == succ:
                        continue
                    if not _is_through_pipe(tree, node, pred, succ, max_spacing):
                        continue
                    # Score: straighter + shorter = better
                    angle = _direction_angle(tree, pred, node, succ)
                    length = (
                        tree.edges[pred, node].get("length_m", 0)
                        + tree.edges[node, succ].get("length_m", 0)
                    )
                    score = (45.0 - angle) / 45.0 + (max_spacing - length) / max_spacing
                    if score > best_score:
                        best_score = score
                        best_pair = (pred, succ)

            if best_pair:
                _merge_edge_pair(tree, best_pair[0], node, best_pair[1])
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

        # Pass 1: simplify junctions (may create new pass-throughs)
        before = tree.number_of_nodes()
        _simplify_junctions(tree, max_spacing)
        if tree.number_of_nodes() < before:
            changed = True

        # Pass 2: remove pass-through nodes
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/api && uv run python -m pytest tests/core/test_node_reduction.py -v`
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/urbanus_api/core/optimizer/node_reduction.py apps/api/tests/core/test_node_reduction.py
git commit -m "feat: greedy contraction with junction simplification"
```

---

### Task 3: Phase 2 — MILP refinement + Phase 3 — Spacing enforcement

**Files:**
- Modify: `apps/api/src/urbanus_api/core/optimizer/node_reduction.py`
- Test: `apps/api/tests/core/test_node_reduction.py`

- [ ] **Step 1: Write failing tests**

```python
# Append to tests/core/test_node_reduction.py
from urbanus_api.core.optimizer.node_reduction import (
    _enforce_spacing,
    optimize_node_placement,
)


class TestEnforceSpacing:
    def test_long_edge_gets_intermediate_nodes(self):
        """Edge 200m → should get 1 intermediate node."""
        tree = nx.DiGraph()
        tree.add_node("A", x=0.0, y=0.0, z=10, pv_obrigatorio=True)
        tree.add_node("B", x=0.0, y=0.002, z=8, pv_obrigatorio=True)
        tree.add_edge("A", "B", length_m=200)

        _enforce_spacing(tree, max_spacing=100)
        assert tree.number_of_nodes() == 3  # A + intermediate + B
        assert tree.number_of_edges() == 2

    def test_short_edge_unchanged(self):
        """Edge 80m → no intermediate nodes."""
        tree = nx.DiGraph()
        tree.add_node("A", x=0.0, y=0.0, z=10, pv_obrigatorio=True)
        tree.add_node("B", x=0.0, y=0.001, z=9, pv_obrigatorio=True)
        tree.add_edge("A", "B", length_m=80)

        _enforce_spacing(tree, max_spacing=100)
        assert tree.number_of_nodes() == 2

    def test_300m_edge_gets_2_nodes(self):
        """Edge 300m → needs 2 intermediate nodes (3 segments of 100m)."""
        tree = nx.DiGraph()
        tree.add_node("A", x=0.0, y=0.0, z=12, pv_obrigatorio=True)
        tree.add_node("B", x=0.0, y=0.003, z=6, pv_obrigatorio=True)
        tree.add_edge("A", "B", length_m=300)

        _enforce_spacing(tree, max_spacing=100)
        assert tree.number_of_nodes() == 4  # A + 2 intermediates + B


class TestOptimizeNodePlacement:
    def test_full_pipeline_reduces_nodes(self):
        """End-to-end: grid of 9 nodes with 12 edges → reduced significantly."""
        tree = nx.DiGraph()
        # 3x3 grid:  A--B--C
        #            |  |  |
        #            D--E--F
        #            |  |  |
        #            G--H--I (outlet)
        nodes = {
            "A": (0.0, 0.002, 10), "B": (0.001, 0.002, 9), "C": (0.002, 0.002, 8),
            "D": (0.0, 0.001, 9),  "E": (0.001, 0.001, 8), "F": (0.002, 0.001, 7),
            "G": (0.0, 0.0, 8),    "H": (0.001, 0.0, 7),   "I": (0.002, 0.0, 6),
        }
        for nid, (x, y, z) in nodes.items():
            tree.add_node(nid, x=x, y=y, z=z, pv_obrigatorio=(nid == "I"))
        # Edges: all flow toward I (outlet)
        for u, v, length in [
            ("A", "B", 40), ("B", "C", 40),
            ("D", "E", 40), ("E", "F", 40),
            ("G", "H", 40), ("H", "I", 40),
            ("A", "D", 40), ("D", "G", 40),
            ("B", "E", 40), ("E", "H", 40),
            ("C", "F", 40), ("F", "I", 40),
        ]:
            tree.add_edge(u, v, length_m=length)

        before = tree.number_of_nodes()
        optimize_node_placement(tree, max_spacing=100, outlet="I")
        after = tree.number_of_nodes()
        assert after < before
        assert nx.is_directed_acyclic_graph(tree)
        # Outlet must survive
        assert "I" in tree
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && uv run python -m pytest tests/core/test_node_reduction.py::TestEnforceSpacing -v`
Expected: FAIL (functions not found)

- [ ] **Step 3: Implement spacing enforcement + main entry point**

```python
# Append to apps/api/src/urbanus_api/core/optimizer/node_reduction.py

import uuid


def _enforce_spacing(tree: nx.DiGraph, max_spacing: float) -> None:
    """Phase 3: Insert intermediate nodes on edges exceeding max_spacing.

    For each edge longer than max_spacing, inserts the minimum number of
    equally-spaced intermediate nodes with linearly interpolated position
    and elevation.
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


def _milp_refine(tree: nx.DiGraph, max_spacing: float) -> None:
    """Phase 2: MILP refinement of remaining non-mandatory nodes.

    Identifies chains between mandatory nodes and checks if any
    intermediate nodes can be removed while respecting spacing.

    Uses scipy.optimize.milp if available; otherwise skips silently.
    """
    try:
        from scipy.optimize import LinearConstraint, milp
        from scipy.sparse import eye as speye
        import numpy as np
    except ImportError:
        return  # Graceful degradation

    # Collect non-mandatory nodes that are pass-through (1-in, 1-out)
    candidates = []
    for node in tree.nodes:
        if tree.nodes[node].get("pv_obrigatorio"):
            continue
        if tree.in_degree(node) != 1 or tree.out_degree(node) != 1:
            continue
        pred = next(tree.predecessors(node))
        succ = next(tree.successors(node))
        # Check if removal would violate angle/slope constraints
        if _direction_angle(tree, pred, node, succ) >= DIRECTION_CHANGE_THRESHOLD:
            continue
        if _slope_break(tree, pred, node, succ) >= GRADE_BREAK_THRESHOLD:
            continue
        candidates.append(node)

    if not candidates:
        return

    n = len(candidates)
    # Build chain segments: groups of consecutive candidates between mandatory nodes
    # For each chain, the constraint is: sum(x_i) >= ceil(chain_length / max_spacing) - 1

    # Map candidate index
    idx = {node: i for i, node in enumerate(candidates)}

    # Find chains by walking backward/forward from each candidate
    visited: set[str] = set()
    constraints_A = []
    constraints_lb = []

    for node in candidates:
        if node in visited:
            continue
        # Walk backward to find chain start (mandatory node)
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
        # Walk forward to find chain end
        cur = node
        while True:
            succ = next(tree.successors(cur))
            if succ in idx and succ not in visited:
                chain.append(succ)
                visited.add(succ)
                cur = succ
            else:
                break

        # Compute total chain length (from mandatory start to mandatory end)
        chain_start = next(tree.predecessors(chain[0]))
        chain_end = next(tree.successors(chain[-1]))
        total_length = sum(
            tree.edges[chain_start, chain[0]].get("length_m", 0)
            if i == 0
            else tree.edges[chain[i - 1], chain[i]].get("length_m", 0)
            for i in range(len(chain))
        ) + tree.edges[chain[-1], chain_end].get("length_m", 0)

        n_min = max(0, math.ceil(total_length / max_spacing) - 1)

        if n_min > 0:
            row = [0.0] * n
            for c in chain:
                row[idx[c]] = 1.0
            constraints_A.append(row)
            constraints_lb.append(float(n_min))

    # Solve MILP: minimize sum(x_i) subject to chain constraints
    c = np.ones(n)  # Objective: minimize sum
    integrality = np.ones(n)  # All binary
    bounds = LinearConstraint(speye(n), 0, 1)  # 0 <= x_i <= 1

    if constraints_A:
        A = np.array(constraints_A)
        chain_bounds = LinearConstraint(A, constraints_lb, np.full(len(constraints_lb), np.inf))
        result = milp(c, integrality=integrality, constraints=[bounds, chain_bounds])
    else:
        # No chain constraints → can remove all
        result = milp(c, integrality=integrality, constraints=[bounds])

    if not result.success:
        return

    # Remove nodes where x_i = 0
    for i, node in enumerate(candidates):
        if result.x[i] < 0.5 and node in tree:
            if tree.in_degree(node) == 1 and tree.out_degree(node) == 1:
                pred = next(tree.predecessors(node))
                succ = next(tree.successors(node))
                if pred != succ:
                    _merge_edge_pair(tree, pred, node, succ)


def optimize_node_placement(
    tree: nx.DiGraph,
    max_spacing: float = MAX_PV_SPACING,
    outlet: str | None = None,
) -> None:
    """Minimize nodes in the sewer network tree (in-place).

    Phase 1: Greedy contraction (pass-through + chains + junctions)
    Phase 2: MILP refinement (scipy, optional)
    Phase 3: Spacing enforcement (NBR 9649 compliance)

    Args:
        tree: Directed sewer network DAG.
        max_spacing: Maximum distance between consecutive PVs (m).
        outlet: Outlet node ID (always kept).
    """
    # Protect outlet
    if outlet and tree.has_node(outlet):
        tree.nodes[outlet]["pv_obrigatorio"] = True

    # Phase 1: Greedy contraction
    _greedy_contract(tree, max_spacing)

    # Phase 2: MILP refinement
    _milp_refine(tree, max_spacing)

    # Phase 3: Spacing enforcement
    _enforce_spacing(tree, max_spacing)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/api && uv run python -m pytest tests/core/test_node_reduction.py -v`
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/urbanus_api/core/optimizer/node_reduction.py apps/api/tests/core/test_node_reduction.py
git commit -m "feat: MILP refinement + spacing enforcement for node optimization"
```

---

### Task 4: Integration — wire into pipeline + add scipy dependency

**Files:**
- Modify: `apps/api/src/urbanus_api/main.py:275-280`
- Modify: `apps/api/pyproject.toml`
- Modify: `apps/api/src/urbanus_api/core/graph/coverage.py` (remove old `reduce_pass_through_nodes`)

- [ ] **Step 1: Add scipy as optional dependency**

In `apps/api/pyproject.toml`, change:
```toml
[project.optional-dependencies]
test = ["pytest>=8.0"]
```
to:
```toml
[project.optional-dependencies]
test = ["pytest>=8.0"]
optimization = ["scipy>=1.9"]
```

- [ ] **Step 2: Install scipy**

Run: `cd /Users/erickpatrickbarcelos/codes/URBANUS && uv sync`

- [ ] **Step 3: Replace reduce_pass_through_nodes with optimize_node_placement in main.py**

In `apps/api/src/urbanus_api/main.py`, replace the import:
```python
from urbanus_api.core.graph.coverage import ensure_full_coverage, reduce_pass_through_nodes
```
with:
```python
from urbanus_api.core.graph.coverage import ensure_full_coverage
from urbanus_api.core.optimizer.node_reduction import optimize_node_placement
```

And replace the step 7.8 section (lines 275-280):
```python
    # Etapa 7.8: Minimize nodes — remove non-mandatory pass-through nodes.
    # Degree-2 nodes (1 in, 1 out) that aren't mandatory PVs are just pipe
    # running straight through — no manhole needed.  Merge their edges as
    # long as the result doesn't exceed MAX_PV_SPACING.
    from urbanus_geo.constants import MAX_PV_SPACING
    reduce_pass_through_nodes(tree, max_edge_length=MAX_PV_SPACING)
```
with:
```python
    # Etapa 7.8: Optimize node placement — minimize PVs using greedy
    # contraction with junction simplification + MILP refinement.
    optimize_node_placement(tree, outlet=outlet)
```

- [ ] **Step 4: Run full test suite**

Run: `cd apps/api && uv run python -m pytest tests/ -v`
Expected: ALL tests PASS (existing + new)

- [ ] **Step 5: Commit**

```bash
git add apps/api/pyproject.toml apps/api/src/urbanus_api/main.py apps/api/src/urbanus_api/core/graph/coverage.py
git commit -m "feat: integrate node optimization into pipeline, add scipy"
```

---

### Task 5: Clean up — remove old reduce_pass_through_nodes, update tests

**Files:**
- Modify: `apps/api/src/urbanus_api/core/graph/coverage.py` (remove function)
- Modify: `apps/api/tests/core/test_cycle_guards.py` (update tests that used the old function)

- [ ] **Step 1: Remove reduce_pass_through_nodes from coverage.py**

Delete the entire `reduce_pass_through_nodes` function (lines 90-137 in coverage.py). Keep the import of `reduce_pass_through_nodes` removed from `__init__` or any other module if referenced.

- [ ] **Step 2: Update test_cycle_guards.py**

Replace `TestReducePassThroughNodes` class — these tests should now use `optimize_node_placement` or `_greedy_contract` instead:

```python
class TestReducePassThroughNodes:
    def test_removes_simple_pass_through(self):
        """A→B→C with B non-mandatory: B removed, A→C created."""
        from urbanus_api.core.optimizer.node_reduction import _greedy_contract

        tree = nx.DiGraph()
        tree.add_node("A", x=0.0, y=0.0, z=10, pv_obrigatorio=True)
        tree.add_node("B", x=0.0, y=0.0005, z=9)
        tree.add_node("C", x=0.0, y=0.001, z=8, pv_obrigatorio=True)
        tree.add_edge("A", "B", length_m=40)
        tree.add_edge("B", "C", length_m=40)

        _greedy_contract(tree, max_spacing=100)
        assert "B" not in tree
        assert tree.has_edge("A", "C")
        assert tree.edges["A", "C"]["length_m"] == 80

    def test_preserves_mandatory_node(self):
        from urbanus_api.core.optimizer.node_reduction import _greedy_contract

        tree = nx.DiGraph()
        tree.add_node("A", x=0.0, y=0.0, z=10, pv_obrigatorio=True)
        tree.add_node("B", x=0.0, y=0.0005, z=9, pv_obrigatorio=True)
        tree.add_node("C", x=0.0, y=0.001, z=8, pv_obrigatorio=True)
        tree.add_edge("A", "B", length_m=40)
        tree.add_edge("B", "C", length_m=40)

        _greedy_contract(tree, max_spacing=100)
        assert "B" in tree

    def test_preserves_junction(self):
        from urbanus_api.core.optimizer.node_reduction import _greedy_contract

        tree = nx.DiGraph()
        for nid, z in [("A", 10), ("B", 9), ("C", 8), ("D", 7)]:
            tree.add_node(nid, x=0.0, y=0.0, z=z)
        tree.add_edge("A", "C", length_m=40)
        tree.add_edge("B", "C", length_m=40)
        tree.add_edge("C", "D", length_m=40)

        _greedy_contract(tree, max_spacing=100)
        assert "C" in tree  # 2-in + 1-out = real junction

    def test_respects_max_edge_length(self):
        from urbanus_api.core.optimizer.node_reduction import _greedy_contract

        tree = nx.DiGraph()
        tree.add_node("A", x=0.0, y=0.0, z=10, pv_obrigatorio=True)
        tree.add_node("B", x=0.0, y=0.0005, z=9)
        tree.add_node("C", x=0.0, y=0.001, z=8, pv_obrigatorio=True)
        tree.add_edge("A", "B", length_m=60)
        tree.add_edge("B", "C", length_m=60)

        _greedy_contract(tree, max_spacing=100)
        assert "B" in tree  # 60+60=120 > 100

    def test_chain_reduction(self):
        from urbanus_api.core.optimizer.node_reduction import _greedy_contract

        tree = nx.DiGraph()
        tree.add_node("A", x=0.0, y=0.0, z=10, pv_obrigatorio=True)
        tree.add_node("B", x=0.0, y=0.0002, z=9)
        tree.add_node("C", x=0.0, y=0.0004, z=8)
        tree.add_node("D", x=0.0, y=0.0006, z=7)
        tree.add_node("E", x=0.0, y=0.0008, z=6, pv_obrigatorio=True)
        tree.add_edge("A", "B", length_m=20)
        tree.add_edge("B", "C", length_m=20)
        tree.add_edge("C", "D", length_m=20)
        tree.add_edge("D", "E", length_m=20)

        _greedy_contract(tree, max_spacing=100)
        assert tree.has_edge("A", "E")
        assert tree.number_of_nodes() == 2
```

- [ ] **Step 3: Run full test suite**

Run: `cd apps/api && uv run python -m pytest tests/ -v`
Expected: ALL tests PASS

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/urbanus_api/core/graph/coverage.py apps/api/tests/core/test_cycle_guards.py
git commit -m "refactor: remove old reduce_pass_through_nodes, update tests"
```
