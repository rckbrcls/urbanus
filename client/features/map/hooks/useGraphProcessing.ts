/**
 * Hook de Processamento de Grafo (backend)
 *
 * Envia o GeoJSON atual para o servidor e retorna o resultado.
 */

import { useState, useCallback, useMemo } from "react";
import { GraphProcessorService } from "../services/GraphProcessorService";
import { NodesService } from "../services/NodesService";
import type { MapNode } from "../types";
import type {
  GraphProcessingOptions,
  GraphProcessingResult,
  GraphProcessingAnalysis,
} from "../types/graph.types";

interface UseGraphProcessingOptions {
  /** Callback quando processamento é aplicado */
  onApply?: (payload: { streets: GeoJSON.FeatureCollection; nodes: MapNode[] }) => void;
  /** Callback quando ocorre erro */
  onError?: (error: Error) => void;
}

interface UseGraphProcessingReturn {
  // Estado
  isProcessing: boolean;
  result: GraphProcessingResult | null;
  canUndo: boolean;

  // Análise
  analyzeEdges: (maxEdgeLength: number) => Promise<GraphProcessingAnalysis>;

  // Processamento
  processGraph: (options: GraphProcessingOptions) => Promise<GraphProcessingResult>;
  applyResult: () => { streets: GeoJSON.FeatureCollection; nodes: MapNode[] };
  reset: () => void;
  undo: () => { streets: GeoJSON.FeatureCollection; nodes: MapNode[] } | null;
}

interface GraphProcessingSnapshot {
  streets: GeoJSON.FeatureCollection;
  nodes: MapNode[];
}

export function useGraphProcessing(
  streets: GeoJSON.FeatureCollection | null,
  nodes: MapNode[],
  options?: UseGraphProcessingOptions,
): UseGraphProcessingReturn {
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<GraphProcessingResult | null>(null);
  const [history, setHistory] = useState<GraphProcessingSnapshot[]>([]);

  const processor = useMemo(
    () => GraphProcessorService.getInstance(),
    [],
  );
  const nodesService = useMemo(() => NodesService.getInstance(), []);

  const buildCurrentStreets = useCallback(() => {
    if (!streets) {
      throw new Error("Nenhum GeoJSON carregado para processamento");
    }
    return nodesService.applyNodesToStreets(streets, nodes);
  }, [streets, nodes, nodesService]);

  // Análise de arestas (backend)
  const analyzeEdges = useCallback(
    async (maxEdgeLength: number): Promise<GraphProcessingAnalysis> => {
      try {
        if (!streets || nodes.length === 0) {
          return { needsSubdivision: 0, totalNodesNeeded: 0, skippedEdges: 0, totalEdges: 0 };
        }
        const currentStreets = buildCurrentStreets();
        return await processor.analyzeGraph(currentStreets, maxEdgeLength);
      } catch (error) {
        options?.onError?.(error as Error);
        return { needsSubdivision: 0, totalNodesNeeded: 0, skippedEdges: 0, totalEdges: 0 };
      }
    },
    [streets, nodes, buildCurrentStreets, processor, options],
  );

  // Processar grafo
  const processGraph = useCallback(
    async (processingOptions: GraphProcessingOptions): Promise<GraphProcessingResult> => {
      setIsProcessing(true);
      try {
        if (nodes.length === 0) {
          const emptyResult: GraphProcessingResult = {
            originalNodeCount: 0,
            newNodeCount: 0,
            processedEdges: 0,
            skippedEdges: 0,
            processingTime: 0,
            streets: streets ?? { type: "FeatureCollection", features: [] },
            nodes: [],
          };
          setResult(emptyResult);
          return emptyResult;
        }

        const currentStreets = buildCurrentStreets();
        setHistory((prev) => [...prev, { streets: currentStreets, nodes: [...nodes] }]);

        const processingResult = await processor.processGraph(
          currentStreets,
          processingOptions,
        );

        const processedNodes = nodesService.extractNodesFromStreets(
          processingResult.geojson,
        );

        const resultWithNodes: GraphProcessingResult = {
          ...processingResult.stats,
          streets: processingResult.geojson,
          nodes: processedNodes,
        };

        setResult(resultWithNodes);
        return resultWithNodes;
      } catch (error) {
        const err = error instanceof Error ? error : new Error("Erro desconhecido");
        options?.onError?.(err);
        throw err;
      } finally {
        setIsProcessing(false);
      }
    },
    [nodes, streets, buildCurrentStreets, processor, nodesService, options],
  );

  // Aplicar resultado
  const applyResult = useCallback(() => {
    if (!result) {
      throw new Error("Nenhum resultado para aplicar");
    }

    const payload = { streets: result.streets, nodes: result.nodes };
    options?.onApply?.(payload);
    setResult(null);
    setHistory([]);

    return payload;
  }, [result, options]);

  // Resetar
  const reset = useCallback(() => {
    setResult(null);
    setHistory([]);
  }, []);

  // Desfazer
  const undo = useCallback(() => {
    if (history.length === 0) {
      return null;
    }

    const previous = history[history.length - 1];
    setHistory((prev) => prev.slice(0, -1));
    setResult(null);
    options?.onApply?.(previous);

    return previous;
  }, [history, options]);

  const canUndo = history.length > 0;

  return {
    isProcessing,
    result,
    canUndo,
    analyzeEdges,
    processGraph,
    applyResult,
    reset,
    undo,
  };
}
