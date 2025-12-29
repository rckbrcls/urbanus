'use client';

import { useProjectStore } from '../../../stores/useProjectStore';
import { useRouter } from 'next/navigation';
import { useState, use, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { ArrowLeft, Trash2, Download } from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { HIGHWAY_COLORS } from '@/constants/map-constants';

// Dynamic imports for Map components
const MapContainer = dynamic(
  () => import('react-leaflet').then((mod) => mod.MapContainer),
  { ssr: false }
);
const TileLayer = dynamic(
  () => import('react-leaflet').then((mod) => mod.TileLayer),
  { ssr: false }
);
const Rectangle = dynamic(
  () => import('react-leaflet').then((mod) => mod.Rectangle),
  { ssr: false }
);
const GeoJSON = dynamic(
  () => import('react-leaflet').then((mod) => mod.GeoJSON),
  { ssr: false }
);

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id } = use(params);
  const getProject = useProjectStore((state) => state.getProject);
  const deleteProject = useProjectStore((state) => state.deleteProject);
  const project = getProject(id);
  const [activeTab, setActiveTab] = useState<'overview' | 'streets'>('overview');
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const elevationStats = useMemo(() => {
    if (!project?.streets) return null;
    let min = Infinity;
    let max = -Infinity;
    let hasElevation = false;

    project.streets.features.forEach((f: any) => {
      const elev = f.properties?.elevation;
      if (elev) {
        if (elev.min < min) min = elev.min;
        if (elev.max > max) max = elev.max;
        hasElevation = true;
      }
    });

    return hasElevation ? { min, max } : null;
  }, [project]);

  if (!isMounted) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div className="text-zinc-500">Loading project...</div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <h1 className="text-2xl font-bold">Project not found</h1>
        <button
          onClick={() => router.push('/projects')}
          className="text-blue-600 hover:underline"
        >
          Back to Projects
        </button>
      </div>
    );
  }

  const handleDelete = () => {
    deleteProject(project.id);
    router.push('/projects');
  };


  return (
    <div className="flex h-screen flex-col overflow-hidden bg-zinc-50 dark:bg-zinc-950">
      {/* Header */}
      <header className="flex h-14 items-center justify-between border-b border-zinc-200 bg-white px-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/projects')}
            className="rounded-lg p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <ArrowLeft className="h-5 w-5 text-zinc-600 dark:text-zinc-400" />
          </button>
          <div>
            <h1 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{project.name}</h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Created {new Date(project.createdAt).toLocaleDateString()}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => alert('Exporting GeoJSON... (Not implemented yet)')}
            className="flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            <Download className="h-4 w-4" />
            Export
          </button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button
                className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/30"
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. This will permanently delete your project and remove your data from our servers.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} className="bg-red-600 text-white hover:bg-red-700 dark:bg-red-900 dark:text-white dark:hover:bg-red-800">
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Map View (Left - 70%) */}
        <div className="relative flex-1 bg-zinc-200 dark:bg-zinc-800">
          <MapContainer
            center={project.center}
            zoom={project.zoom}
            className="h-full w-full"
            style={{ background: 'transparent' }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png"
            />
            <Rectangle
              bounds={[
                [project.bounds.southWest.lat, project.bounds.southWest.lng],
                [project.bounds.northEast.lat, project.bounds.northEast.lng],
              ]}
              pathOptions={{
                color: '#2563eb',
                fillColor: 'transparent',
                weight: 2,
              }}
            />
            {project.streets && (
              <GeoJSON
                data={project.streets}
                style={(feature) => {
                  const highway = feature?.properties?.highway || 'unclassified';
                  return {
                    color: HIGHWAY_COLORS[highway] || HIGHWAY_COLORS.unclassified,
                    weight:
                      highway === 'motorway' || highway === 'trunk'
                        ? 4
                        : highway === 'primary' || highway === 'secondary'
                          ? 3
                          : 2,
                    opacity: 0.8,
                  };
                }}
                onEachFeature={(feature, layer) => {
                  const props = feature.properties;
                  if (props) {
                    const name = props.name || 'Sem nome';
                    const type = props.highway || 'via';
                    let elevationInfo = '';

                    if (props.elevation) {
                      elevationInfo = `
                        <br/><hr style="margin: 4px 0; border-color: #ddd"/>
                        <div style="font-size: 0.9em; color: #444">
                          <strong>Topografia:</strong><br/>
                          Média: ${props.elevation.avg.toFixed(1)}m<br/>
                          Min: ${props.elevation.min.toFixed(1)}m | Max: ${props.elevation.max.toFixed(1)}m
                        </div>
                      `;
                    }

                    layer.bindTooltip(
                      `
                      <div style="font-family: system-ui; line-height: 1.4;">
                          <strong>${name}</strong><br/>
                          <span style="color: ${HIGHWAY_COLORS[type] || '#666'}">${type}</span>
                          ${props.maxspeed ? `<br/>Velocidade: ${props.maxspeed}` : ''}
                          ${props.lanes ? `<br/>Faixas: ${props.lanes}` : ''}
                          ${props.oneway ? '<br/>Mão única' : ''}
                          ${elevationInfo}
                      </div>
                    `,
                      { sticky: true, className: 'custom-tooltip' }
                    );
                  }
                }}
              />
            )}
            {/* Note: In a real implementation, we would reload the street/elev data here using the bounds */}
          </MapContainer>

          {/* Overlay Stats */}
          <div className="absolute top-4 left-4 z-[1000] flex flex-col gap-2">
            <div className="rounded-lg bg-white/90 px-3 py-2 shadow-sm backdrop-blur-sm dark:bg-zinc-900/90">
              <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
                Area: {project.areaKm2.toFixed(2)} km²
              </span>
            </div>
          </div>
        </div>

        {/* Data Inspector (Right - 30%) */}
        <div className="w-80 border-l border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex border-b border-zinc-200 dark:border-zinc-800">
            <button
              onClick={() => setActiveTab('overview')}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${activeTab === 'overview'
                ? 'border-b-2 border-blue-600 text-blue-600 dark:text-blue-400'
                : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200'
                }`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab('streets')}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${activeTab === 'streets'
                ? 'border-b-2 border-blue-600 text-blue-600 dark:text-blue-400'
                : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200'
                }`}
            >
              Streets
            </button>
          </div>

          <div className="p-4">
            {activeTab === 'overview' && (
              <div className="space-y-6">
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Project Stats</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800/50">
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">Total Streets</p>
                      <p className="mt-1 text-xl font-bold text-zinc-900 dark:text-zinc-100">{project.stats.streetCount}</p>
                    </div>
                    <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800/50">
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">Topography (Min - Max)</p>
                      <p className="mt-1 text-xl font-bold text-zinc-900 dark:text-zinc-100">
                        {elevationStats ? `${elevationStats.min.toFixed(0)}m - ${elevationStats.max.toFixed(0)}m` : '-'}
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Center Coordinates</h3>
                  <div className="rounded-lg bg-zinc-50 p-3 font-mono text-xs text-zinc-600 dark:bg-zinc-800/50 dark:text-zinc-300">
                    {project.center[0].toFixed(5)}, {project.center[1].toFixed(5)}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'streets' && (
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Highway Legend</h3>
                <div className="space-y-2">
                  {Object.entries(HIGHWAY_COLORS).map(([type, color]) => (
                    <div key={type} className="flex items-center justify-between rounded-lg border border-zinc-100 p-2 dark:border-zinc-800">
                      <span className="text-xs capitalize text-zinc-600 dark:text-zinc-400">{type}</span>
                      <div className="h-3 w-3 rounded-full" style={{ backgroundColor: color }} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
