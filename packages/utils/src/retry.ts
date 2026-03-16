/**
 * Retry with exponential backoff — pure functions, no React dependency.
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

      if (config.retryCondition && !config.retryCondition(error)) {
        throw error;
      }

      if (attempt === config.maxRetries) {
        throw error;
      }

      config.onRetry?.(attempt + 1, error, delay);

      await sleep(delay);

      delay = Math.min(delay * config.backoffMultiplier, config.maxDelay);
    }
  }

  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isRetryableError(error: unknown): boolean {
  if (typeof error === "object" && error !== null && "status" in error) {
    const status = (error as { status: number }).status;
    if (typeof status === "number") {
      if (status >= 500 && status < 600) {
        return true;
      }
      if (status === 429) {
        return true;
      }
    }
  }

  if (error instanceof Error) {
    if (error.message.includes("network") || error.message.includes("fetch")) {
      return true;
    }

    if (error.message.includes("rate") || error.message.includes("429")) {
      return true;
    }

    if (
      error.message.includes("timeout") ||
      error.message.includes("Timeout") ||
      error.message.includes("too busy")
    ) {
      return true;
    }

    if (error.message.includes("Overpass")) {
      return true;
    }
  }

  return false;
}

export async function fetchWithRetry(
  url: string,
  options?: RequestInit,
  retryOptions?: RetryOptions,
): Promise<Response> {
  return withRetry(
    async () => {
      const response = await fetch(url, options);

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
