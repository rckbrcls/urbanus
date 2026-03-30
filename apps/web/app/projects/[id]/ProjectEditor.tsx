'use client';

import { useDeleteProject, useUpdateProject } from '../../../stores/useProjectStore';
import type { Project } from '../../../stores/useProjectStore';
import { useRouter } from 'next/navigation';
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { ArrowLeft, Trash2, Download, Save, Undo2, Redo2, Network, MousePointer, Plus, Move, X, Scissors, Loader2, Mountain } from 'lucide-react';

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
import { usePipelineStore } from '@/stores/pipelineStore';
import { PipelineResultsPanel } from '@/components/pipeline/PipelineResultsPanel';
import { Switch } from '@/components/ui/switch';
import { useTranslation } from '@/i18n';
import type { SewerViewMode } from '@/components/map/SewerNetworkLayers';

// Dynamic imports (no SSR — MapLibre uses WebGL)
const GraphMapView = dynamic(() => import('@/components/map/GraphMapView'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-zinc-200 dark:bg-zinc-800">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
    </div>
  ),
});
const SewerNetworkLayers = dynamic(() => import('@/components/map/SewerNetworkLayers'), { ssr: false });

// ============ TYPES ============

interface ProjectEditorProps {
  project?: Project;
  isLoading: boolean;
}

// ============ MAIN COMPONENT ============

