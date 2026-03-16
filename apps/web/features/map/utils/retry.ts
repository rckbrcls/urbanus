/**
 * Retry — app wrapper with React hook.
 */

import { useState, useCallback, useRef } from "react";
import { withRetry } from "@urbanus/utils";
import type { RetryOptions } from "@urbanus/utils";

// Re-export pure functions
export { withRetry, isRetryableError, fetchWithRetry } from "@urbanus/utils";
export type { RetryOptions } from "@urbanus/utils";

// ============ HOOK ============

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
