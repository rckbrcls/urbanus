'use client';

import { useMemo } from 'react';
import { Source, Layer } from 'react-map-gl/maplibre';
import type { SewerNetwork } from '@/types/sewer';
import type { CircleLayerSpecification, LineLayerSpecification } from 'maplibre-gl';

interface SewerNetworkLayersProps {
  network: SewerNetwork;
}

const NODE_COLORS: Record<string, string> = {
  ROSA: '#e91e63',
  VERDE: '#4caf50',
  AMARELO: '#ffc107',
  AZUL_ESCURO: '#1565c0',
};

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

export default function SewerNetworkLayers({ network }: SewerNetworkLayersProps) {
  const { nodesGeoJSON, edgesGeoJSON } = useMemo(() => {
    // Build pipe lookup
    const pipeLookup = new Map(network.pipes.map((p) => [p.edge_id, p]));

    const nodeFeatures: GeoJSON.Feature[] = network.nodes.map((n) => ({
      type: 'Feature',
      id: n.id,
      geometry: { type: 'Point', coordinates: [n.lng, n.lat] },
      properties: {
        id: n.id,
        node_type: n.node_type ?? 'OTHER',
        accessory_type: n.accessory_type ?? '',
        elevation: n.elevation,
        pv_obrigatorio: n.pv_obrigatorio,
        color: NODE_COLORS[n.node_type ?? ''] ?? '#9e9e9e',
      },
    }));

    const edgeFeatures: GeoJSON.Feature[] = network.edges.map((e) => {
      const src = network.nodes.find((n) => n.id === e.source_node_id);
      const tgt = network.nodes.find((n) => n.id === e.target_node_id);
      const pipe = pipeLookup.get(e.id) ?? pipeLookup.get(`${e.source_node_id}->${e.target_node_id}`);

      return {
        type: 'Feature',
        id: e.id,
        geometry: {
          type: 'LineString',
          coordinates: [
            [src?.lng ?? 0, src?.lat ?? 0],
            [tgt?.lng ?? 0, tgt?.lat ?? 0],
          ],
        },
        properties: {
          id: e.id,
          diameter_mm: pipe?.diameter_mm ?? 150,
          is_pressurized: pipe?.is_pressurized ?? false,
          width: diameterToWidth(pipe?.diameter_mm ?? 150),
          color: pipe?.is_pressurized ? '#ff5722' : diameterToColor(pipe?.diameter_mm ?? 150),
          slope: e.slope,
        },
      };
    });

    return {
      nodesGeoJSON: { type: 'FeatureCollection' as const, features: nodeFeatures },
      edgesGeoJSON: { type: 'FeatureCollection' as const, features: edgeFeatures },
    };
  }, [network]);

  const pipesPaint: LineLayerSpecification['paint'] = {
    'line-color': ['get', 'color'],
    'line-width': ['get', 'width'],
    'line-opacity': 0.95,
  };

  const nodesPaint: CircleLayerSpecification['paint'] = {
    'circle-radius': 6,
    'circle-color': ['get', 'color'],
    'circle-stroke-width': 1.5,
    'circle-stroke-color': '#ffffff',
  };

  return (
    <>
      {/* Pipe edges */}
      <Source id="sewer-edges" type="geojson" data={edgesGeoJSON} promoteId="id">
        <Layer id="sewer-edges-layer" type="line" paint={pipesPaint} layout={{ 'line-cap': 'round', 'line-join': 'round' }} />
      </Source>

      {/* Sewer nodes */}
      <Source id="sewer-nodes" type="geojson" data={nodesGeoJSON} promoteId="id">
        <Layer id="sewer-nodes-layer" type="circle" paint={nodesPaint} />
      </Source>
    </>
  );
}
