# Sewer Network Node Optimization

## Problem

After the RSPH routing + full coverage pipeline, the sewer network has too many nodes (manholes/PVs). Every node is a physical structure that costs R$5-15k to build. Many nodes are unnecessary:

- **Pass-through nodes** (degree 2, 1-in 1-out): pipe runs straight through, no junction needed
- **Grid intersection nodes** (degree 3+): two pipes cross at an intersection but don't need to connect — they can cross at different depths without a PV

The goal is to minimize the number of PVs while maintaining full street coverage and NBR 9649 compliance.

## Solution: Two-Phase Optimization

### Phase 1 — Greedy Graph Contraction

Three operations applied iteratively until convergence:

#### 1a) Pass-Through Contraction

Already exists as `reduce_pass_through_nodes`. Merges nodes with exactly 1 in-edge and 1 out-edge when merged edge length <= MAX_PV_SPACING (100m).

No changes needed — kept as-is.

#### 1b) Chain Contraction

Detects chains of consecutive non-mandatory degree-2 nodes and contracts them as a group. More efficient than iterative single-node contraction.

Example: A(mandatory) → B → C → D → E(mandatory), total length 80m
- Contract entire chain at once: A → E with length 80m
- If total > MAX_PV_SPACING: keep minimum intermediate nodes at equal intervals

#### 1c) Junction Simplification (key innovation)

At a junction node J with degree >= 3, identifies "through-pipe" pairs:

```
        P1                    P1
        |                      \
  P2 -> J -> S1    =>    P2 -----> S1
        |                      /
        S2                    S2
```

A pair (in-edge P→J, out-edge J→S) qualifies as "through-pipe" when:
- Direction angle P→J→S < 45 degrees (pipe runs roughly straight)
- Grade break between P→J and J→S < 3%
- Merged length P→S <= MAX_PV_SPACING

When a through-pipe is identified:
1. Merge P→J and J→S into P→S (bypass the junction)
2. If J's remaining degree becomes 2 (1-in, 1-out): apply pass-through contraction
3. If J's remaining degree becomes 0: remove J entirely

This models real engineering practice: two sewer pipes can cross at an intersection at different depths without a connecting manhole.

#### Scoring Function

Each candidate removal is scored by:

```python
score = C_PV - w_slope * slope_penalty - w_angle * angle_penalty - w_spacing * spacing_penalty
```

Where:
- `C_PV` = 8000 (fixed PV construction cost in R$, normalized)
- `slope_penalty` = abs(slope_edge1 - slope_edge2) / GRADE_BREAK_THRESHOLD
- `angle_penalty` = deflection_angle / DIRECTION_CHANGE_THRESHOLD
- `spacing_penalty` = merged_length / MAX_PV_SPACING (approaches 1.0 near limit)
- Weights: w_slope=2000, w_angle=2000, w_spacing=4000

Nodes with highest score are removed first (max-heap).

#### Mandatory Node Rules

A node is mandatory (never removed) when ANY of:
- `pv_obrigatorio == True`
- Is the outlet node
- Has 2+ incoming edges that can't be merged (different directions, >45 degrees apart)
- Has direction change > DIRECTION_CHANGE_THRESHOLD after potential merge
- Has grade break > GRADE_BREAK_THRESHOLD after potential merge

### Phase 2 — MILP Refinement

After greedy contraction, formulates a small Mixed Integer Linear Program to verify optimality and find any remaining improvements.

#### Variables

- x_i in {0, 1} for each non-mandatory node remaining after Phase 1

#### Objective

Minimize sum(x_i) — minimize total number of optional nodes kept.

#### Constraints

For each maximal path segment between consecutive mandatory nodes M_a and M_b:
- Let d = total distance from M_a to M_b along the path
- Let n_min = ceil(d / MAX_PV_SPACING) - 1 (minimum intermediate nodes needed)
- sum(x_i for i on path M_a..M_b) >= n_min

Additional:
- For any candidate removal that would cause direction change > 45 degrees: x_i = 1
- For any candidate removal that would cause grade break > 3%: x_i = 1

#### Solver

Uses `scipy.optimize.milp` (available since scipy 1.9). If scipy is not installed, Phase 2 is skipped gracefully — the greedy result from Phase 1 is used as-is.

### Phase 3 — Spacing Enforcement

For each edge in the result with length > MAX_PV_SPACING:
1. Compute n_nodes = ceil(length / MAX_PV_SPACING) - 1
2. Insert n_nodes intermediate nodes at equal intervals
3. Interpolate elevation linearly between endpoints
4. Mark new nodes as VERDE (intermediate, not mandatory)

This guarantees NBR 9649 spacing compliance.

## Constraints Verified

| Constraint (NBR 9649) | How Verified |
|------------------------|-------------|
| Max PV spacing 100m | Phase 3 enforcement |
| Min slope I_min = 0.0055*Q^-0.47 | Checked during junction simplification |
| Direction change > 45 deg needs PV | Mandatory node rule |
| Grade break > 3% needs PV | Mandatory node rule |
| Max velocity 5 m/s | Verified in dimensioning (Step 8) |
| Coverage (every street has pipe) | ensure_full_coverage runs before optimization |

## New Module

**File:** `apps/api/src/urbanus_api/core/optimizer/node_reduction.py`

**Public API:**
```python
def optimize_node_placement(
    tree: nx.DiGraph,
    max_spacing: float = MAX_PV_SPACING,
    outlet: str | None = None,
) -> None:
    """Minimize nodes in the sewer network tree (in-place).
    
    Phase 1: Greedy contraction (pass-through + chains + junctions)
    Phase 2: MILP refinement (scipy, optional)
    Phase 3: Spacing enforcement
    """
```

**Internal functions:**
- `_greedy_contract(tree, outlet, max_spacing)` — Phase 1
- `_simplify_junctions(tree, max_spacing)` — Phase 1c specifically
- `_compute_removal_score(tree, node)` — Scoring function
- `_milp_refine(tree, max_spacing)` — Phase 2
- `_enforce_spacing(tree, max_spacing)` — Phase 3
- `_is_through_pipe(tree, node, pred, succ)` — Checks if pred→node→succ is a through-pipe
- `_direction_angle(tree, a, b, c)` — Computes direction change at node b
- `_slope_between(tree, u, v)` — Computes terrain slope of an edge

## Integration

In `main.py`, replace:
```python
from urbanus_api.core.graph.coverage import reduce_pass_through_nodes
...
reduce_pass_through_nodes(tree, max_edge_length=MAX_PV_SPACING)
```

With:
```python
from urbanus_api.core.optimizer.node_reduction import optimize_node_placement
...
optimize_node_placement(tree, max_spacing=MAX_PV_SPACING, outlet=outlet)
```

## Dependency

Add scipy as optional dependency in `apps/api/pyproject.toml`:
```toml
[project.optional-dependencies]
optimization = ["scipy>=1.9"]
```

The MILP phase gracefully degrades if scipy is not installed.

## Expected Impact

For a typical grid neighborhood (like the user's screenshot):
- Before: ~200-300 nodes (every intersection + subdivision nodes)
- After Phase 1 (greedy): ~60-100 nodes (mandatory + spacing-needed only)
- After Phase 2 (MILP): ~55-95 nodes (marginal improvement)
- After Phase 3 (spacing): ~60-100 nodes (adds back a few for spacing)

Net reduction: 60-70% fewer nodes.
