'use client';

import { useRef, useCallback } from 'react';
import MapGL, { type MapRef } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';

import { MAP_STYLES } from '@/lib/map/styles';
import { useGraphStore } from '@/stores/graphStore';
import { useDerivedGeoJSON } from '@/hooks/useDerivedGeoJSON';
import { useGraphEditor } from '@/hooks/useGraphEditor';

import GraphLayers from './GraphLayers';
import GhostEdge from './GhostEdge';
import FlowArrows from './FlowArrows';

interface GraphMapViewProps {
  center: [number, number];
  zoom: number;
  bounds?: {
    southWest: { lat: number; lng: number };
    northEast: { lat: number; lng: number };
  };
  streetFeatures?: GeoJSON.FeatureCollection | null;
}

/**
 * Main map component for the graph editor.
 * Renders graph nodes/edges via GraphLayers and delegates interactions to useGraphEditor.
 */
export default function GraphMapView({ center, zoom, bounds, streetFeatures }: GraphMapViewProps) {
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
      mapStyle={MAP_STYLES.voyagerNoLabels}
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

      {/* Ghost edge (add-edge mode) */}
      {ghostEdgeFrom && ghostEdgeTo && (
        <GhostEdge from={ghostEdgeFrom} to={ghostEdgeTo} />
      )}
    </MapGL>
  );
}
