'use client';

import type { SewerNetwork } from '@/types/sewer';
import { useTranslation } from '@/i18n';
import { cn } from '@/lib/utils';
import {
  getRenderedNodeCategory,
  isRenderedNodeCategoryVisible,
  RENDERED_NODE_COLORS,
  RENDERED_NODE_ORDER,
  type RenderedNodeCategory,
  type VisibleRenderedNodeCategories,
} from '@/lib/sewer/renderLegend';

interface PipelineResultsPanelProps {
  result: SewerNetwork;
  visibleCategories: VisibleRenderedNodeCategories;
  onToggleCategory: (category: RenderedNodeCategory) => void;
}

export function PipelineResultsPanel({
  result,
  visibleCategories,
  onToggleCategory,
}: PipelineResultsPanelProps) {
  const t = useTranslation('pipeline');
  const renderedNodeLabels: Record<RenderedNodeCategory, string> = {
    COLLECTION_POINT: t.nodeLabels.collectionPoint,
    PV: t.nodeLabels.pv,
  };

  const renderedNodeCount = result.nodes.reduce<Record<RenderedNodeCategory, number>>((acc, node) => {
    const category = getRenderedNodeCategory(node);
    acc[category] += 1;
    return acc;
  }, {
    COLLECTION_POINT: 0,
    PV: 0,
  });

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

      {/* Map Legend */}
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          {t.nodeTypes}
        </h3>
        <div className="space-y-1">
          {RENDERED_NODE_ORDER
            .filter((category) => renderedNodeCount[category] > 0)
            .map((category) => (
              <button
                key={category}
                type="button"
                aria-pressed={isRenderedNodeCategoryVisible(category, visibleCategories)}
                onClick={() => onToggleCategory(category)}
                className={cn(
                  'flex w-full items-center justify-between rounded-md border px-2 py-1 text-xs transition-colors',
                  isRenderedNodeCategoryVisible(category, visibleCategories)
                    ? 'border-transparent bg-transparent text-zinc-900 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-800/70'
                    : 'border-zinc-200/80 bg-zinc-50/80 text-zinc-400 opacity-65 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-500 dark:hover:bg-zinc-800/70',
                )}
              >
                <div className="flex items-center gap-2">
                  <div
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: RENDERED_NODE_COLORS[category] }}
                  />
                  <span>{renderedNodeLabels[category]}</span>
                </div>
                <span className="font-mono text-zinc-500 dark:text-zinc-400">{renderedNodeCount[category]}</span>
              </button>
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
