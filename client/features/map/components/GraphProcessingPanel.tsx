/**
 * Painel de Processamento de Grafo
 *
 * Interface para processar grafo e subdividir arestas longas
 */

"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useGraphProcessing } from "../hooks/useGraphProcessing";
import type { MapNode } from "../types";
import { Loader2, Play, Check, X, Undo2, BarChart3 } from "lucide-react";

interface GraphProcessingPanelProps {
  streets: GeoJSON.FeatureCollection | null;
  nodes: MapNode[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApply?: (payload: { streets: GeoJSON.FeatureCollection; nodes: MapNode[] }) => void;
}

export function GraphProcessingPanel({
  streets,
  nodes,
  open,
  onOpenChange,
  onApply,
}: GraphProcessingPanelProps) {
  const [maxEdgeLength, setMaxEdgeLength] = useState(100);
  const [preserveElevations, setPreserveElevations] = useState(true);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [analysisDialog, setAnalysisDialog] = useState<{
    open: boolean;
    data: {
      needsSubdivision: number;
      totalNodesNeeded: number;
      skippedEdges: number;
    } | null;
  }>({ open: false, data: null });
  const [errorDialog, setErrorDialog] = useState<{
    open: boolean;
    message: string;
  }>({ open: false, message: "" });

  const {
    isProcessing,
    result,
    canUndo,
    analyzeEdges,
    processGraph,
    applyResult,
    reset,
    undo,
  } = useGraphProcessing(streets, nodes, {
    onApply: (payload) => {
      onApply?.(payload);
      onOpenChange(false);
    },
    onError: (error) => {
      console.error("Erro ao processar grafo:", error);
      setErrorDialog({ open: true, message: error.message });
    },
  });

  const handleAnalyze = useCallback(async () => {
    const analysis = await analyzeEdges(maxEdgeLength);

    setAnalysisDialog({
      open: true,
      data: {
        needsSubdivision: analysis.needsSubdivision,
        totalNodesNeeded: analysis.totalNodesNeeded,
        skippedEdges: analysis.skippedEdges,
      },
    });
    setShowAnalysis(true);
  }, [analyzeEdges, maxEdgeLength]);

  const handleProcess = useCallback(async () => {
    if (maxEdgeLength <= 0) {
      setErrorDialog({
        open: true,
        message: "O comprimento máximo deve ser maior que zero",
      });
      return;
    }

    try {
      await processGraph({
        maxEdgeLength,
        preserveElevations,
      });
    } catch (error) {
      console.error("Erro ao processar:", error);
      const err = error instanceof Error ? error : new Error("Erro desconhecido");
      setErrorDialog({ open: true, message: err.message });
    }
  }, [processGraph, maxEdgeLength, preserveElevations]);

  const handleApply = useCallback(() => {
    try {
      applyResult();
    } catch (error) {
      console.error("Erro ao aplicar:", error);
    }
  }, [applyResult]);

  const handleCancel = useCallback(() => {
    reset();
    onOpenChange(false);
  }, [reset, onOpenChange]);

  const handleUndo = useCallback(() => {
    undo();
  }, [undo]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Processamento de Grafo</SheetTitle>
          <SheetDescription>
            Subdivida arestas longas para normalizar o comprimento das arestas
            do grafo
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-6 py-6">
          {/* Inputs */}
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label
                htmlFor="maxEdgeLength"
                className="text-sm font-medium text-foreground"
              >
                Comprimento Máximo da Aresta (metros)
              </label>
              <Input
                id="maxEdgeLength"
                type="number"
                min="1"
                step="1"
                value={maxEdgeLength}
                onChange={(e) => setMaxEdgeLength(Number(e.target.value))}
                placeholder="100"
                disabled={isProcessing}
              />
              <p className="text-xs text-muted-foreground">
                Arestas maiores que este valor serão subdivididas
              </p>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="preserveElevations"
                checked={preserveElevations}
                onChange={(e) => setPreserveElevations(e.target.checked)}
                disabled={isProcessing}
                className="h-4 w-4 rounded border-gray-300"
              />
              <label
                htmlFor="preserveElevations"
                className="text-sm text-foreground cursor-pointer"
              >
                Preservar elevações (interpolar)
              </label>
            </div>
          </div>

          {/* Botões de ação */}
          <div className="flex flex-col gap-2">
            <Button
              onClick={handleAnalyze}
              disabled={isProcessing || nodes.length === 0 || !streets}
              variant="outline"
              className="w-full"
            >
              <BarChart3 className="h-4 w-4 mr-2" />
              Analisar Arestas
            </Button>

            <Button
              onClick={handleProcess}
              disabled={
                isProcessing || nodes.length === 0 || maxEdgeLength <= 0 || !streets
              }
              className="w-full"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processando...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Processar Grafo
                </>
              )}
            </Button>
          </div>

