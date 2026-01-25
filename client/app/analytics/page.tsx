'use client';

import { useProjects } from '@/stores/useProjectStore';
import { BarChart3, TrendingUp, MapPin, Layers, Activity } from 'lucide-react';

export default function AnalyticsPage() {
  const { data: projects = [], isLoading } = useProjects();

  // Calcular estatísticas agregadas
  const stats = {
    totalProjects: projects.length,
    totalStreets: projects.reduce((sum, p) => sum + (p.stats?.streetCount || 0), 0),
    totalArea: projects.reduce((sum, p) => {
      const bounds = p.bounds;
      if (bounds) {
        const latDiff = bounds.northEast.lat - bounds.southWest.lat;
        const lngDiff = bounds.northEast.lng - bounds.southWest.lng;
        // Aproximação simples da área em km²
        const area = latDiff * lngDiff * 111 * 111; // Conversão aproximada
        return sum + area;
      }
      return sum;
    }, 0),
    averageElevation: 0, // TODO: Calcular a partir dos dados de elevação
  };

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-8 p-4 pt-0">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Analytics</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Estatísticas e análises agregadas de todos os projetos
        </p>
      </div>

      {/* Statistics Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Total de Projetos</p>
              <p className="mt-1 text-3xl font-bold text-zinc-900 dark:text-zinc-100">
                {stats.totalProjects}
              </p>
            </div>
            <div className="rounded-lg bg-blue-100 p-3 dark:bg-blue-900/30">
              <BarChart3 className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Total de Ruas</p>
              <p className="mt-1 text-3xl font-bold text-zinc-900 dark:text-zinc-100">
                {stats.totalStreets}
              </p>
            </div>
            <div className="rounded-lg bg-green-100 p-3 dark:bg-green-900/30">
              <Layers className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Área Total (km²)</p>
              <p className="mt-1 text-3xl font-bold text-zinc-900 dark:text-zinc-100">
                {stats.totalArea.toFixed(2)}
              </p>
            </div>
            <div className="rounded-lg bg-purple-100 p-3 dark:bg-purple-900/30">
              <MapPin className="h-6 w-6 text-purple-600 dark:text-purple-400" />
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Elevação Média</p>
              <p className="mt-1 text-3xl font-bold text-zinc-900 dark:text-zinc-100">
                {stats.averageElevation > 0 ? `${stats.averageElevation.toFixed(1)}m` : 'N/A'}
              </p>
            </div>
            <div className="rounded-lg bg-orange-100 p-3 dark:bg-orange-900/30">
              <TrendingUp className="h-6 w-6 text-orange-600 dark:text-orange-400" />
            </div>
          </div>
        </div>
      </div>

      {/* Projects List */}
      {projects.length > 0 ? (
        <div className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div className="border-b border-zinc-200 p-4 dark:border-zinc-800">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Projetos Recentes
            </h2>
          </div>
          <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {projects.slice(0, 5).map((project) => (
              <div
                key={project.id}
                className="flex items-center justify-between p-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
              >
                <div className="flex-1">
                  <p className="font-medium text-zinc-900 dark:text-zinc-100">{project.name}</p>
                  <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                    {project.stats?.streetCount || 0} ruas • Criado em{' '}
                    {new Date(project.createdAt || Date.now()).toLocaleDateString('pt-BR')}
                  </p>
                </div>
                <div className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
                  <Activity className="h-4 w-4" />
                  <span>Ativo</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 py-20 dark:border-zinc-800 dark:bg-zinc-900/50">
          <div className="mb-4 rounded-full bg-zinc-100 p-4 dark:bg-zinc-800">
            <BarChart3 className="h-8 w-8 text-zinc-400" />
          </div>
          <h3 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">
            Nenhum projeto ainda
          </h3>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Crie projetos no mapa para ver estatísticas aqui.
          </p>
        </div>
      )}

      {/* Future Charts Placeholder */}
      <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Gráficos e Visualizações
        </h2>
        <div className="flex items-center justify-center rounded-lg border-2 border-dashed border-zinc-200 bg-zinc-50 py-12 dark:border-zinc-700 dark:bg-zinc-800/50">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Gráficos de distribuição de elevações, densidade de ruas e comparações entre projetos
            serão exibidos aqui em breve.
          </p>
        </div>
      </div>
    </div>
  );
}
