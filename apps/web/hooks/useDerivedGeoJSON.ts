/**
 * Derives GeoJSON FeatureCollections from the graphStore for MapLibre layers.
 *
 * Uses granular selectors so re-renders only happen when nodes/edges actually change.
 */

import { useMemo } from 'react';
import { useGraphStore } from '@/stores/graphStore';
import { networkGraphToGeoJSON } from '@/lib/graph/serialization';

export function useDerivedGeoJSON() {
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);

  const { nodesFC, edgesFC } = useMemo(
    () => networkGraphToGeoJSON({ nodes, edges }),
    [nodes, edges],
  );

  return { nodesGeoJSON: nodesFC, edgesGeoJSON: edgesFC };
}
