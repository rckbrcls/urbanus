/**
 * Rate Limiter — app wrapper with global singleton and React hook.
 */

import { useState, useCallback, useEffect } from "react";
import { RateLimiter } from "@urbanus/utils";

// Re-export pure class
export { RateLimiter } from "@urbanus/utils";

// ============ SINGLETON GLOBAL ============

let globalRateLimiter: RateLimiter | null = null;

export function getGlobalRateLimiter(): RateLimiter {
  if (!globalRateLimiter) {
    globalRateLimiter = new RateLimiter();

    globalRateLimiter.register("streets", {
      maxRequests: 10,
      windowMs: 60000,
      retryAfterMs: 5000,
    });

    globalRateLimiter.register("topography", {
      maxRequests: 5,
      windowMs: 60000,
      retryAfterMs: 10000,
    });

    globalRateLimiter.register("nodeOperations", {
      maxRequests: 100,
      windowMs: 60000,
    });
  }

  return globalRateLimiter;
}

// ============ HOOK ============

export function useRateLimit(key: string) {
  const limiter = getGlobalRateLimiter();
  const [status, setStatus] = useState(limiter.getStatus(key));

  const checkLimit = useCallback(() => {
    return limiter.acquire(key);
  }, [limiter, key]);

  const refreshStatus = useCallback(() => {
    setStatus(limiter.getStatus(key));
  }, [limiter, key]);

  useEffect(() => {
    if (status?.blocked) {
      const interval = setInterval(refreshStatus, 1000);
      return () => clearInterval(interval);
    }
  }, [status?.blocked, refreshStatus]);

  return {
    status,
    checkLimit,
    refreshStatus,
    reset: () => limiter.reset(key),
  };
}
