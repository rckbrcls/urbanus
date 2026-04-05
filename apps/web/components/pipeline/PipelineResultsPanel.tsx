'use client';

import type { SewerNetwork } from '@/types/sewer';
import { useTranslation } from '@/i18n';

interface PipelineResultsPanelProps {
  result: SewerNetwork;
}

const NODE_TYPE_COLORS: Record<string, string> = {
  ROSA: '#e91e63',
  VERDE: '#4caf50',
  AMARELO: '#ffc107',
  AZUL_ESCURO: '#1565c0',
};

const NODE_TYPE_LABELS: Record<string, string> = {
  ROSA: 'Obrigatório (interseção/confluência)',
  VERDE: 'Intermediário',
  AMARELO: 'Ponto alto',
  AZUL_ESCURO: 'Ponto baixo (coleta)',
  OTHER: 'Outro',
};

const ACCESSORY_LABELS: Record<string, string> = {
  PV: 'Poço de Visita',
  TIL: 'Terminal de Inspeção e Limpeza',
  TL: 'Terminal de Limpeza',
  CP: 'Caixa de Passagem',
  NONE: 'Sem acessório',
};

export function PipelineResultsPanel({ result }: PipelineResultsPanelProps) {
  const t = useTranslation('pipeline');

  const nodesByType = result.nodes.reduce<Record<string, number>>((acc, n) => {
    const type = n.node_type ?? 'OTHER';
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});

  const accessoryCount = result.nodes.reduce<Record<string, number>>((acc, n) => {
    const type = n.accessory_type ?? 'NONE';
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});

  const diameterCount = result.pipes.reduce<Record<number, number>>((acc, p) => {
    acc[p.diameter_mm] = (acc[p.diameter_mm] || 0) + 1;
    return acc;
  }, {});

  const totalLength = result.edges.reduce((sum, e) => sum + e.length_m, 0);

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          {t.networkSummary}
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <Stat label={t.nodes} value={result.nodes.length} />
          <Stat label={t.segments} value={result.edges.length} />
          <Stat label={t.length} value={`${(totalLength / 1000).toFixed(2)} km`} />
          <Stat label={t.pumpStations} value={result.pump_stations.length} />
          <Stat
            label={t.totalCost}
            value={
              result.total_cost
                ? `R$ ${(result.total_cost / 1000).toFixed(0)}k`
                : '-'
            }
          />
          <Stat label={t.unreachable} value={result.unreachable_nodes.length} />
        </div>
      </div>

      {/* Node Types */}
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          {t.nodeTypes}
        </h3>
        <div className="space-y-1">
          {Object.entries(nodesByType)
            .sort((a, b) => b[1] - a[1])
            .map(([type, count]) => (
              <div key={type} className="flex items-center justify-between rounded px-2 py-1 text-xs">
                <div className="flex items-center gap-2">
                  <div
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: NODE_TYPE_COLORS[type] || '#9e9e9e' }}
                  />
                  <span className="text-zinc-700 dark:text-zinc-300">{NODE_TYPE_LABELS[type] ?? type}</span>
                </div>
                <span className="font-mono text-zinc-500">{count}</span>
              </div>
            ))}
        </div>
      </div>

      {/* Accessories */}
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          {t.accessories}
        </h3>
        <div className="space-y-1">
          {Object.entries(accessoryCount)
            .sort((a, b) => b[1] - a[1])
            .map(([type, count]) => (
              <div key={type} className="flex items-center justify-between rounded px-2 py-1 text-xs">
                <span className="text-zinc-700 dark:text-zinc-300">{ACCESSORY_LABELS[type] ?? type}</span>
                <span className="font-mono text-zinc-500">{count}</span>
              </div>
            ))}
        </div>
      </div>

      {/* Pipe Diameters */}
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          {t.diameters}
        </h3>
        <div className="space-y-1">
          {Object.entries(diameterCount)
            .sort((a, b) => Number(a[0]) - Number(b[0]))
            .map(([dn, count]) => (
              <div key={dn} className="flex items-center justify-between rounded px-2 py-1 text-xs">
                <span className="text-zinc-700 dark:text-zinc-300">{dn} mm</span>
                <span className="font-mono text-zinc-500">{count}</span>
              </div>
            ))}
        </div>
      </div>

      {/* Pump Stations */}
      {result.pump_stations.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            {t.pumpStations}
          </h3>
          <div className="space-y-2">
            {result.pump_stations.map((ps) => (
              <div key={ps.id} className="rounded-lg bg-orange-50 p-2 text-xs dark:bg-orange-900/20">
                <p className="font-medium text-orange-900 dark:text-orange-100">{ps.id}</p>
                <p className="text-orange-600 dark:text-orange-400">
                  {ps.capacity_ls} L/s | H={ps.head_m}m | VPL R$ {((ps.npv ?? 0) / 1000).toFixed(0)}k
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-zinc-50 p-2 dark:bg-zinc-800/50">
      <p className="text-[10px] text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="mt-0.5 text-sm font-bold text-zinc-900 dark:text-zinc-100">{value}</p>
    </div>
  );
}
