'use client';

import { useState } from 'react';
import { Settings as SettingsIcon, Save, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function SettingsPage() {
  const [settings, setSettings] = useState({
    defaultMaxEdgeLength: 100,
    defaultPreserveElevations: true,
    apiTimeout: 30000,
    cacheEnabled: true,
    maxAreaKm2: 100,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<{ success: boolean; message: string } | null>(null);

  const handleSave = async () => {
    setIsSaving(true);
    setSaveStatus(null);

    try {
      // TODO: Implementar salvamento de configurações (localStorage ou API)
      localStorage.setItem('urbanus-settings', JSON.stringify(settings));
      
      await new Promise((resolve) => setTimeout(resolve, 500)); // Simulação
      
      setSaveStatus({
        success: true,
        message: 'Configurações salvas com sucesso!',
      });
    } catch (error) {
      setSaveStatus({
        success: false,
        message: error instanceof Error ? error.message : 'Erro ao salvar configurações',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setSettings({
      defaultMaxEdgeLength: 100,
      defaultPreserveElevations: true,
      apiTimeout: 30000,
      cacheEnabled: true,
      maxAreaKm2: 100,
    });
    setSaveStatus(null);
  };

  return (
    <div className="flex flex-1 flex-col gap-8 p-4 pt-0">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Settings</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Configure as preferências do sistema
        </p>
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col gap-6">
        {/* Processing Settings */}
        <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-lg bg-blue-100 p-2 dark:bg-blue-900/30">
              <SettingsIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                Configurações de Processamento
              </h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Valores padrão para processamento de grafos
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div>
              <label
                htmlFor="defaultMaxEdgeLength"
                className="mb-2 block text-sm font-medium text-zinc-900 dark:text-zinc-100"
              >
                Comprimento Máximo de Aresta Padrão (metros)
              </label>
              <Input
                id="defaultMaxEdgeLength"
                type="number"
                min="1"
                step="1"
                value={settings.defaultMaxEdgeLength}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    defaultMaxEdgeLength: Number(e.target.value),
                  }))
                }
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="defaultPreserveElevations"
                checked={settings.defaultPreserveElevations}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    defaultPreserveElevations: e.target.checked,
                  }))
                }
                className="h-4 w-4 rounded border-gray-300"
              />
              <label
                htmlFor="defaultPreserveElevations"
                className="text-sm text-zinc-700 dark:text-zinc-300 cursor-pointer"
              >
                Preservar elevações por padrão
              </label>
            </div>

            <div>
              <label
                htmlFor="maxAreaKm2"
                className="mb-2 block text-sm font-medium text-zinc-900 dark:text-zinc-100"
              >
                Área Máxima Permitida (km²)
              </label>
              <Input
                id="maxAreaKm2"
                type="number"
                min="1"
                step="0.1"
                value={settings.maxAreaKm2}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    maxAreaKm2: Number(e.target.value),
                  }))
                }
              />
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                Limite máximo para seleção de área no mapa
              </p>
            </div>
          </div>
        </div>

        {/* API Settings */}
        <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-lg bg-green-100 p-2 dark:bg-green-900/30">
              <SettingsIcon className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                Configurações de API
              </h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Configurações de conexão e timeout
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div>
              <label
                htmlFor="apiTimeout"
                className="mb-2 block text-sm font-medium text-zinc-900 dark:text-zinc-100"
              >
                Timeout da API (milissegundos)
              </label>
              <Input
                id="apiTimeout"
                type="number"
                min="1000"
                step="1000"
                value={settings.apiTimeout}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    apiTimeout: Number(e.target.value),
                  }))
                }
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="cacheEnabled"
                checked={settings.cacheEnabled}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    cacheEnabled: e.target.checked,
                  }))
                }
                className="h-4 w-4 rounded border-gray-300"
              />
              <label
                htmlFor="cacheEnabled"
                className="text-sm text-zinc-700 dark:text-zinc-300 cursor-pointer"
              >
                Habilitar cache de dados
              </label>
            </div>
          </div>
        </div>

        {/* Status Message */}
        {saveStatus && (
          <div
            className={`flex items-center gap-3 rounded-lg border p-4 ${
              saveStatus.success
                ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20'
                : 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20'
            }`}
          >
            <p
              className={`text-sm ${
                saveStatus.success
                  ? 'text-green-800 dark:text-green-300'
                  : 'text-red-800 dark:text-red-300'
              }`}
            >
              {saveStatus.message}
            </p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex justify-end gap-3">
          <Button onClick={handleReset} variant="outline" disabled={isSaving}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Restaurar Padrões
          </Button>
          <Button onClick={handleSave} disabled={isSaving} className="min-w-[120px]">
            {isSaving ? (
              <>
                <Save className="mr-2 h-4 w-4 animate-pulse" />
                Salvando...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Salvar Configurações
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
