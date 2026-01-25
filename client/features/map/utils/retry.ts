/**
 * Utilitário de Retry
 *
 * Implementa retry com backoff exponencial
 */

export interface RetryOptions {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
  retryCondition?: (error: unknown) => boolean;
  onRetry?: (attempt: number, error: unknown, delay: number) => void;
}

const defaultOptions: Required<
  Omit<RetryOptions, "onRetry" | "retryCondition">
> = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
};

/**
 * Executa uma função com retry e backoff exponencial
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const config = { ...defaultOptions, ...options };
  let lastError: unknown;
  let delay = config.initialDelay;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Verificar se deve retry
      if (config.retryCondition && !config.retryCondition(error)) {
        throw error;
      }

      // Última tentativa, não retry
      if (attempt === config.maxRetries) {
        throw error;
      }

      // Callback de retry
      config.onRetry?.(attempt + 1, error, delay);

      // Esperar antes de tentar novamente
      await sleep(delay);

      // Calcular próximo delay com backoff
      delay = Math.min(delay * config.backoffMultiplier, config.maxDelay);
    }
  }

  throw lastError;
}

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Verifica se um erro é recuperável (deve retry)
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    // Erros de rede geralmente são recuperáveis
    if (error.message.includes("network") || error.message.includes("fetch")) {
      return true;
    }

    // Rate limit deve retry após espera
    if (error.message.includes("rate") || error.message.includes("429")) {
      return true;
    }

    // Timeout deve retry
    if (error.message.includes("timeout")) {
      return true;
    }
  }

  // HTTP errors
  if (typeof error === "object" && error !== null && "status" in error) {
    const status = (error as { status: number }).status;
    // 5xx errors são geralmente recuperáveis
    if (status >= 500 && status < 600) {
      return true;
    }
    // 429 Too Many Requests
    if (status === 429) {
      return true;
    }
  }

  return false;
}

/**
 * Wrapper para fetch com retry
 */
export async function fetchWithRetry(
  url: string,
  options?: RequestInit,
  retryOptions?: RetryOptions,
): Promise<Response> {
  return withRetry(
    async () => {
      const response = await fetch(url, options);

      // Tratar erros HTTP como exceções para retry
      if (!response.ok) {
        const error = new Error(
          `HTTP ${response.status}: ${response.statusText}`,
        );
        (error as Error & { status: number }).status = response.status;
        throw error;
      }

      return response;
    },
    {
      retryCondition: isRetryableError,
      ...retryOptions,
    },
  );
}

// ============ HOOK ============

import { useState, useCallback, useRef } from "react";

interface UseRetryOptions extends RetryOptions {
  onSuccess?: () => void;
  onError?: (error: unknown) => void;
}

export function useRetry<T>(
  fn: () => Promise<T>,
  options: UseRetryOptions = {},
) {
  const [isRetrying, setIsRetrying] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [lastError, setLastError] = useState<unknown>(null);
  const abortRef = useRef(false);

  const { onSuccess, onError, ...retryOptions } = options;

  const execute = useCallback(async (): Promise<T | null> => {
    setIsRetrying(true);
    setAttempt(0);
    setLastError(null);
    abortRef.current = false;

    try {
      const result = await withRetry(fn, {
        ...retryOptions,
        onRetry: (attemptNum, error, delay) => {
          if (abortRef.current) throw new Error("Aborted");
          setAttempt(attemptNum);
          setLastError(error);
          retryOptions.onRetry?.(attemptNum, error, delay);
        },
      });

      onSuccess?.();
      return result;
    } catch (error) {
      setLastError(error);
      onError?.(error);
      return null;
    } finally {
      setIsRetrying(false);
    }
  }, [fn, retryOptions, onSuccess, onError]);

  const abort = useCallback(() => {
    abortRef.current = true;
  }, []);

  return {
    execute,
    abort,
    isRetrying,
    attempt,
    lastError,
  };
}
