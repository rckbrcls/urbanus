/**
 * Diálogo de Confirmação de Crop
 *
 * Exibe confirmação antes de confirmar a seleção de área
 */

'use client';

import { useMapContext } from '../context/MapContext';
import { AREA_LIMITS } from '../constants';

export function CropConfirmDialog() {
    const {
        showCropConfirm,
        pendingBbox,
        bboxArea,
        validationError,
        confirmBbox,
        cancelBbox,
    } = useMapContext();

    if (!showCropConfirm || !pendingBbox) return null;

    const isValid = bboxArea <= AREA_LIMITS.MAX_BBOX_AREA_KM2 && !validationError;
    const isWarning = bboxArea > AREA_LIMITS.BBOX_AREA_WARNING_THRESHOLD && isValid;

    return (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="mx-4 w-full max-w-md rounded-xl bg-white p-6 shadow-2xl dark:bg-zinc-800">
                {/* Header */}
                <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                    Confirmar Seleção
                </h2>

                {/* Info */}
                <div className="mb-4 space-y-3">
                    <div className="flex justify-between text-sm">
                        <span className="text-zinc-500 dark:text-zinc-400">Área selecionada:</span>
                        <span
                            className={`font-medium ${isValid ? 'text-zinc-900 dark:text-zinc-100' : 'text-red-600 dark:text-red-400'
                                }`}
                        >
                            {bboxArea.toFixed(2)} km²
                        </span>
                    </div>

                    <div className="flex justify-between text-sm">
                        <span className="text-zinc-500 dark:text-zinc-400">Limite máximo:</span>
                        <span className="text-zinc-600 dark:text-zinc-300">
                            {AREA_LIMITS.MAX_BBOX_AREA_KM2} km²
                        </span>
                    </div>

                    {/* Progress bar */}
                    <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
                        <div
                            className={`h-full transition-all ${isValid
                                    ? isWarning
                                        ? 'bg-amber-500'
                                        : 'bg-green-500'
                                    : 'bg-red-500'
                                }`}
                            style={{
                                width: `${Math.min((bboxArea / AREA_LIMITS.MAX_BBOX_AREA_KM2) * 100, 100)}%`,
                            }}
                        />
                    </div>
                </div>

                {/* Warning */}
                {isWarning && (
                    <div className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-900/20 dark:text-amber-400">
                        ⚠️ Áreas grandes podem demorar mais para processar.
                    </div>
                )}

                {/* Error */}
                {!isValid && (
                    <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/20 dark:text-red-400">
                        {validationError || `Área excede o limite de ${AREA_LIMITS.MAX_BBOX_AREA_KM2} km²`}
                    </div>
                )}

                {/* Actions */}
                <div className="flex gap-3">
                    <button
                        onClick={cancelBbox}
                        className="flex-1 rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-700"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={confirmBbox}
                        disabled={!isValid}
                        className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        Confirmar
                    </button>
                </div>

                {/* Hint */}
                <p className="mt-4 text-center text-xs text-zinc-500 dark:text-zinc-400">
                    Segure Shift e arraste para selecionar uma nova área
                </p>
            </div>
        </div>
    );
}