          {/* Estatísticas */}
          {result && (
            <div className="rounded-lg border bg-muted/50 p-4">
              <h3 className="text-sm font-semibold mb-3">Resultado</h3>
              <div className="flex flex-col gap-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Nós originais:</span>
                  <span className="font-medium">{result.originalNodeCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Novos nós criados:
                  </span>
                  <span className="font-medium text-green-600">
                    {result.newNodeCount}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Arestas processadas:
                  </span>
                  <span className="font-medium">{result.processedEdges}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Arestas ignoradas:
                  </span>
                  <span className="font-medium">{result.skippedEdges}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tempo:</span>
                  <span className="font-medium">
                    {result.processingTime.toFixed(2)}ms
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        <SheetFooter className="flex flex-col gap-2 sm:flex-row">
          {result && (
            <>
              <Button
                onClick={handleApply}
                disabled={isProcessing}
                className="flex-1"
              >
                <Check className="h-4 w-4 mr-2" />
                Aplicar
              </Button>
              {canUndo && (
                <Button
                  onClick={handleUndo}
                  disabled={isProcessing}
                  variant="outline"
                  className="flex-1"
                >
                  <Undo2 className="h-4 w-4 mr-2" />
                  Desfazer
                </Button>
              )}
              <Button
                onClick={handleCancel}
                disabled={isProcessing}
                variant="outline"
                className="flex-1"
              >
                <X className="h-4 w-4 mr-2" />
                Cancelar
              </Button>
            </>
          )}
          {!result && (
            <Button
              onClick={handleCancel}
              disabled={isProcessing}
              variant="outline"
              className="w-full"
            >
              Fechar
            </Button>
          )}
        </SheetFooter>
      </SheetContent>

      {/* Dialog de Análise */}
      <AlertDialog
        open={analysisDialog.open}
        onOpenChange={(open) =>
          setAnalysisDialog((prev) => ({ ...prev, open }))
        }
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Análise de Arestas</AlertDialogTitle>
            <AlertDialogDescription>
              Resultado da análise do grafo com comprimento máximo de{" "}
              {maxEdgeLength}m
            </AlertDialogDescription>
          </AlertDialogHeader>
          {analysisDialog.data && (
            <div className="flex flex-col gap-3 py-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">
                  Arestas que precisam subdivisão:
                </span>
                <span className="font-semibold text-orange-600">
                  {analysisDialog.data.needsSubdivision}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">
                  Total de nós intermediários necessários:
                </span>
                <span className="font-semibold text-blue-600">
                  {analysisDialog.data.totalNodesNeeded}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">
                  Arestas que não precisam processamento:
                </span>
                <span className="font-semibold text-green-600">
                  {analysisDialog.data.skippedEdges}
                </span>
              </div>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setAnalysisDialog({ open: false, data: null })}>
              Entendi
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog de Erro */}
      <AlertDialog
        open={errorDialog.open}
        onOpenChange={(open) =>
          setErrorDialog((prev) => ({ ...prev, open }))
        }
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Erro</AlertDialogTitle>
            <AlertDialogDescription>{errorDialog.message}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              onClick={() => setErrorDialog({ open: false, message: "" })}
            >
              Fechar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
}
