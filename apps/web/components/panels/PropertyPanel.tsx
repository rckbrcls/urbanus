'use client';

import { useGraphStore } from '@/stores/graphStore';
import type { NetworkNode, NetworkEdge } from '@/lib/graph/types';

/**
 * Inspector panel for the selected node or edge.
 * Shows coordinates, elevation and slope details.
 */
export default function PropertyPanel() {
  const selectedNodeIds = useGraphStore((s) => s.selectedNodeIds);
  const selectedEdgeIds = useGraphStore((s) => s.selectedEdgeIds);
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);

  // Single node selected
  if (selectedNodeIds.length === 1) {
    const node = nodes[selectedNodeIds[0]];
    if (!node) return null;
    return <NodeProperties node={node} />;
  }

  // Single edge selected
  if (selectedEdgeIds.length === 1) {
    const edge = edges[selectedEdgeIds[0]];
    if (!edge) return null;
    const source = nodes[edge.sourceId];
    const target = nodes[edge.targetId];
    return <EdgeProperties edge={edge} source={source} target={target} />;
  }

  // Multi-selection
  if (selectedNodeIds.length > 1) {
    return (
      <div className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Multi-selection
        </h4>
        <p className="text-xs text-zinc-600 dark:text-zinc-400">
          {selectedNodeIds.length} nodes selected
        </p>
      </div>
    );
  }

  return (
    <p className="text-xs text-zinc-400 dark:text-zinc-500 italic">
      Select a node or edge to inspect
    </p>
  );
}

function NodeProperties({ node }: { node: NetworkNode }) {
  const [lng, lat] = node.coordinates;

  return (
    <div className="space-y-3">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
        Node Properties
      </h4>

      <div className="space-y-2">
        <Row label="ID" value={node.id.slice(0, 12)} />
        {node.properties.streetName && <Row label="Street" value={node.properties.streetName} />}
        <Row label="Latitude" value={lat.toFixed(6)} />
        <Row label="Longitude" value={lng.toFixed(6)} />
        <Row label="Elevation" value={node.properties.elevation?.toFixed(2) ?? 'N/A'} unit="m" />
        {node.properties.invertElevation != null && (
          <Row label="Invert Elev." value={node.properties.invertElevation.toFixed(2)} unit="m" />
        )}
        {node.properties.depth != null && (
          <Row label="Depth" value={node.properties.depth.toFixed(2)} unit="m" />
        )}
        <Row label="Degree" value={String(node.properties.degree)} />
        <Row label="Edges" value={String(node.properties.edgeIds.length)} />
        {node.properties.classification && (
          <Row label="Classification" value={node.properties.classification} />
        )}
      </div>
    </div>
  );
}

function EdgeProperties({
  edge,
  source,
  target,
}: {
  edge: NetworkEdge;
  source?: NetworkNode;
  target?: NetworkNode;
}) {
  return (
    <div className="space-y-3">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
        Edge Properties
      </h4>

      <div className="space-y-2">
        <Row label="ID" value={edge.id.slice(0, 12)} />
        {edge.properties.streetName && <Row label="Street" value={edge.properties.streetName} />}
        <Row label="Length" value={edge.properties.length.toFixed(1)} unit="m" />
        <Row
          label="Slope"
          value={edge.properties.slope !== null ? `${(edge.properties.slope * 100).toFixed(3)}` : 'N/A'}
          unit="%"
        />
        {edge.properties.flowDirection && edge.properties.flowDirection !== 'unknown' && (
          <Row label="Flow" value={edge.properties.flowDirection} />
        )}
        {source && (
          <Row
            label="Source Elev."
            value={source.properties.elevation?.toFixed(2) ?? 'N/A'}
            unit="m"
          />
        )}
        {target && (
          <Row
            label="Target Elev."
            value={target.properties.elevation?.toFixed(2) ?? 'N/A'}
            unit="m"
          />
        )}
      </div>
    </div>
  );
}

function Row({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-zinc-500 dark:text-zinc-400">{label}</span>
      <span className="font-mono text-zinc-900 dark:text-zinc-100">
        {value}
        {unit && <span className="ml-0.5 text-zinc-400">{unit}</span>}
      </span>
    </div>
  );
}
