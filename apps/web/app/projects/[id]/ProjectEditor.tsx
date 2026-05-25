'use client';

import { useDeleteProject, useUpdateProject } from '../../../stores/useProjectStore';
import type { Project } from '../../../stores/useProjectStore';
import { useRouter } from 'next/navigation';
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { ArrowLeft, Trash2, Download, Save, Undo2, Redo2, Network, MousePointer, Plus, Move, X, Scissors, Loader2, Mountain, Eye, EyeOff, Cable, PanelRightOpen, PanelRightClose, Map as MapIcon, MapPin, Ruler } from 'lucide-react';
import { graphToSewerNetwork, sewerNetworkToGraph } from '@/lib/graph/sewerConversion';

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
import { getStoreAccessor, useCommandManager } from '@/stores/commandManager';
import { mapNodesToNetworkGraph } from '@/lib/graph/serialization';
import type { EditingMode } from '@/lib/graph/types';
import { usePipelineStore } from '@/stores/pipelineStore';
import { PipelineResultsPanel } from '@/components/pipeline/PipelineResultsPanel';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { Kbd } from '@/components/ui/kbd';
import { useTranslation } from '@/i18n';
import type { SewerViewMode } from '@/components/map/SewerNetworkLayers';
import { ReplaceGraphCommand } from '@/lib/graph/commands';
import {
  RENDERED_NODE_ORDER,
  type RenderedNodeCategory,
  type VisibleRenderedNodeCategories,
} from '@/lib/sewer/renderLegend';

// Dynamic imports (no SSR — MapLibre uses WebGL)
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

// ============ MAIN COMPONENT ============

