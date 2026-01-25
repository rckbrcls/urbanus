'use client';

import { useState } from 'react';
import { Download, FileJson, FileText, FileSpreadsheet, Map, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useProjects } from '@/stores/useProjectStore';

export default function ExportPage() {
  const { data: projects = [] } = useProjects();
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [exportFormat, setExportFormat] = useState<'geojson' | 'csv' | 'json' | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState<{ success: boolean; message: string } | null>(
    null,
  );

  const handleExport = async () => {
    if (!selectedProject || !exportFormat) return;

    setIsExporting(true);
    setExportStatus(null);

    try {
      const project = projects.find((p) => p.id === selectedProject);
      if (!project) throw new Error('Projeto não encontrado');

      let data: string;
      let filename: string;
      let mimeType: string;

      switch (exportFormat) {
        case 'geojson':
          data = JSON.stringify(project.streets, null, 2);
          filename = `${project.name.replace(/\s+/g, '_')}.geojson`;
          mimeType = 'application/geo+json';
          break;
        case 'json':
          data = JSON.stringify(project, null, 2);
          filename = `${project.name.replace(/\s+/g, '_')}.json`;
          mimeType = 'application/json';
          break;
        case 'csv':
          // Converter GeoJSON para CSV simples
          const csvRows: string[] = ['street_id,name,type,min_elevation,max_elevation,avg_elevation'];
          project.streets.features.forEach((feature, index) => {
            const props = feature.properties || {};
            csvRows.push(
              `${index},${props.name || ''},${props.highway || ''},${props.elevation?.min || ''},${props.elevation?.max || ''},${props.elevation?.avg || ''}`,
            );
          });
          data = csvRows.join('\n');
          filename = `${project.name.replace(/\s+/g, '_')}.csv`;
          mimeType = 'text/csv';
          break;
        default:
          throw new Error('Formato não suportado');
      }

      // Criar blob e fazer download
      const blob = new Blob([data], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setExportStatus({
        success: true,
        message: `Arquivo ${filename} exportado com sucesso!`,
      });
    } catch (error) {
      setExportStatus({
        success: false,
        message: error instanceof Error ? error.message : 'Erro ao exportar dados',
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col gap-8 p-4 pt-0">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Export</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Exporte dados processados em diferentes formatos
        </p>
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col gap-6">
        {/* Project Selection */}
        <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-lg bg-blue-100 p-2 dark:bg-blue-900/30">
              <Map className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                Selecionar Projeto
              </h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Escolha o projeto que deseja exportar
              </p>
            </div>
          </div>

          {projects.length === 0 ? (
            <div className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50 p-8 text-center dark:border-zinc-700 dark:bg-zinc-800/50">
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Nenhum projeto disponível. Crie um projeto no mapa primeiro.
              </p>
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((project) => (
                <button
                  key={project.id}
                  onClick={() => setSelectedProject(project.id)}
                  className={`rounded-lg border p-4 text-left transition-colors ${
                    selectedProject === project.id
                      ? 'border-blue-500 bg-blue-50 dark:border-blue-500 dark:bg-blue-900/20'
                      : 'border-zinc-200 bg-white hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800/50'
                  }`}
                >
                  <p className="font-medium text-zinc-900 dark:text-zinc-100">{project.name}</p>
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    {project.stats?.streetCount || 0} ruas
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Format Selection */}
        {selectedProject && (
          <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="mb-4 flex items-center gap-3">
              <div className="rounded-lg bg-green-100 p-2 dark:bg-green-900/30">
                <Download className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                  Formato de Exportação
                </h2>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  Escolha o formato do arquivo exportado
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <button
                onClick={() => setExportFormat('geojson')}
                className={`flex flex-col items-center gap-3 rounded-lg border p-4 transition-colors ${
                  exportFormat === 'geojson'
                    ? 'border-blue-500 bg-blue-50 dark:border-blue-500 dark:bg-blue-900/20'
                    : 'border-zinc-200 bg-white hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800/50'
                }`}
              >
                <FileJson className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                <div className="text-center">
                  <p className="font-medium text-zinc-900 dark:text-zinc-100">GeoJSON</p>
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    Formato padrão para dados geográficos
                  </p>
                </div>
              </button>

              <button
                onClick={() => setExportFormat('json')}
                className={`flex flex-col items-center gap-3 rounded-lg border p-4 transition-colors ${
                  exportFormat === 'json'
                    ? 'border-blue-500 bg-blue-50 dark:border-blue-500 dark:bg-blue-900/20'
                    : 'border-zinc-200 bg-white hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800/50'
                }`}
              >
                <FileText className="h-8 w-8 text-purple-600 dark:text-purple-400" />
                <div className="text-center">
                  <p className="font-medium text-zinc-900 dark:text-zinc-100">JSON</p>
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    Dados completos do projeto
                  </p>
                </div>
              </button>

              <button
                onClick={() => setExportFormat('csv')}
                className={`flex flex-col items-center gap-3 rounded-lg border p-4 transition-colors ${
                  exportFormat === 'csv'
                    ? 'border-blue-500 bg-blue-50 dark:border-blue-500 dark:bg-blue-900/20'
                    : 'border-zinc-200 bg-white hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800/50'
                }`}
              >
                <FileSpreadsheet className="h-8 w-8 text-green-600 dark:text-green-400" />
                <div className="text-center">
                  <p className="font-medium text-zinc-900 dark:text-zinc-100">CSV</p>
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    Planilha com dados resumidos
                  </p>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* Status Message */}
        {exportStatus && (
          <div
            className={`flex items-center gap-3 rounded-lg border p-4 ${
              exportStatus.success
                ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20'
                : 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20'
            }`}
          >
            {exportStatus.success ? (
              <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
            ) : (
              <CheckCircle2 className="h-5 w-5 text-red-600 dark:text-red-400" />
            )}
            <p
              className={`text-sm ${
                exportStatus.success
                  ? 'text-green-800 dark:text-green-300'
                  : 'text-red-800 dark:text-red-300'
              }`}
            >
              {exportStatus.message}
            </p>
          </div>
        )}

        {/* Export Button */}
        {selectedProject && exportFormat && (
          <div className="flex justify-end">
            <Button onClick={handleExport} disabled={isExporting} className="min-w-[120px]">
              {isExporting ? (
                <>
                  <Download className="mr-2 h-4 w-4 animate-pulse" />
                  Exportando...
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  Exportar
                </>
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
