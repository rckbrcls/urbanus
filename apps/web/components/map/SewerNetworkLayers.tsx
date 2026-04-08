'use client';

import { useMemo } from 'react';
import { Source, Layer } from 'react-map-gl/maplibre';
import type { SewerNetwork } from '@/types/sewer';
import type { CircleLayerSpecification, LineLayerSpecification, SymbolLayerSpecification } from 'maplibre-gl';
import FlowArrows from './FlowArrows';
import {
  DEFAULT_EDGE_COLOR,
  getElevationColor,
  getElevationLabel,
  SEWER_NODE_RADIUS_EXPRESSION,
} from '@/lib/map/layers';
import { HIGHWAY_COLORS } from '@/features/map/constants';

export type SewerViewMode = 'default' | 'elevation' | 'streets';

interface SewerNetworkLayersProps {
  network: SewerNetwork;
  viewMode?: SewerViewMode;
  elevationRange?: { min: number; max: number } | null;
  selectedNodeId?: string | null;
  /** When true, only renders flow arrows — nodes/edges are handled by GraphLayers */
  overlayOnly?: boolean;
  /** Uses the live editor geometry so flow arrows track node drags immediately. */
  edgeGeometryOverride?: GeoJSON.FeatureCollection | null;
}

/** Map pipe diameter to line width */
function diameterToWidth(dn: number): number {
  if (dn <= 150) return 3;
  if (dn <= 300) return 5;
  if (dn <= 500) return 7;
  return 9;
}

/** Map pipe diameter to color (blue gradient — thicker = darker, more saturated) */
function diameterToColor(dn: number): string {
  if (dn <= 150) return '#42a5f5';
  if (dn <= 200) return '#2196f3';
  if (dn <= 300) return '#1976d2';
  if (dn <= 500) return '#1565c0';
  return '#0d47a1';
}

function highwayToColor(highway: string | null | undefined): string {
  if (!highway) return HIGHWAY_COLORS.default;
  return HIGHWAY_COLORS[highway] ?? HIGHWAY_COLORS.default;
}

/** Normalize elevation to 0-1 range. Returns -1 for null/missing. */
function normalizeElevation(
  elevation: number | null | undefined,
  min: number,
  range: number,
): number {
  if (elevation == null) return -1;
  return range === 0 ? 0 : (elevation - min) / range;
}