export function ProjectEditor({ project, isLoading }: ProjectEditorProps) {
  const router = useRouter();
  const { mutateAsync: deleteProject } = useDeleteProject();
  const { mutateAsync: updateProject } = useUpdateProject();
  const te = useTranslation('editor');
  const tc = useTranslation('common');
  const undoLabel = tc.undo ?? 'Undo';
  const redoLabel = tc.redo ?? 'Redo';
  const viewModeLabels = {
    default: te.viewModes?.default ?? 'Default',
    elevation: te.viewModes?.elevation ?? te.elevationView,
    streets: te.viewModes?.streets ?? te.streets,
  };
  const viewModeTooltip = te.viewModeTooltip ?? 'View mode';
  const showEdgeLengthsLabel = te.showEdgeLengths ?? 'Show edge lengths';
  const showNodeElevationsLabel = te.showNodeElevations ?? 'Show node elevations';
  const edgeLengthLabelsTitle = te.edgeLengthLabels ?? 'Edge length labels';
  const nodeElevationLabelsTitle = te.nodeElevationLabels ?? 'Node elevation labels';
  const showOriginalGraphTitle = te.showOriginalGraph ?? 'Show original graph';
  const showProcessedNetworkTitle = te.showProcessedNetwork ?? 'Show processed network';
  const closePanelTitle = te.closePanel ?? 'Close panel';
  const selectedNodeElevationLabel = te.selectedNodeElevation ?? te.elevationView;

  const [activeTab, setActiveTab] = useState<'overview' | 'streets' | 'pipeline'>('overview');
  const [isMounted, setIsMounted] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isHydratingProject, setIsHydratingProject] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const hydratedProjectIdRef = useRef<string | null>(null);
  const hasHydratedProjectRef = useRef(false);
  const hydrationRunRef = useRef(0);
  const skipNextGraphChangeRef = useRef(false);
  const skipNextPipelineChangeRef = useRef(false);

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
  const executeCommand = useCommandManager((s) => s.execute);
  const clearCommands = useCommandManager((s) => s.clear);

  // Pipeline store
  const pipelineStatus = usePipelineStore((s) => s.status);
  const pipelineResult = usePipelineStore((s) => s.result);
  const pipelineError = usePipelineStore((s) => s.error);
  const processProject = usePipelineStore((s) => s.processProject);
  const resetPipeline = usePipelineStore((s) => s.reset);
  const hydratePipeline = usePipelineStore((s) => s.hydrateResult);
  const toggleView = usePipelineStore((s) => s.toggleView);
  const hasCachedResult = usePipelineStore((s) => s._cachedResult !== null);
  const getGraph = useGraphStore((s) => s.getGraph);

  // Save pre-processing graph so we can restore on toggle
  const preProcessGraphRef = useRef<ReturnType<typeof getGraph> | null>(null);

  // Sewer view mode
  const [sewerViewMode, setSewerViewMode] = useState<SewerViewMode>('default');
  const [showEdgeLengthLabels, setShowEdgeLengthLabels] = useState(false);
  const [showNodeElevationLabels, setShowNodeElevationLabels] = useState(false);
  const [visibleNodeCategories, setVisibleNodeCategories] = useState<VisibleRenderedNodeCategories>(RENDERED_NODE_ORDER);

  const nodesApiService = useRef(NodesApiService.getInstance()).current;
  const accessor = useMemo(() => getStoreAccessor(), []);

  // ============ MODE BUTTONS ============

  const MODES: { mode: EditingMode; label: string; icon: React.ReactNode; shortcut?: string }[] = useMemo(() => [
    { mode: 'select', label: te.modes.select, icon: <MousePointer className="h-4 w-4" />, shortcut: 'V' },
    { mode: 'move', label: te.modes.move, icon: <Move className="h-4 w-4" />, shortcut: 'M' },
    { mode: 'add-node', label: te.modes.addNode, icon: <Plus className="h-4 w-4" />, shortcut: 'A' },
    { mode: 'add-edge', label: te.modes.addEdge, icon: <Cable className="h-4 w-4" />, shortcut: 'E' },
    { mode: 'delete', label: te.modes.delete, icon: <X className="h-4 w-4" />, shortcut: 'D' },
    { mode: 'split-edge', label: te.modes.split, icon: <Scissors className="h-4 w-4" />, shortcut: 'S' },
  ], [te.modes]);

  const VIEW_MODES: { mode: SewerViewMode; label: string; icon: React.ReactNode }[] = useMemo(() => [
    { mode: 'default', label: viewModeLabels.default, icon: <MapIcon className="h-4 w-4" /> },
    { mode: 'elevation', label: viewModeLabels.elevation, icon: <Mountain className="h-4 w-4" /> },
    { mode: 'streets', label: viewModeLabels.streets, icon: <Cable className="h-4 w-4" /> },
  ], [viewModeLabels.default, viewModeLabels.elevation, viewModeLabels.streets]);

  useEffect(() => {
    setIsMounted(true);
    return () => {
      // Cleanup state when leaving page
      hasHydratedProjectRef.current = false;
      hydratedProjectIdRef.current = null;
      resetGraph();
      clearCommands();
      resetPipeline();
    };
  }, [resetGraph, clearCommands, resetPipeline]);

  // Hydrate editor state from the current project before mounting the map.
  useEffect(() => {
    if (!project || hydratedProjectIdRef.current === project.id) {
      return;
    }

    let cancelled = false;
    const runId = hydrationRunRef.current + 1;
    hydrationRunRef.current = runId;

    hasHydratedProjectRef.current = false;
    hydratedProjectIdRef.current = null;
    preProcessGraphRef.current = null;
    setIsHydratingProject(true);
    setHasChanges(false);
    setActiveTab(project.sewerNetwork ? 'pipeline' : 'overview');

    skipNextGraphChangeRef.current = true;
    resetGraph();
    clearCommands();
    skipNextPipelineChangeRef.current = true;
    resetPipeline();

    const hydrateProject = async () => {
      try {
        if (project.sewerNetwork) {
          if (cancelled || hydrationRunRef.current !== runId) return;
          skipNextPipelineChangeRef.current = true;
          skipNextGraphChangeRef.current = true;
          hydratePipeline(project.sewerNetwork);
          loadGraph(sewerNetworkToGraph(project.sewerNetwork));
        } else {
          const { nodes: extractedNodes } = await nodesApiService.extractNodes(
            project.streets as EnrichedFeatureCollection,
            'all',
          );

          if (cancelled || hydrationRunRef.current !== runId) return;

          const graph = mapNodesToNetworkGraph(extractedNodes);
          skipNextGraphChangeRef.current = true;
          loadGraph(graph);
        }

        hydratedProjectIdRef.current = project.id;
        hasHydratedProjectRef.current = true;
        setHasChanges(false);
      } catch (err) {
        if (cancelled || hydrationRunRef.current !== runId) return;

        hasHydratedProjectRef.current = false;
        hydratedProjectIdRef.current = null;
        console.error('Failed to hydrate project graph:', err);
      } finally {
        if (cancelled || hydrationRunRef.current !== runId) return;
        setIsHydratingProject(false);
      }
    };

    void hydrateProject();

    return () => {
      cancelled = true;
    };
  }, [
    project,
    nodesApiService,
    loadGraph,
    hydratePipeline,
    resetGraph,
    clearCommands,
    resetPipeline,
  ]);

  // Track changes when graph mutates
  useEffect(() => {
    const unsub = useGraphStore.subscribe(
      (s) => [s.nodes, s.edges],
      () => {
        if (skipNextGraphChangeRef.current) {
          skipNextGraphChangeRef.current = false;
          return;
        }
        if (hasHydratedProjectRef.current) setHasChanges(true);
      },
    );
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = usePipelineStore.subscribe(
      (s) => [s.result, s._cachedResult],
      () => {
        if (skipNextPipelineChangeRef.current) {
          skipNextPipelineChangeRef.current = false;
          return;
        }
        if (hasHydratedProjectRef.current) setHasChanges(true);
      },
    );
    return unsub;
  }, []);

  // Keyboard shortcuts for modes
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const modeMap: Record<string, EditingMode> = { v: 'select', m: 'move', a: 'add-node', e: 'add-edge', d: 'delete', s: 'split-edge' };
      const mode = modeMap[e.key.toLowerCase()];
      if (mode) setMode(mode);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [setMode]);

  // ============ HANDLERS ============

  const handleProcess = useCallback(async () => {
    if (!project) return;
    const previousGraph = getGraph();
    preProcessGraphRef.current = previousGraph;
    const previousPipelineState = usePipelineStore.getState();

    // Build edited graph payload from current graphStore
    const editedNodes = Object.values(previousGraph.nodes).map((n) => ({
      id: n.id,
      lng: n.coordinates[0],
      lat: n.coordinates[1],
      elevation: n.properties.elevation,
      node_type: n.properties.nodeType,
      pv_obrigatorio: n.properties.pvObrigatorio ?? false,
      is_intersection: n.properties.isIntersection ?? false,
      is_endpoint: n.properties.isEndpoint ?? false,
      is_collection_point: n.properties.isCollectionPoint ?? false,
    }));
    const editedEdges = Object.values(previousGraph.edges).map((e) => ({
      id: e.id,
      sourceId: e.sourceId,
      targetId: e.targetId,
      length: e.properties.length,
      streetName: e.properties.streetName,
      highway: e.properties.highway,
    }));

    skipNextPipelineChangeRef.current = true;
    await processProject(project.id, { nodes: editedNodes, edges: editedEdges });

    const result = usePipelineStore.getState().result;
    if (result) {
      const processedGraph = sewerNetworkToGraph(result);
      const nextPipelineState = usePipelineStore.getState();

      executeCommand(
        new ReplaceGraphCommand(accessor, previousGraph, processedGraph, {
          description: 'Process graph',
          onExecute: () => {
            usePipelineStore.setState({
              status: nextPipelineState.status,
              result: nextPipelineState.result,
              error: nextPipelineState.error,
              _cachedResult: nextPipelineState._cachedResult,
              selectedNodeId: nextPipelineState.selectedNodeId,
            });
            setActiveTab('pipeline');
          },
          onUndo: () => {
            usePipelineStore.setState({
              status: previousPipelineState.status,
              result: previousPipelineState.result,
              error: previousPipelineState.error,
              _cachedResult: previousPipelineState._cachedResult,
              selectedNodeId: previousPipelineState.selectedNodeId,
            });
            setActiveTab(previousPipelineState.result ? 'pipeline' : 'overview');
          },
        }),
      );
    } else {
      skipNextPipelineChangeRef.current = false;
    }
  }, [project, processProject, getGraph, executeCommand, accessor]);

  const handleToggleView = useCallback(() => {
    const currentResult = usePipelineStore.getState().result;
    if (currentResult) {
      // Switching TO pre-processing view: restore original graph
      if (preProcessGraphRef.current) {
        skipNextGraphChangeRef.current = true;
        loadGraph(preProcessGraphRef.current);
        clearCommands();
      }
    } else {
      // Switching TO processed view: load sewer network into graph
      const cached = usePipelineStore.getState()._cachedResult;
      if (cached) {
        const graph = sewerNetworkToGraph(cached);
        skipNextGraphChangeRef.current = true;
        loadGraph(graph);
        clearCommands();
      }
    }
    skipNextPipelineChangeRef.current = true;
    toggleView();
  }, [toggleView, loadGraph, clearCommands]);

  const handleSave = useCallback(async () => {
    if (!project) return;
    setIsSaving(true);
    try {
      const pipelineState = usePipelineStore.getState();
      const baseSewerNetwork =
        pipelineState.result ??
        pipelineState._cachedResult ??
        project.sewerNetwork ??
        null;
      const sewerNetwork = baseSewerNetwork
        ? graphToSewerNetwork(getGraph(), project.id, baseSewerNetwork)
        : null;

      await updateProject({
        ...project,
        streets: project.streets,
        sewerNetwork,
      });
      if (sewerNetwork) {
        skipNextPipelineChangeRef.current = true;
        hydratePipeline(sewerNetwork);
      }
      setHasChanges(false);
    } catch (error) {
      console.error('Failed to save project:', error);
    } finally {
      setIsSaving(false);
    }
  }, [project, updateProject, getGraph, hydratePipeline]);

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

  // Elevation range from graph nodes (works before and after processing)
  const sewerElevationRange = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;
    let hasElev = false;
    for (const node of Object.values(graphNodes)) {
      const elev = node.properties.elevation;
      if (elev != null) {
        if (elev < min) min = elev;
        if (elev > max) max = elev;
        hasElev = true;
      }
    }
    return hasElev ? { min, max } : null;
  }, [graphNodes]);

  const handleToggleVisibleNodeCategory = useCallback((category: RenderedNodeCategory) => {
    setVisibleNodeCategories((current) =>
      current.includes(category)
        ? current.filter((item) => item !== category)
        : [...current, category],
    );
  }, []);

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

  if (!isMounted || isLoading || isHydratingProject) {
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
          key={project.id}
          center={project.center}
          zoom={project.zoom}
          bounds={project.bounds}
          streetFeatures={project.streets as unknown as GeoJSON.FeatureCollection}
          sewerNetwork={pipelineResult}
          sewerViewMode={sewerViewMode}
          sewerElevationRange={sewerElevationRange}
          visibleNodeCategories={pipelineResult ? visibleNodeCategories : undefined}
          showEdgeLengthLabels={showEdgeLengthLabels}
          showNodeElevationLabels={showNodeElevationLabels}
        />
      </div>

      {/* Top bar — project navigation */}
      <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
        <div className="flex items-center gap-2 rounded-2xl border border-border bg-background/90 px-3 py-2 backdrop-blur-sm">
          <button
            onClick={() => router.push('/projects')}
            className="rounded-lg p-1 text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="h-4 w-px bg-border" />
          <span className="text-xs font-medium text-foreground truncate max-w-[10rem]">{project.name}</span>
          {hasChanges && <span className="text-xs text-amber-500">*</span>}
          <div className="h-4 w-px bg-border" />
          <span className="text-xs text-muted-foreground">
            {project.areaKm2.toFixed(2)} km² &middot; {nodeCount} {te.nodes}
            {selectedNodeIds.length > 0 && ` \u00b7 ${selectedNodeIds.length} ${te.selected}`}
          </span>
        </div>
      </div>

      {/* Editing rail — stays clear of the right panel when it is open */}
      <TooltipProvider>
        <div className={`absolute z-10 flex flex-col items-center gap-1 rounded-2xl border border-border bg-background/90 p-1 backdrop-blur-sm transition-all duration-300 ease-in-out ${sidebarOpen ? 'top-4 right-[22rem]' : 'top-16 right-4'}`}>
          {MODES.map(({ mode, label, icon, shortcut }) => (
            <Tooltip key={mode}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setMode(mode)}
                  aria-label={label}
                  aria-pressed={editingMode === mode}
                  className={`rounded-xl p-2 transition-colors ${
                    editingMode === mode
                      ? 'bg-foreground/10 text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {icon}
                </button>
              </TooltipTrigger>
              <TooltipContent side="left">
                <span className="flex items-center gap-2">{label}{shortcut && <Kbd>{shortcut}</Kbd>}</span>
              </TooltipContent>
            </Tooltip>
          ))}

          <div className="my-1 h-px w-6 bg-border" />

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={commandUndo}
                disabled={!canUndo}
                aria-label={undoLabel}
                className="rounded-xl p-2 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
              >
                <Undo2 className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="left"><span className="flex items-center gap-2">{undoLabel} <Kbd>Ctrl+Z</Kbd></span></TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={commandRedo}
                disabled={!canRedo}
                aria-label={redoLabel}
                className="rounded-xl p-2 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
              >
                <Redo2 className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="left"><span className="flex items-center gap-2">{redoLabel} <Kbd>Ctrl+Shift+Z</Kbd></span></TooltipContent>
          </Tooltip>

          <div className="my-1 h-px w-6 bg-border" />

          {VIEW_MODES.map(({ mode, label, icon }) => (
            <Tooltip key={mode}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setSewerViewMode(mode)}
                  aria-label={`${viewModeTooltip}: ${label}`}
                  aria-pressed={sewerViewMode === mode}
                  className={`rounded-xl p-2 transition-colors ${
                    sewerViewMode === mode
                      ? 'bg-foreground/10 text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {icon}
                </button>
              </TooltipTrigger>
              <TooltipContent side="left">{label}</TooltipContent>
            </Tooltip>
          ))}

          <div className="my-1 h-px w-6 bg-border" />

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setShowEdgeLengthLabels((current) => !current)}
                aria-label={showEdgeLengthsLabel}
                aria-pressed={showEdgeLengthLabels}
                className={`rounded-xl p-2 transition-colors ${
                  showEdgeLengthLabels
                    ? 'bg-blue-500/15 text-blue-600 dark:text-blue-300'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Ruler className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="left">
              <span className="flex flex-col">
                <span>{showEdgeLengthsLabel}</span>
                <span className="text-[10px] text-muted-foreground">{edgeLengthLabelsTitle}</span>
              </span>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setShowNodeElevationLabels((current) => !current)}
                aria-label={showNodeElevationsLabel}
                aria-pressed={showNodeElevationLabels}
                className={`rounded-xl p-2 transition-colors ${
                  showNodeElevationLabels
                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <MapPin className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="left">
              <span className="flex flex-col">
                <span>{showNodeElevationsLabel}</span>
                <span className="text-[10px] text-muted-foreground">{nodeElevationLabelsTitle}</span>
              </span>
            </TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>

      {/* Sidebar open button — fixed at right edge when sidebar is hidden */}
      {!sidebarOpen && (
        <button
          onClick={() => setSidebarOpen(true)}
          className="absolute top-4 right-4 z-10 rounded-2xl border border-border bg-background/90 p-2.5 backdrop-blur-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <PanelRightOpen className="h-4 w-4" />
        </button>
      )}

      {/* Floating Sidebar — right (slide in/out) */}
      <div className={`absolute top-4 right-4 bottom-4 z-10 flex w-80 flex-col overflow-hidden rounded-2xl border border-border bg-background/90 backdrop-blur-sm transition-transform duration-300 ease-in-out ${sidebarOpen ? 'translate-x-0' : 'translate-x-[calc(100%+1rem)]'}`}>
        {/* Action buttons — row 1: icon buttons */}
        <div className="flex items-center gap-1 border-b border-border px-3 py-1.5">
          {(pipelineResult || hasCachedResult) && (
            <button
              onClick={handleToggleView}
              className="rounded-xl p-1.5 text-muted-foreground transition-colors hover:text-foreground"
              title={pipelineResult ? showOriginalGraphTitle : showProcessedNetworkTitle}
            >
              {pipelineResult ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          )}
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
          <button
            onClick={() => setSidebarOpen(false)}
            className="ml-auto rounded-xl p-1.5 text-muted-foreground transition-colors hover:text-foreground"
            title={closePanelTitle}
          >
            <PanelRightClose className="h-4 w-4" />
          </button>
        </div>
        {/* Action buttons — row 2: Save + Process */}
        <div className="flex items-center gap-1.5 border-b border-border px-3 py-2">
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
                            {selectedNodeElevationLabel}: {node.properties.elevation?.toFixed(1) ?? 'N/A'}m
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
                <PipelineResultsPanel
                  result={pipelineResult}
                  visibleCategories={visibleNodeCategories}
                  onToggleCategory={handleToggleVisibleNodeCategory}
                />
              )}
            </div>
          )}
        </div>
      </div>

      {/* Legends — bottom left, contextual */}
      {sewerViewMode === 'elevation' && sewerElevationRange && (
        <div className="absolute bottom-6 left-4 z-10 rounded-2xl border border-border bg-background/90 px-3 py-2 backdrop-blur-sm w-48">
          <div
            className="h-2 w-full rounded-full"
            style={{
              background: 'linear-gradient(to right, #313695, #4575b4, #fee090, #f46d43, #a50026)',
            }}
          />
          <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
            <span>{sewerElevationRange.min.toFixed(0)}m</span>
            <span>{sewerElevationRange.max.toFixed(0)}m</span>
          </div>
        </div>
      )}
      {sewerViewMode === 'streets' && (
        <div className="absolute bottom-6 left-4 z-10 rounded-2xl border border-border bg-background/90 px-3 py-2 backdrop-blur-sm">
          <div className="space-y-1">
            {Object.entries(HIGHWAY_COLORS).map(([type, color]) => (
              <div key={type} className="flex items-center gap-2 text-[10px]">
                <div className="h-2 w-4 rounded-full" style={{ backgroundColor: color }} />
                <span className="capitalize text-muted-foreground">{type}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
