'use client';

import { useDeleteProject, useUpdateProject } from '../../../stores/useProjectStore';
import type { Project } from '../../../stores/useProjectStore';
import { useRouter } from 'next/navigation';
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { ArrowLeft, Trash2, Download, Save, Undo2, Redo2, Network, MousePointer, Plus, Move, X, Scissors } from 'lucide-react';

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

import { HIGHWAY_COLORS } from '@/features/map/constants';
import { NodesApiService } from '@/features/map/services/NodesApiService';
import type { EnrichedFeatureCollection } from '@/features/map/types/elevation.types';
import { useGraphStore } from '@/stores/graphStore';
import { useCommandManager } from '@/stores/commandManager';
import { mapNodesToNetworkGraph } from '@/lib/graph/serialization';
import type { EditingMode } from '@/lib/graph/types';

// Dynamic import for GraphMapView (no SSR — MapLibre uses WebGL)
const GraphMapView = dynamic(() => import('@/components/map/GraphMapView'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-zinc-200 dark:bg-zinc-800">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
    </div>
  ),
});

// ============ TYPES ============

interface ProjectEditorProps {
  project?: Project;
  isLoading: boolean;
}

// ============ MODE BUTTONS ============

const MODES: { mode: EditingMode; label: string; icon: React.ReactNode; shortcut?: string }[] = [
  { mode: 'select', label: 'Select', icon: <MousePointer className="h-4 w-4" />, shortcut: 'V' },
  { mode: 'move', label: 'Move', icon: <Move className="h-4 w-4" />, shortcut: 'M' },
  { mode: 'add-node', label: 'Add Node', icon: <Plus className="h-4 w-4" />, shortcut: 'A' },
  { mode: 'delete', label: 'Delete', icon: <X className="h-4 w-4" />, shortcut: 'D' },
  { mode: 'split-edge', label: 'Split', icon: <Scissors className="h-4 w-4" />, shortcut: 'S' },
];

// ============ MAIN COMPONENT ============

