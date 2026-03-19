'use client';

import { useRef, useCallback } from 'react';
import MapGL, { type MapRef } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';

import { useMapStyle } from '@/hooks/useMapStyle';
import { useGraphStore } from '@/stores/graphStore';
import { useDerivedGeoJSON } from '@/hooks/useDerivedGeoJSON';
import { useGraphEditor } from '@/hooks/useGraphEditor';

import GraphLayers from './GraphLayers';
import GhostEdge from './GhostEdge';
import FlowArrows from './FlowArrows';
import SewerNetworkLayers from './SewerNetworkLayers';
import type { SewerNetwork } from '@/types/sewer';

interface GraphMapViewProps {
  center: [number, number];
  zoom: number;
  bounds?: {
    southWest: { lat: number; lng: number };
    northEast: { lat: number; lng: number };
  };
  streetFeatures?: GeoJSON.FeatureCollection | null;
  sewerNetwork?: SewerNetwork | null;
}

/**
 * Main map component for the graph editor.
 * Renders graph nodes/edges via GraphLayers and delegates interactions to useGraphEditor.
 */
export default function GraphMapView({ center, zoom, bounds, streetFeatures, sewerNetwork }: GraphMapViewProps) {
  const mapRef = useRef<MapRef>(null);
  const editingMode = useGraphStore((s) => s.editingMode);

  const { nodesGeoJSON, edgesGeoJSON } = useDerivedGeoJSON();

  const {
    isDragging,
    ghostEdgeFrom,
    ghostEdgeTo,
    handleClick,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
  } = useGraphEditor({ mapRef, streetFeatures });

  const mapStyle = useMapStyle('minimal');

  const onMapLoad = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map || !bounds) return;

    map.fitBounds(
      [
        [bounds.southWest.lng, bounds.southWest.lat],
        [bounds.northEast.lng, bounds.northEast.lat],
      ],
      { padding: 40, animate: false },
    );
  }, [bounds]);

  return (
    <MapGL
      ref={mapRef}
      initialViewState={{
        latitude: center[0],
        longitude: center[1],
        zoom,
      }}
      mapStyle={mapStyle}
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onLoad={onMapLoad}
      dragPan={!isDragging}
      interactiveLayerIds={['graph-nodes-layer', 'graph-edges-layer']}
      style={{ width: '100%', height: '100%' }}
      attributionControl={{ compact: true }}
      cursor={
        editingMode === 'add-node'
          ? 'crosshair'
          : editingMode === 'delete'
            ? 'crosshair'
            : isDragging
              ? 'grabbing'
              : undefined
      }
    >
      {/* Graph layers */}
      <GraphLayers nodesGeoJSON={nodesGeoJSON} edgesGeoJSON={edgesGeoJSON} />

      {/* Flow direction arrows */}
      <FlowArrows edgesGeoJSON={edgesGeoJSON} />

      {/* Sewer network overlay (after pipeline processing) */}
      {sewerNetwork && <SewerNetworkLayers network={sewerNetwork} />}

      {/* Ghost edge (add-edge mode) */}
      {ghostEdgeFrom && ghostEdgeTo && (
        <GhostEdge from={ghostEdgeFrom} to={ghostEdgeTo} />
      )}
    </MapGL>
  );
}
