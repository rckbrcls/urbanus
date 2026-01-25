'use client';

import { useState } from 'react';
import { Network, BarChart3, GitBranch, TrendingUp, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function AnalysisPage() {
  const [maxEdgeLength, setMaxEdgeLength] = useState(100);
  const [showStats, setShowStats] = useState(false);

  // Mock data - será substituído por dados reais
  const graphStats = {
    totalNodes: 0,
    totalEdges: 0,
    averageDegree: 0,
    maxEdgeLength: 0,
    minEdgeLength: 0,
    edgesNeedingSubdivision: 0,
  };

  const handleAnalyze = () => {
    // TODO: Implementar análise de grafo
    setShowStats(true);
  };

  return (
    <div className="flex flex-1 flex-col gap-8 p-4 pt-0">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Graph Analysis</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Análise detalhada e processamento de grafos urbanos
        </p>
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col gap-6">
        {/* Processing Parameters */}
        <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-lg bg-blue-100 p-2 dark:bg-blue-900/30">
              <GitBranch className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                Parâmetros de Processamento
              </h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Configure os parâmetros para normalização de arestas
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div>
              <label
                htmlFor="maxEdgeLength"
                className="mb-2 block text-sm font-medium text-zinc-900 dark:text-zinc-100"
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
              />
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                Arestas maiores que este valor serão subdivididas
              </p>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="preserveElevations"
                defaultChecked
                className="h-4 w-4 rounded border-gray-300"
              />
              <label
                htmlFor="preserveElevations"
                className="text-sm text-zinc-700 dark:text-zinc-300 cursor-pointer"
              >
                Preservar elevações (interpolar)
              </label>
            </div>

            <Button onClick={handleAnalyze} className="w-full sm:w-auto">
              <BarChart3 className="mr-2 h-4 w-4" />
              Analisar Grafo
            </Button>
          </div>
        </div>

        {/* Statistics */}
        {showStats && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">Total de Nós</p>
                  <p className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                    {graphStats.totalNodes}
                  </p>
                </div>
                <div className="rounded-lg bg-blue-100 p-2 dark:bg-blue-900/30">
                  <Network className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">Total de Arestas</p>
                  <p className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                    {graphStats.totalEdges}
                  </p>
                </div>
                <div className="rounded-lg bg-green-100 p-2 dark:bg-green-900/30">
                  <GitBranch className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">Grau Médio</p>
                  <p className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                    {graphStats.averageDegree.toFixed(2)}
                  </p>
                </div>
                <div className="rounded-lg bg-purple-100 p-2 dark:bg-purple-900/30">
                  <TrendingUp className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">Aresta Mais Longa</p>
                  <p className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                    {graphStats.maxEdgeLength.toFixed(1)}m
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">Aresta Mais Curta</p>
                  <p className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                    {graphStats.minEdgeLength.toFixed(1)}m
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    Arestas que Precisam Subdivisão
                  </p>
                  <p className="mt-1 text-2xl font-bold text-orange-600 dark:text-orange-400">
                    {graphStats.edgesNeedingSubdivision}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Info Message */}
        <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
          <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-blue-900 dark:text-blue-300">
              Como usar a Análise de Grafos
            </p>
            <p className="mt-1 text-sm text-blue-800 dark:text-blue-400">
              Selecione uma área no mapa primeiro para carregar os dados. Em seguida, configure o
              comprimento máximo das arestas e analise o grafo. O sistema identificará quais arestas
              precisam ser subdivididas para normalizar o comprimento.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
