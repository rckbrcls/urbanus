/**
 * Rate Limiter
 *
 * Implementa rate limiting para APIs com sliding window
 */

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  retryAfterMs?: number;
}

interface RateLimitState {
  requests: number[];
  blocked: boolean;
  blockedUntil: number | null;
}

export class RateLimiter {
  private states: Map<string, RateLimitState> = new Map();
  private configs: Map<string, RateLimitConfig> = new Map();

  /**
   * Registra um endpoint com configuração de rate limit
   */
  register(key: string, config: RateLimitConfig): void {
    this.configs.set(key, config);
    this.states.set(key, {
      requests: [],
      blocked: false,
      blockedUntil: null,
    });
  }

  /**
   * Tenta adquirir um slot para fazer request
   * Retorna true se permitido, false se bloqueado
   */
  acquire(key: string): { allowed: boolean; retryAfter?: number } {
    const config = this.configs.get(key);
    const state = this.states.get(key);

    if (!config || !state) {
      // Se não configurado, permite
      return { allowed: true };
    }

    const now = Date.now();

    // Verifica se está bloqueado
    if (state.blocked && state.blockedUntil) {
      if (now < state.blockedUntil) {
        return {
          allowed: false,
          retryAfter: state.blockedUntil - now,
        };
      }
      // Desbloqueia
      state.blocked = false;
      state.blockedUntil = null;
    }

    // Remove requests fora da janela
    const windowStart = now - config.windowMs;
    state.requests = state.requests.filter((time) => time > windowStart);

    // Verifica se excede limite
    if (state.requests.length >= config.maxRequests) {
      state.blocked = true;
      state.blockedUntil = now + (config.retryAfterMs ?? config.windowMs);
      return {
        allowed: false,
        retryAfter: config.retryAfterMs ?? config.windowMs,
      };
    }

    // Registra request
    state.requests.push(now);
    return { allowed: true };
  }

  /**
   * Retorna status atual de um endpoint
   */
  getStatus(key: string): {
    remaining: number;
    total: number;
    resetIn: number;
    blocked: boolean;
  } | null {
    const config = this.configs.get(key);
    const state = this.states.get(key);

    if (!config || !state) return null;

    const now = Date.now();
    const windowStart = now - config.windowMs;
    const activeRequests = state.requests.filter((time) => time > windowStart);

    return {
      remaining: Math.max(0, config.maxRequests - activeRequests.length),
      total: config.maxRequests,
      resetIn:
        activeRequests.length > 0
          ? Math.max(0, activeRequests[0] + config.windowMs - now)
          : 0,
      blocked:
        state.blocked &&
        state.blockedUntil !== null &&
        now < state.blockedUntil,
    };
  }

  /**
   * Reseta rate limit de um endpoint
   */
  reset(key: string): void {
    const state = this.states.get(key);
    if (state) {
      state.requests = [];
      state.blocked = false;
      state.blockedUntil = null;
    }
  }

  /**
   * Reseta todos os endpoints
   */
  resetAll(): void {
    this.states.forEach((_, key) => this.reset(key));
  }
}

// ============ SINGLETON GLOBAL ============

let globalRateLimiter: RateLimiter | null = null;

export function getGlobalRateLimiter(): RateLimiter {
  if (!globalRateLimiter) {
    globalRateLimiter = new RateLimiter();

    // Registrar endpoints padrão
    globalRateLimiter.register("streets", {
      maxRequests: 10,
      windowMs: 60000, // 10 req/min
      retryAfterMs: 5000,
    });

    globalRateLimiter.register("topography", {
      maxRequests: 5,
      windowMs: 60000, // 5 req/min
      retryAfterMs: 10000,
    });

    globalRateLimiter.register("nodeOperations", {
      maxRequests: 100,
      windowMs: 60000, // 100 ops/min
    });
  }

  return globalRateLimiter;
}

// ============ HOOK ============

import { useState, useCallback, useEffect } from "react";

export function useRateLimit(key: string) {
  const limiter = getGlobalRateLimiter();
  const [status, setStatus] = useState(limiter.getStatus(key));

  const checkLimit = useCallback(() => {
    return limiter.acquire(key);
  }, [limiter, key]);

  const refreshStatus = useCallback(() => {
    setStatus(limiter.getStatus(key));
  }, [limiter, key]);

  // Atualizar status periodicamente quando bloqueado
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
