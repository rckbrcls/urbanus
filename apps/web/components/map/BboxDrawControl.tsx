'use client';

import { useRef, useState, useEffect } from 'react';
import { Source, Layer, useMap } from 'react-map-gl/maplibre';
import type { LngLat, MapMouseEvent } from 'maplibre-gl';

import { GeoCalculations } from '@urbanus/geo';
import { AREA_LIMITS } from '@urbanus/constants';
import { useAreaSelectionStore } from '@/stores/areaSelectionStore';
import { useTranslation } from '@/i18n';

function lngLatToBbox(start: LngLat, end: LngLat) {
  return {
    southWest: { lat: Math.min(start.lat, end.lat), lng: Math.min(start.lng, end.lng) },
    northEast: { lat: Math.max(start.lat, end.lat), lng: Math.max(start.lng, end.lng) },
  };
}

function bboxToPolygon(sw: { lat: number; lng: number }, ne: { lat: number; lng: number }) {
  return {
    type: 'Feature' as const,
    properties: {},
    geometry: {
      type: 'Polygon' as const,
      coordinates: [[
        [sw.lng, sw.lat],
        [ne.lng, sw.lat],
        [ne.lng, ne.lat],
        [sw.lng, ne.lat],
        [sw.lng, sw.lat],
      ]],
    },
  };
}

export default function BboxDrawControl() {
  const tm = useTranslation('mapPage');
  const areaExceededLabel = tm.areaExceeded ?? 'Area exceeds';
  const { current: mapRef } = useMap();
  const startRef = useRef<LngLat | null>(null);
  const isDrawingRef = useRef(false);
  const [rectGeoJSON, setRectGeoJSON] = useState<GeoJSON.Feature | null>(null);
  const [isInvalid, setIsInvalid] = useState(false);

  const setPendingBbox = useAreaSelectionStore((s) => s.setPendingBbox);
  const setValidationError = useAreaSelectionStore((s) => s.setValidationError);
  const viewMode = useAreaSelectionStore((s) => s.viewMode);

  // Clear rectangle when leaving explore mode (confirm/cancel)
  useEffect(() => {
    if (viewMode !== 'explore') {
      setRectGeoJSON(null);
      setIsInvalid(false);
    }
  }, [viewMode]);

  useEffect(() => {
    const map = mapRef?.getMap();
    if (!map) return;

    const handleMouseDown = (e: MapMouseEvent) => {
      if (!e.originalEvent.shiftKey || viewMode !== 'explore') return;

      startRef.current = e.lngLat;
      isDrawingRef.current = true;
      setIsInvalid(false);
      setRectGeoJSON(null);
      map.dragPan.disable();
    };

    const handleMouseMove = (e: MapMouseEvent) => {
      if (!startRef.current || !isDrawingRef.current) return;
      const bbox = lngLatToBbox(startRef.current, e.lngLat);
      setRectGeoJSON(bboxToPolygon(bbox.southWest, bbox.northEast));
    };

    const handleMouseUp = (e: MapMouseEvent) => {
      if (!startRef.current || !isDrawingRef.current) return;

      const bbox = lngLatToBbox(startRef.current, e.lngLat);
      const area = GeoCalculations.calculateArea(bbox);

      if (area > AREA_LIMITS.MAX_BBOX_AREA_KM2) {
        setValidationError(`${areaExceededLabel} ${AREA_LIMITS.MAX_BBOX_AREA_KM2} km²`);
        setIsInvalid(true);
      } else if (area < 0.001) {
        setRectGeoJSON(null);
      } else {
        setPendingBbox(bbox, area);
      }

      startRef.current = null;
      isDrawingRef.current = false;
      map.dragPan.enable();
    };

    map.on('mousedown', handleMouseDown);
    map.on('mousemove', handleMouseMove);
    map.on('mouseup', handleMouseUp);

    return () => {
      map.off('mousedown', handleMouseDown);
      map.off('mousemove', handleMouseMove);
      map.off('mouseup', handleMouseUp);
    };
  }, [areaExceededLabel, mapRef, viewMode, setPendingBbox, setValidationError]);

  if (!rectGeoJSON) return null;

  const featureCollection: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: [rectGeoJSON],
  };

  return (
    <Source id="bbox-draw" type="geojson" data={featureCollection}>
      <Layer
        id="bbox-draw-fill"
        type="fill"
        paint={{
          'fill-color': isInvalid ? '#ef4444' : '#3b82f6',
          'fill-opacity': 0.1,
        }}
      />
      <Layer
        id="bbox-draw-line"
        type="line"
        paint={{
          'line-color': isInvalid ? '#ef4444' : '#3b82f6',
          'line-width': 2,
        }}
      />
    </Source>
  );
}