export function ProjectEditor({ project, isLoading }: ProjectEditorProps) {
  const router = useRouter();
  const { mutateAsync: deleteProject } = useDeleteProject();
  const { mutateAsync: updateProject } = useUpdateProject();

  const [activeTab, setActiveTab] = useState<'overview' | 'streets'>('overview');
  const [isMounted, setIsMounted] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const didInitRef = useRef(false);

  // Graph store
  const editingMode = useGraphStore((s) => s.editingMode);
  const graphNodes = useGraphStore((s) => s.nodes);
  const selectedNodeIds = useGraphStore((s) => s.selectedNodeIds);
  const setMode = useGraphStore((s) => s.setMode);
  const loadGraph = useGraphStore((s) => s.loadGraph);
  const resetGraph = useGraphStore((s) => s.reset);
  const setSelection = useGraphStore((s) => s.setSelection);

  // Command manager
  const canUndo = useCommandManager((s) => s.canUndo);
  const canRedo = useCommandManager((s) => s.canRedo);
  const commandUndo = useCommandManager((s) => s.undo);
  const commandRedo = useCommandManager((s) => s.redo);
  const clearCommands = useCommandManager((s) => s.clear);

  const nodesApiService = useRef(NodesApiService.getInstance()).current;

  useEffect(() => {
    setIsMounted(true);
    return () => {
      // Cleanup graph state when leaving page
      resetGraph();
      clearCommands();
    };
  }, [resetGraph, clearCommands]);

  // Initialize graph from project data
  useEffect(() => {
    if (project?.streets && !didInitRef.current) {
      didInitRef.current = true;

      nodesApiService
        .extractNodes(project.streets as EnrichedFeatureCollection, 'all')
        .then(({ nodes: extractedNodes }) => {
          const graph = mapNodesToNetworkGraph(extractedNodes);
          loadGraph(graph);
          setHasChanges(false);
        })
        .catch((err) => {
          console.error('Failed to extract nodes:', err);
        });
    }
  }, [project, nodesApiService, loadGraph]);

  // Track changes when graph mutates
  useEffect(() => {
    const unsub = useGraphStore.subscribe(
      (s) => [s.nodes, s.edges],
      () => {
        if (didInitRef.current) setHasChanges(true);
      },
    );
    return unsub;
  }, []);

  // Keyboard shortcuts for modes
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const modeMap: Record<string, EditingMode> = { v: 'select', m: 'move', a: 'add-node', d: 'delete', s: 'split-edge' };
      const mode = modeMap[e.key.toLowerCase()];
      if (mode) setMode(mode);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [setMode]);

  // ============ HANDLERS ============

  const handleSave = useCallback(async () => {
    if (!project) return;
    setIsSaving(true);
    try {
      // For now, keep original streets — node changes are tracked separately
      await updateProject({
        ...project,
        streets: project.streets, // TODO: merge node changes back to streets
      });
      setHasChanges(false);
    } catch (error) {
      console.error('Failed to save project:', error);
    } finally {
      setIsSaving(false);
    }
  }, [project, updateProject]);

  const handleExport = useCallback(() => {
    if (!project?.streets) return;
    const blob = new Blob([JSON.stringify(project.streets, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name || 'project'}-streets.geojson`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [project]);

  const handleDelete = async () => {
    if (!project) return;
    try {
      await deleteProject(project.id);
      router.push('/projects');
    } catch (error) {
      console.error('Failed to delete project:', error);
    }
  };

  // ============ COMPUTED ============

  const nodeCount = Object.keys(graphNodes).length;

  const elevationStats = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;
    let hasElev = false;
    for (const node of Object.values(graphNodes)) {
      const e = node.properties.elevation;
      if (e !== null && e !== undefined) {
        if (e < min) min = e;
        if (e > max) max = e;
        hasElev = true;
      }
    }
    return hasElev ? { min, max } : null;
  }, [graphNodes]);

  // ============ RENDER ============

  if (!isMounted || isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
          <div className="text-zinc-500">
            {isLoading ? 'Loading project data...' : 'Initializing...'}
          </div>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-zinc-50 dark:bg-zinc-950">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Project not found</h1>
        <button onClick={() => router.push('/projects')} className="text-blue-600 hover:underline">
          Back to Projects
        </button>
      </div>
    );
  }

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
              {hasChanges && <span className="ml-2 text-amber-500">* Unsaved changes</span>}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Edit Mode Toolbar */}
          <div className="flex bg-zinc-100 dark:bg-zinc-800 rounded-lg p-1 mr-2">
            {MODES.map(({ mode, label, icon, shortcut }) => (
              <button
                key={mode}
                onClick={() => setMode(mode)}
                title={`${label}${shortcut ? ` (${shortcut})` : ''}`}
                className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md transition-colors ${
                  editingMode === mode
                    ? 'bg-white shadow text-black dark:bg-zinc-600 dark:text-white'
                    : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                }`}
              >
                {icon}
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>

          {/* Undo/Redo */}
          <div className="flex gap-1 mr-2">
            <button
              onClick={commandUndo}
              disabled={!canUndo}
              className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30"
              title="Undo (Ctrl+Z)"
            >
              <Undo2 className="h-4 w-4 text-zinc-600 dark:text-zinc-400" />
            </button>
            <button
              onClick={commandRedo}
              disabled={!canRedo}
              className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30"
              title="Redo (Ctrl+Shift+Z)"
            >
              <Redo2 className="h-4 w-4 text-zinc-600 dark:text-zinc-400" />
            </button>
          </div>

          {/* Save */}
          <button
            onClick={handleSave}
            disabled={isSaving || !hasChanges}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {isSaving ? 'Saving...' : 'Save'}
          </button>

          {/* Process (coming soon) */}
          <button
            disabled
            className="flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-400 cursor-not-allowed opacity-50 dark:border-zinc-700 dark:text-zinc-500"
            title="Em breve"
          >
            <Network className="h-4 w-4" />
            Processar
          </button>

          {/* Export */}
          <button
            onClick={handleExport}
            className="flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            <Download className="h-4 w-4" />
            Export
          </button>

          {/* Delete */}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/30">
                <Trash2 className="h-4 w-4" />
                Delete
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. This will permanently delete your project.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  className="bg-red-600 text-white hover:bg-red-700 dark:bg-red-900 dark:text-white dark:hover:bg-red-800"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Map (Left) */}
        <div className="relative flex-1 bg-zinc-200 dark:bg-zinc-800">
          <GraphMapView
            center={project.center}
            zoom={project.zoom}
            bounds={project.bounds}
            streetFeatures={project.streets as unknown as GeoJSON.FeatureCollection}
          />

          {/* Overlay stats */}
          <div className="absolute top-4 left-4 z-[10] flex flex-col gap-2">
            <div className="rounded-lg bg-white/90 px-3 py-2 shadow-sm backdrop-blur-sm dark:bg-zinc-900/90">
              <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
                Area: {project.areaKm2.toFixed(2)} km²
              </span>
            </div>
            <div className="rounded-lg bg-white/90 px-3 py-2 shadow-sm backdrop-blur-sm dark:bg-zinc-900/90">
              <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
                {nodeCount} nodes | {selectedNodeIds.length} selected
              </span>
            </div>
          </div>
        </div>

        {/* Data Inspector (Right) */}
        <div className="w-80 border-l border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex border-b border-zinc-200 dark:border-zinc-800">
            <button
              onClick={() => setActiveTab('overview')}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === 'overview'
                  ? 'border-b-2 border-blue-600 text-blue-600 dark:text-blue-400'
                  : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200'
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab('streets')}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === 'streets'
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
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Project Stats
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800/50">
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">Total Streets</p>
                      <p className="mt-1 text-xl font-bold text-zinc-900 dark:text-zinc-100">
                        {project.stats.streetCount}
                      </p>
                    </div>
                    <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800/50">
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">Total Nodes</p>
                      <p className="mt-1 text-xl font-bold text-zinc-900 dark:text-zinc-100">{nodeCount}</p>
                    </div>
                    <div className="col-span-2 rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800/50">
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">Elevation (Min - Max)</p>
                      <p className="mt-1 text-xl font-bold text-zinc-900 dark:text-zinc-100">
                        {elevationStats
                          ? `${elevationStats.min.toFixed(0)}m - ${elevationStats.max.toFixed(0)}m`
                          : '-'}
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Center Coordinates
                  </h3>
                  <div className="rounded-lg bg-zinc-50 p-3 font-mono text-xs text-zinc-600 dark:bg-zinc-800/50 dark:text-zinc-300">
                    {project.center[0].toFixed(5)}, {project.center[1].toFixed(5)}
                  </div>
                </div>

                {selectedNodeIds.length > 0 && (
                  <div>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                      Selected Nodes
                    </h3>
                    <div className="space-y-2">
                      {selectedNodeIds.slice(0, 5).map((id) => {
                        const node = graphNodes[id];
                        if (!node) return null;
                        return (
                          <div key={id} className="rounded-lg bg-blue-50 p-2 text-xs dark:bg-blue-900/20">
                            <p className="font-medium text-blue-900 dark:text-blue-100">
                              {node.properties.streetName || 'Unnamed'}
                            </p>
                            <p className="text-blue-600 dark:text-blue-400">
                              Elev: {node.properties.elevation?.toFixed(1) ?? 'N/A'}m
                            </p>
                          </div>
                        );
                      })}
                      {selectedNodeIds.length > 5 && (
                        <p className="text-xs text-zinc-500">+{selectedNodeIds.length - 5} more</p>
                      )}
                    </div>
                    <button
                      onClick={() => setSelection([])}
                      className="mt-2 w-full rounded-lg bg-zinc-200 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-300 dark:bg-zinc-700 dark:text-zinc-300"
                    >
                      Clear Selection
                    </button>
                  </div>
                )}
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