export function ProjectEditor({ project, isLoading }: ProjectEditorProps) {
  const router = useRouter();
  const { mutateAsync: deleteProject } = useDeleteProject();
  const { mutateAsync: updateProject } = useUpdateProject();
  const te = useTranslation('editor');
  const tc = useTranslation('common');

  const [activeTab, setActiveTab] = useState<'overview' | 'streets' | 'pipeline'>('overview');
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

  // Pipeline store
  const pipelineStatus = usePipelineStore((s) => s.status);
  const pipelineResult = usePipelineStore((s) => s.result);
  const pipelineError = usePipelineStore((s) => s.error);
  const processProject = usePipelineStore((s) => s.processProject);
  const resetPipeline = usePipelineStore((s) => s.reset);

  // Sewer view mode
  const [sewerViewMode, setSewerViewMode] = useState<SewerViewMode>('type');

  const nodesApiService = useRef(NodesApiService.getInstance()).current;

  // ============ MODE BUTTONS ============

  const MODES: { mode: EditingMode; label: string; icon: React.ReactNode; shortcut?: string }[] = useMemo(() => [
    { mode: 'select', label: te.modes.select, icon: <MousePointer className="h-4 w-4" />, shortcut: 'V' },
    { mode: 'move', label: te.modes.move, icon: <Move className="h-4 w-4" />, shortcut: 'M' },
    { mode: 'add-node', label: te.modes.addNode, icon: <Plus className="h-4 w-4" />, shortcut: 'A' },
    { mode: 'delete', label: te.modes.delete, icon: <X className="h-4 w-4" />, shortcut: 'D' },
    { mode: 'split-edge', label: te.modes.split, icon: <Scissors className="h-4 w-4" />, shortcut: 'S' },
  ], [te.modes]);

  useEffect(() => {
    setIsMounted(true);
    return () => {
      // Cleanup state when leaving page
      resetGraph();
      clearCommands();
      resetPipeline();
    };
  }, [resetGraph, clearCommands, resetPipeline]);

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

  const handleProcess = useCallback(async () => {
    if (!project) return;
    await processProject(project.id);
    setActiveTab('pipeline');
  }, [project, processProject]);

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

  // Elevation range from the sewer network (for gradient coloring)
  const sewerElevationRange = useMemo(() => {
    if (!pipelineResult) return null;
    let min = Infinity;
    let max = -Infinity;
    let hasElev = false;
    for (const node of pipelineResult.nodes) {
      if (node.elevation != null) {
        if (node.elevation < min) min = node.elevation;
        if (node.elevation > max) max = node.elevation;
        hasElev = true;
      }
    }
    return hasElev ? { min, max } : null;
  }, [pipelineResult]);

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
            {isLoading ? te.loadingProject : te.initializing}
          </div>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-zinc-50 dark:bg-zinc-950">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{te.projectNotFound}</h1>
        <button onClick={() => router.push('/projects')} className="text-blue-600 hover:underline">
          {te.backToProjects}
        </button>
      </div>
    );
  }

  return (
    <div className="relative h-screen overflow-hidden">
      {/* Full-bleed Map */}
      <div className="absolute inset-0">
        <GraphMapView
          center={project.center}
          zoom={project.zoom}
          bounds={project.bounds}
          streetFeatures={project.streets as unknown as GeoJSON.FeatureCollection}
          sewerNetwork={pipelineResult}
          sewerViewMode={sewerViewMode}
          sewerElevationRange={sewerElevationRange}
        />
      </div>

      {/* Overlay stats — top left */}
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
        <div className="flex items-center gap-2 rounded-2xl border border-border bg-background/90 px-3 py-2 backdrop-blur-sm">
          <button
            onClick={() => router.push('/projects')}
            className="rounded-lg p-1 text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="h-4 w-px bg-border" />
          <span className="text-xs font-medium text-foreground">{project.name}</span>
          {hasChanges && <span className="text-xs text-amber-500">*</span>}
        </div>
        <div className="rounded-2xl border border-border bg-background/90 px-3 py-2 backdrop-blur-sm">
          <span className="text-xs font-medium text-muted-foreground">
            {project.areaKm2.toFixed(2)} km² &middot; {nodeCount} {te.nodes}
            {selectedNodeIds.length > 0 && ` \u00b7 ${selectedNodeIds.length} ${te.selected}`}
          </span>
        </div>
      </div>

      {/* Edit Mode Toolbar — top center */}
      <div className="absolute top-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-2xl border border-border bg-background/90 p-1 backdrop-blur-sm">
        {MODES.map(({ mode, label, icon, shortcut }) => (
          <button
            key={mode}
            onClick={() => setMode(mode)}
            title={`${label}${shortcut ? ` (${shortcut})` : ''}`}
            className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs transition-colors ${
              editingMode === mode
                ? 'bg-foreground/10 font-medium text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {icon}
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
        <div className="mx-1 h-4 w-px bg-border" />
        <button
          onClick={commandUndo}
          disabled={!canUndo}
          className="rounded-xl p-1.5 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
          title="Undo (Ctrl+Z)"
        >
          <Undo2 className="h-4 w-4" />
        </button>
        <button
          onClick={commandRedo}
          disabled={!canRedo}
          className="rounded-xl p-1.5 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
          title="Redo (Ctrl+Shift+Z)"
        >
          <Redo2 className="h-4 w-4" />
        </button>
      </div>

      {/* Floating Sidebar — right */}
      <div className="absolute top-4 right-4 bottom-4 z-10 flex w-80 flex-col overflow-hidden rounded-2xl border border-border bg-background/90 backdrop-blur-sm">
        {/* Action buttons */}
        <div className="flex items-center gap-1.5 border-b border-border p-3">
          <button
            onClick={handleSave}
            disabled={isSaving || !hasChanges}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-foreground px-3 py-1.5 text-xs font-medium text-background transition-colors hover:bg-foreground/90 disabled:opacity-40"
          >
            <Save className="h-3.5 w-3.5" />
            {isSaving ? tc.saving : tc.save}
          </button>
          <button
            onClick={handleProcess}
            disabled={pipelineStatus === 'processing'}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-600 transition-colors hover:bg-emerald-500/20 disabled:opacity-40 dark:text-emerald-400"
            title={te.runPipeline}
          >
            {pipelineStatus === 'processing' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Network className="h-3.5 w-3.5" />
            )}
            {pipelineStatus === 'processing' ? tc.processing : tc.process}
          </button>
          <button
            onClick={handleExport}
            className="rounded-xl p-1.5 text-muted-foreground transition-colors hover:text-foreground"
            title={te.exportGeoJSON}
          >
            <Download className="h-4 w-4" />
          </button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button
                className="rounded-xl p-1.5 text-muted-foreground transition-colors hover:text-red-500"
                title={te.deleteProject}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{te.deleteConfirmTitle}</AlertDialogTitle>
                <AlertDialogDescription>
                  {te.deleteConfirmDescription}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{tc.cancel}</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  className="bg-red-600 text-white hover:bg-red-700 dark:bg-red-900 dark:text-white dark:hover:bg-red-800"
                >
                  {tc.delete}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border">
          <button
            onClick={() => setActiveTab('overview')}
            className={`flex-1 px-4 py-2.5 text-xs font-medium transition-colors ${
              activeTab === 'overview'
                ? 'border-b-2 border-foreground text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {te.overview}
          </button>
          <button
            onClick={() => setActiveTab('streets')}
            className={`flex-1 px-4 py-2.5 text-xs font-medium transition-colors ${
              activeTab === 'streets'
                ? 'border-b-2 border-foreground text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {te.streetsTab}
          </button>
          <button
            onClick={() => setActiveTab('pipeline')}
            className={`flex-1 px-4 py-2.5 text-xs font-medium transition-colors ${
              activeTab === 'pipeline'
                ? 'border-b-2 border-emerald-500 text-emerald-600 dark:text-emerald-400'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {te.pipelineTab}
            {pipelineResult && (
              <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
            )}
          </button>
        </div>

        {/* Tab content — scrollable */}
        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {te.projectStats}
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-border p-3">
                    <p className="text-xs text-muted-foreground">{te.streets}</p>
                    <p className="mt-1 text-lg font-bold text-foreground">
                      {project.stats.streetCount}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border p-3">
                    <p className="text-xs text-muted-foreground">{te.nodes}</p>
                    <p className="mt-1 text-lg font-bold text-foreground">{nodeCount}</p>
                  </div>
                  <div className="col-span-2 rounded-xl border border-border p-3">
                    <p className="text-xs text-muted-foreground">{te.elevation}</p>
                    <p className="mt-1 text-lg font-bold text-foreground">
                      {elevationStats
                        ? `${elevationStats.min.toFixed(0)}m - ${elevationStats.max.toFixed(0)}m`
                        : '-'}
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {te.centerCoordinates}
                </h3>
                <div className="rounded-xl border border-border p-3 font-mono text-xs text-muted-foreground">
                  {project.center[0].toFixed(5)}, {project.center[1].toFixed(5)}
                </div>
              </div>

              {selectedNodeIds.length > 0 && (
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {te.selectedNodes}
                  </h3>
                  <div className="space-y-2">
                    {selectedNodeIds.slice(0, 5).map((id) => {
                      const node = graphNodes[id];
                      if (!node) return null;
                      return (
                        <div key={id} className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-2 text-xs">
                          <p className="font-medium text-foreground">
                            {node.properties.streetName || te.unnamed}
                          </p>
                          <p className="text-muted-foreground">
                            Elev: {node.properties.elevation?.toFixed(1) ?? 'N/A'}m
                          </p>
                        </div>
                      );
                    })}
                    {selectedNodeIds.length > 5 && (
                      <p className="text-xs text-muted-foreground">+{selectedNodeIds.length - 5} {te.more}</p>
                    )}
                  </div>
                  <button
                    onClick={() => setSelection([])}
                    className="mt-2 w-full rounded-xl border border-border py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {te.clearSelection}
                  </button>
                </div>
              )}
            </div>
          )}

          {activeTab === 'streets' && (
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-foreground">{te.highwayLegend}</h3>
              <div className="space-y-1.5">
                {Object.entries(HIGHWAY_COLORS).map(([type, color]) => (
                  <div key={type} className="flex items-center justify-between rounded-xl border border-border p-2">
                    <span className="text-xs capitalize text-muted-foreground">{type}</span>
                    <div className="h-3 w-3 rounded-full" style={{ backgroundColor: color }} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'pipeline' && (
            <div className="space-y-4">
              {pipelineStatus === 'idle' && (
                <div className="py-8 text-center">
                  <Network className="mx-auto h-8 w-8 text-muted-foreground/40" />
                  <p className="mt-2 text-sm text-muted-foreground">
                    {te.pipelineIdle}
                  </p>
                </div>
              )}

              {pipelineStatus === 'processing' && (
                <div className="py-8 text-center">
                  <Loader2 className="mx-auto h-8 w-8 animate-spin text-emerald-500" />
                  <p className="mt-2 text-sm text-muted-foreground">
                    {te.pipelineProcessing}
                  </p>
                </div>
              )}

              {pipelineStatus === 'error' && (
                <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3">
                  <p className="text-xs font-medium text-red-600 dark:text-red-400">{te.pipelineError}</p>
                  <p className="mt-1 text-xs text-red-500/80">{pipelineError}</p>
                  <button
                    onClick={handleProcess}
                    className="mt-2 text-xs font-medium text-red-600 underline dark:text-red-400"
                  >
                    {te.pipelineRetry}
                  </button>
                </div>
              )}

              {pipelineStatus === 'success' && pipelineResult && (
                <PipelineResultsPanel result={pipelineResult} />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
