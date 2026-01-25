/**
 * Hook de Processamento de Grafo
 *
 * Gerencia o estado e operações de processamento de grafo
 * para subdivisão de arestas longas.
 */

import { useState, useCallback, useMemo } from "react";
import { GraphProcessorService } from "../services/GraphProcessorService";
import type { MapNode } from "../types";
import type {
  GraphProcessingOptions,
  GraphProcessingResult,
  EdgeAnalysis,
} from "../types/graph.types";

interface UseGraphProcessingOptions {
  /** Callback quando processamento é aplicado */
  onApply?: (nodes: MapNode[]) => void;
  /** Callback quando ocorre erro */
  onError?: (error: Error) => void;
}

interface UseGraphProcessingReturn {
  // Estado
  isProcessing: boolean;
  result: GraphProcessingResult | null;
  canUndo: boolean;

  // Análise
  analyzeEdges: (maxEdgeLength: number) => EdgeAnalysis[];

  // Processamento
  processGraph: (
    options: GraphProcessingOptions,
  ) => Promise<GraphProcessingResult>;
  applyResult: () => MapNode[];
  reset: () => void;
  undo: () => MapNode[] | null;
}

export function useGraphProcessing(
  nodes: MapNode[],
  options?: UseGraphProcessingOptions,
): UseGraphProcessingReturn {
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<GraphProcessingResult | null>(null);
  const [history, setHistory] = useState<MapNode[][]>([]);

  const processor = useMemo(
    () => GraphProcessorService.getInstance(),
    [],
  );

  // Análise de arestas
  const analyzeEdges = useCallback(
    (maxEdgeLength: number): EdgeAnalysis[] => {
      try {
        return processor.analyzeEdges(nodes, maxEdgeLength);
      } catch (error) {
        options?.onError?.(error as Error);
        return [];
      }
    },
    [nodes, processor, options],
  );

  // Processar grafo
  const processGraph = useCallback(
    async (processingOptions: GraphProcessingOptions): Promise<GraphProcessingResult> => {
      setIsProcessing(true);
      try {
        // Salvar estado atual no histórico
        setHistory((prev) => [...prev, [...nodes]]);

        // Processar
        const processingResult = processor.processGraph(
          nodes,
          processingOptions,
        );

        setResult(processingResult);
        return processingResult;
      } catch (error) {
        const err = error instanceof Error ? error : new Error("Erro desconhecido");
        options?.onError?.(err);
        throw err;
      } finally {
        setIsProcessing(false);
      }
    },
    [nodes, processor, options],
  );

  // Aplicar resultado
  const applyResult = useCallback((): MapNode[] => {
    if (!result) {
      throw new Error("Nenhum resultado para aplicar");
    }

    const processedNodes = result.nodes;
    options?.onApply?.(processedNodes);
    setResult(null);
    setHistory([]);

    return processedNodes;
  }, [result, options]);

  // Resetar
  const reset = useCallback(() => {
    setResult(null);
    setHistory([]);
  }, []);

  // Desfazer
  const undo = useCallback((): MapNode[] | null => {
    if (history.length === 0) {
      return null;
    }

    const previousNodes = history[history.length - 1];
    setHistory((prev) => prev.slice(0, -1));
    setResult(null);
    options?.onApply?.(previousNodes);

    return previousNodes;
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
