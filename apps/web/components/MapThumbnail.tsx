'use client';

import { Project } from '@/stores/useProjectStore';
import { useRef, useEffect } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useMapStyle } from '@/hooks/useMapStyle';

/**
 * Non-interactive MapLibre thumbnail used in project cards and list items.
 * Renders bounds rectangle as a simple GeoJSON fill layer.
 */
export function MapThumbnail({ project }: { project: Project }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const mapStyle = useMapStyle('minimal');

  useEffect(() => {
    if (!containerRef.current) return;

    // Destroy previous map if style changed
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: mapStyle,
      center: [project.center[1], project.center[0]],
      zoom: project.zoom,
      interactive: false,
      attributionControl: false,
    });

    map.on('load', () => {
      const { southWest: sw, northEast: ne } = project.bounds;

      map.addSource('bounds', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'Polygon',
            coordinates: [[
              [sw.lng, sw.lat],
              [ne.lng, sw.lat],
              [ne.lng, ne.lat],
              [sw.lng, ne.lat],
              [sw.lng, sw.lat],
            ]],
          },
        },
      });

      map.addLayer({
        id: 'bounds-fill',
        type: 'fill',
        source: 'bounds',
        paint: {
          'fill-color': '#3b82f6',
          'fill-opacity': 0.1,
        },
      });

      map.addLayer({
        id: 'bounds-line',
        type: 'line',
        source: 'bounds',
        paint: {
          'line-color': '#2563eb',
          'line-width': 2,
        },
      });
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [project, mapStyle]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full grayscale-[50%] filter transition-all duration-500 group-hover:grayscale-0"
    />
  );
}