export default function SewerNetworkLayers({
  network,
  viewMode = 'default',
  elevationRange,
  selectedNodeId,
  overlayOnly = false,
  edgeGeometryOverride = null,
}: SewerNetworkLayersProps) {
  const isElevation = viewMode === 'elevation';
  const range = elevationRange
    ? elevationRange.max - elevationRange.min || 1
    : 1;
  const min = elevationRange?.min ?? 0;

  const nodesGeoJSON = useMemo(() => {
    if (overlayOnly) {
      return null;
    }

    const nodeFeatures: GeoJSON.Feature[] = network.nodes.map((n) => {
      const elevationNormalized = normalizeElevation(n.elevation, min, range);

      return {
        type: 'Feature',
        id: n.id,
        geometry: { type: 'Point', coordinates: [n.lng, n.lat] },
        properties: {
          id: n.id,
          node_type: n.node_type ?? 'OTHER',
          accessory_type: n.accessory_type ?? '',
          elevation: n.elevation,
          elevation_normalized: elevationNormalized,
          elevationColor: getElevationColor(elevationNormalized),
          elevationLabel: getElevationLabel(n.elevation),
          pv_obrigatorio: n.pv_obrigatorio,
          is_collection_point: n.is_collection_point ?? false,
          is_selected: n.id === selectedNodeId,
          color: n.is_collection_point ? '#06b6d4' : '#6b7280',
        },
      };
    });

    return { type: 'FeatureCollection' as const, features: nodeFeatures };
  }, [network.nodes, min, range, selectedNodeId, overlayOnly]);

  const edgesGeoJSON = useMemo(() => {
    const nodeLookup = new Map(network.nodes.map((node) => [node.id, node]));
    const processedEdgeLookup = new Map(network.edges.map((edge) => [edge.id, edge]));
    const pipeLookup = new Map(network.pipes.map((pipe) => [pipe.edge_id, pipe]));

    const sourceFeatures = edgeGeometryOverride?.features ?? network.edges.map((edge) => {
      const sourceNode = nodeLookup.get(edge.source_node_id);
      const targetNode = nodeLookup.get(edge.target_node_id);

      return {
        type: 'Feature' as const,
        id: edge.id,
        properties: {
          id: edge.id,
          sourceId: edge.source_node_id,
          targetId: edge.target_node_id,
          highway: edge.highway,
        },
        geometry: {
          type: 'LineString' as const,
          coordinates: [
            [sourceNode?.lng ?? 0, sourceNode?.lat ?? 0],
            ...(edge.waypoints ?? []),
            [targetNode?.lng ?? 0, targetNode?.lat ?? 0],
          ],
        },
      };
    });

    const edgeFeatures: GeoJSON.Feature[] = [];

    for (const feature of sourceFeatures) {
      if (feature.geometry?.type !== 'LineString') {
        continue;
      }

      const edgeId = feature.id ?? feature.properties?.id;
      if (edgeId == null) {
        continue;
      }

      const id = String(edgeId);
      const processedEdge = processedEdgeLookup.get(id);
      const sourceId = processedEdge?.source_node_id ?? feature.properties?.sourceId;
      const targetId = processedEdge?.target_node_id ?? feature.properties?.targetId;
      const sourceNode = sourceId ? nodeLookup.get(String(sourceId)) : undefined;
      const targetNode = targetId ? nodeLookup.get(String(targetId)) : undefined;
      const pipe = pipeLookup.get(id)
        ?? (processedEdge
          ? pipeLookup.get(`${processedEdge.source_node_id}->${processedEdge.target_node_id}`)
          : undefined);

      let avgElevNorm = -1;
      if (sourceNode?.elevation != null && targetNode?.elevation != null) {
        avgElevNorm = normalizeElevation((sourceNode.elevation + targetNode.elevation) / 2, min, range);
      } else if (sourceNode?.elevation != null) {
        avgElevNorm = normalizeElevation(sourceNode.elevation, min, range);
      } else if (targetNode?.elevation != null) {
        avgElevNorm = normalizeElevation(targetNode.elevation, min, range);
      }

      const diameterMm =
        pipe?.diameter_mm
        ?? (typeof feature.properties?.diameter === 'number' ? feature.properties.diameter : 150);
      const highway = processedEdge?.highway ?? feature.properties?.highway;
      const arrowColor = isElevation
        ? getElevationColor(avgElevNorm)
        : viewMode === 'streets'
          ? highwayToColor(highway)
          : DEFAULT_EDGE_COLOR;

      edgeFeatures.push({
        type: 'Feature',
        id,
        geometry: {
          type: 'LineString',
          coordinates: feature.geometry.coordinates,
        },
        properties: {
          id,
          sourceId: sourceId ?? null,
          targetId: targetId ?? null,
          diameter_mm: diameterMm,
          is_pressurized: pipe?.is_pressurized ?? false,
          width: diameterToWidth(diameterMm),
          color: pipe?.is_pressurized ? '#ff5722' : diameterToColor(diameterMm),
          slope: processedEdge?.slope ?? feature.properties?.slope ?? null,
          avg_elevation_normalized: avgElevNorm,
          elevationColor: getElevationColor(avgElevNorm),
          arrowColor,
        },
      });
    }

    return { type: 'FeatureCollection' as const, features: edgeFeatures };
  }, [edgeGeometryOverride, isElevation, min, network.edges, network.nodes, network.pipes, range, viewMode]);

  // ============ PAINT OBJECTS ============

  const pipesPaint: LineLayerSpecification['paint'] = isElevation
    ? {
        'line-color': ['get', 'elevationColor'] as unknown as string,
        'line-width': ['get', 'width'] as unknown as number,
        'line-opacity': 0.95,
      }
    : {
        'line-color': ['get', 'color'],
        'line-width': ['get', 'width'],
        'line-opacity': 0.95,
      };

  const nodesPaint: CircleLayerSpecification['paint'] = isElevation
    ? {
        'circle-radius': SEWER_NODE_RADIUS_EXPRESSION,
        'circle-color': ['get', 'elevationColor'] as unknown as string,
        'circle-stroke-width': 1.5,
        'circle-stroke-color': [
          'case',
          ['==', ['get', 'is_selected'], true], '#ff6f00',
          ['==', ['get', 'is_collection_point'], true], '#004d40',
          '#ffffff',
        ] as unknown as string,
      }
    : {
        'circle-radius': SEWER_NODE_RADIUS_EXPRESSION,
        'circle-color': [
          'case',
          ['==', ['get', 'is_selected'], true], '#ffab00',
          ['get', 'color'],
        ] as unknown as string,
        'circle-stroke-width': [
          'case',
          ['==', ['get', 'is_selected'], true], 3,
          ['boolean', ['feature-state', 'hovered'], false], 3,
          ['==', ['get', 'is_collection_point'], true], 3,
          1.5,
        ] as unknown as number,
        'circle-stroke-color': [
          'case',
          ['==', ['get', 'is_selected'], true], '#ff6f00',
          ['==', ['get', 'is_collection_point'], true], '#004d40',
          '#ffffff',
        ] as unknown as string,
      };

  const elevationLabelLayout: SymbolLayerSpecification['layout'] = {
    'text-field': ['get', 'elevationLabel'] as unknown as string,
    'text-size': 10,
    'text-offset': ['literal', [0, 1.5]] as unknown as [number, number],
    'text-allow-overlap': false,
    'text-optional': true,
  };

  const elevationLabelPaint: SymbolLayerSpecification['paint'] = {
    'text-color': '#1e293b',
    'text-halo-color': '#ffffff',
    'text-halo-width': 1.5,
  };

  if (overlayOnly) {
    // Only render flow arrows — nodes/edges are handled by GraphLayers
    return <FlowArrows edgesGeoJSON={edgesGeoJSON} />;
  }

  return (
    <>
      {/* Pipe edges */}
      <Source id="sewer-edges" type="geojson" data={edgesGeoJSON} promoteId="id">
        <Layer id="sewer-edges-layer" type="line" paint={pipesPaint} layout={{ 'line-cap': 'round', 'line-join': 'round' }} />
      </Source>

      {/* Sewer nodes */}
      <Source id="sewer-nodes" type="geojson" data={nodesGeoJSON ?? { type: 'FeatureCollection', features: [] }} promoteId="id">
        <Layer id="sewer-nodes-layer" type="circle" paint={nodesPaint} />

        {/* Elevation labels — only in elevation mode */}
        {isElevation && (
          <Layer
            id="sewer-elevation-labels"
            type="symbol"
            layout={elevationLabelLayout}
            paint={elevationLabelPaint}
          />
        )}
      </Source>

      {/* Flow direction arrows (gravity-based from RSPH routing) */}
      <FlowArrows edgesGeoJSON={edgesGeoJSON} />
    </>
  );
}
