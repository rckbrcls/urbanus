'use client';

import { useState } from 'react';
import { Upload, FileSpreadsheet, FileText, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function ImportPage() {
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [coordinates, setCoordinates] = useState({
    bottomLeft: { x: '', y: '' },
    topRight: { x: '', y: '' },
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error' | null; message: string }>({
    type: null,
    message: '',
  });

  const handleExcelUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
      setExcelFile(file);
      setStatus({ type: null, message: '' });
    } else {
      setStatus({ type: 'error', message: 'Por favor, selecione um arquivo Excel válido (.xlsx)' });
    }
  };

  const handlePdfUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type === 'application/pdf') {
      setPdfFile(file);
      setStatus({ type: null, message: '' });
    } else {
      setStatus({ type: 'error', message: 'Por favor, selecione um arquivo PDF válido' });
    }
  };

  const handleImport = async () => {
    setIsProcessing(true);
    setStatus({ type: null, message: '' });

    try {
      // TODO: Implementar lógica de importação
      // - Upload de Excel para processar dados de segmentos
      // - Upload de PDF com georreferenciamento
      
      await new Promise((resolve) => setTimeout(resolve, 1000)); // Simulação
      
      setStatus({
        type: 'success',
        message: 'Dados importados com sucesso!',
      });
    } catch (error) {
      setStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'Erro ao importar dados',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col gap-8 p-4 pt-0">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Data Import</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Importe dados de planilhas Excel e mapas PDF para processamento
        </p>
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col gap-6">
        {/* Excel Upload Section */}
        <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-lg bg-blue-100 p-2 dark:bg-blue-900/30">
              <FileSpreadsheet className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                Planilha Excel
              </h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Upload de arquivo Excel com dados de segmentos (source/target)
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-4">
              <Input
                type="file"
                accept=".xlsx"
                onChange={handleExcelUpload}
                className="flex-1"
                disabled={isProcessing}
              />
            </div>

            {excelFile && (
              <div className="flex items-center gap-2 rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800/50">
                <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                <span className="text-sm text-zinc-700 dark:text-zinc-300">{excelFile.name}</span>
              </div>
            )}

            <div className="rounded-lg bg-zinc-50 p-3 text-xs text-zinc-600 dark:bg-zinc-800/50 dark:text-zinc-400">
              <p className="font-medium mb-1">Formato esperado:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Primeira coluna: coordenadas de origem (source) no formato "X,Y"</li>
                <li>Segunda coluna: coordenadas de destino (target) no formato "X,Y"</li>
              </ul>
            </div>
          </div>
        </div>

        {/* PDF Upload Section */}
        <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-lg bg-purple-100 p-2 dark:bg-purple-900/30">
              <FileText className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                Mapa de Fundo (PDF)
              </h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Upload de arquivo PDF com georreferenciamento
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-4">
              <Input
                type="file"
                accept=".pdf"
                onChange={handlePdfUpload}
                className="flex-1"
                disabled={isProcessing}
              />
            </div>

            {pdfFile && (
              <div className="flex items-center gap-2 rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800/50">
                <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                <span className="text-sm text-zinc-700 dark:text-zinc-300">{pdfFile.name}</span>
              </div>
            )}

            {/* Coordinates Input */}
            {pdfFile && (
              <div className="flex flex-col gap-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/50">
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  Coordenadas de Georreferenciamento
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                      Canto Inferior Esquerdo (X)
                    </label>
                    <Input
                      type="number"
                      step="any"
                      placeholder="0.0"
                      value={coordinates.bottomLeft.x}
                      onChange={(e) =>
                        setCoordinates((prev) => ({
                          ...prev,
                          bottomLeft: { ...prev.bottomLeft, x: e.target.value },
                        }))
                      }
                      disabled={isProcessing}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                      Canto Inferior Esquerdo (Y)
                    </label>
                    <Input
                      type="number"
                      step="any"
                      placeholder="0.0"
                      value={coordinates.bottomLeft.y}
                      onChange={(e) =>
                        setCoordinates((prev) => ({
                          ...prev,
                          bottomLeft: { ...prev.bottomLeft, y: e.target.value },
                        }))
                      }
                      disabled={isProcessing}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                      Canto Superior Direito (X)
                    </label>
                    <Input
                      type="number"
                      step="any"
                      placeholder="0.0"
                      value={coordinates.topRight.x}
                      onChange={(e) =>
                        setCoordinates((prev) => ({
                          ...prev,
                          topRight: { ...prev.topRight, x: e.target.value },
                        }))
                      }
                      disabled={isProcessing}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                      Canto Superior Direito (Y)
                    </label>
                    <Input
                      type="number"
                      step="any"
                      placeholder="0.0"
                      value={coordinates.topRight.y}
                      onChange={(e) =>
                        setCoordinates((prev) => ({
                          ...prev,
                          topRight: { ...prev.topRight, y: e.target.value },
                        }))
                      }
                      disabled={isProcessing}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Status Message */}
        {status.type && (
          <div
            className={`flex items-center gap-3 rounded-lg border p-4 ${
              status.type === 'success'
                ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20'
                : 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20'
            }`}
          >
            {status.type === 'success' ? (
              <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
            ) : (
              <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
            )}
            <p
              className={`text-sm ${
                status.type === 'success'
                  ? 'text-green-800 dark:text-green-300'
                  : 'text-red-800 dark:text-red-300'
              }`}
            >
              {status.message}
            </p>
          </div>
        )}

        {/* Action Button */}
        <div className="flex justify-end">
          <Button
            onClick={handleImport}
            disabled={isProcessing || (!excelFile && !pdfFile)}
            className="min-w-[120px]"
          >
            {isProcessing ? (
              <>
                <Upload className="mr-2 h-4 w-4 animate-pulse" />
                Processando...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Importar Dados
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
