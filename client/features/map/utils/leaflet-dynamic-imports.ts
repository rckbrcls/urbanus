/**
 * Dynamic imports centralizados para componentes do react-leaflet
 * 
 * Todos os componentes do react-leaflet precisam ser importados dinamicamente
 * com ssr: false porque o Leaflet acessa APIs do navegador (DOM, window, etc.)
 * que não existem no servidor durante o SSR do Next.js.
 */

import dynamic from 'next/dynamic';

// Componentes básicos do mapa
export const MapContainer = dynamic(
  () => import('react-leaflet').then((mod) => mod.MapContainer),
  { ssr: false }
);

export const TileLayer = dynamic(
  () => import('react-leaflet').then((mod) => mod.TileLayer),
  { ssr: false }
);

// Componentes de geometria
export const Rectangle = dynamic(
  () => import('react-leaflet').then((mod) => mod.Rectangle),
  { ssr: false }
);

export const Polygon = dynamic(
  () => import('react-leaflet').then((mod) => mod.Polygon),
  { ssr: false }
);

export const Polyline = dynamic(
  () => import('react-leaflet').then((mod) => mod.Polyline),
  { ssr: false }
);

export const CircleMarker = dynamic(
  () => import('react-leaflet').then((mod) => mod.CircleMarker),
  { ssr: false }
);

// Componentes de UI
export const Tooltip = dynamic(
  () => import('react-leaflet').then((mod) => mod.Tooltip),
  { ssr: false }
);

// Hooks do react-leaflet (não precisam ser dinâmicos se usados apenas dentro de componentes client-side)
// Mas exportamos aqui para centralizar os imports
export { useMapEvents, useMap } from 'react-leaflet';
