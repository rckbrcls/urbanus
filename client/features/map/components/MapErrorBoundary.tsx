/**
 * Error Boundary para o Mapa
 *
 * Captura erros no React tree e exibe UI de fallback
 */

'use client';

import React, { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
    onError?: (error: Error, errorInfo: ErrorInfo) => void;
    onReset?: () => void;
}

interface State {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
}

export class MapErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = {
            hasError: false,
            error: null,
            errorInfo: null,
        };
    }

    static getDerivedStateFromError(error: Error): Partial<State> {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
        this.setState({ errorInfo });
        this.props.onError?.(error, errorInfo);

        // Log erro
        console.error('MapErrorBoundary caught error:', error);
        console.error('Component stack:', errorInfo.componentStack);
    }

    handleReset = (): void => {
        this.setState({
            hasError: false,
            error: null,
            errorInfo: null,
        });
        this.props.onReset?.();
    };

    render(): ReactNode {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }

            return (
                <MapErrorFallback
                    error={this.state.error}
                    onReset={this.handleReset}
                />
            );
        }

        return this.props.children;
    }
}

// ============ FALLBACK COMPONENT ============

interface MapErrorFallbackProps {
    error: Error | null;
    onReset?: () => void;
}

export function MapErrorFallback({ error, onReset }: MapErrorFallbackProps) {
    const isNetworkError = error?.message.includes('network') || error?.message.includes('fetch');
    const isTimeoutError = error?.message.includes('timeout');

    return (
        <div className="flex h-full w-full flex-col items-center justify-center bg-zinc-100 p-8 dark:bg-zinc-900">
            <div className="max-w-md rounded-xl bg-white p-6 text-center shadow-lg dark:bg-zinc-800">
                {/* Ícone */}
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/20">
                    <svg
                        className="h-8 w-8 text-red-600 dark:text-red-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                        />
                    </svg>
                </div>

                {/* Título */}
                <h2 className="mb-2 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                    {isNetworkError
                        ? 'Erro de Conexão'
                        : isTimeoutError
                            ? 'Tempo Esgotado'
                            : 'Algo deu errado'}
                </h2>

                {/* Mensagem */}
                <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
                    {isNetworkError
                        ? 'Não foi possível conectar ao servidor. Verifique sua conexão.'
                        : isTimeoutError
                            ? 'A operação demorou muito. Tente novamente.'
                            : 'Ocorreu um erro inesperado ao carregar o mapa.'}
                </p>

                {/* Detalhes do erro (em dev) */}
                {process.env.NODE_ENV === 'development' && error && (
                    <details className="mb-4 text-left">
                        <summary className="cursor-pointer text-xs text-zinc-500">
                            Detalhes técnicos
                        </summary>
                        <pre className="mt-2 max-h-32 overflow-auto rounded bg-zinc-100 p-2 text-xs text-red-600 dark:bg-zinc-700 dark:text-red-400">
                            {error.message}
                            {'\n'}
                            {error.stack}
                        </pre>
                    </details>
                )}

                {/* Ações */}
                <div className="flex gap-3">
                    <button
                        onClick={() => window.location.reload()}
                        className="flex-1 rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-700"
                    >
                        Recarregar Página
                    </button>
                    {onReset && (
                        <button
                            onClick={onReset}
                            className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                        >
                            Tentar Novamente
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

// ============ HOOK PARA ERRO MANUAL ============

import { useState, useCallback } from 'react';

export function useMapError() {
    const [error, setError] = useState<Error | null>(null);

    const throwError = useCallback((err: Error | string) => {
        const error = typeof err === 'string' ? new Error(err) : err;
        setError(error);
    }, []);

    const clearError = useCallback(() => {
        setError(null);
    }, []);

    // Se tiver erro, lança para o ErrorBoundary capturar
    if (error) {
        throw error;
    }

    return {
        throwError,
        clearError,
    };
}
