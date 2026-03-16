/**
 * Rate Limiter — pure class, no React dependency.
 *
 * Sliding window rate limiter for API calls.
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

  register(key: string, config: RateLimitConfig): void {
    this.configs.set(key, config);
    this.states.set(key, {
      requests: [],
      blocked: false,
      blockedUntil: null,
    });
  }

  acquire(key: string): { allowed: boolean; retryAfter?: number } {
    const config = this.configs.get(key);
    const state = this.states.get(key);

    if (!config || !state) {
      return { allowed: true };
    }

    const now = Date.now();

    if (state.blocked && state.blockedUntil) {
      if (now < state.blockedUntil) {
        return {
          allowed: false,
          retryAfter: state.blockedUntil - now,
        };
      }
      state.blocked = false;
      state.blockedUntil = null;
    }

    const windowStart = now - config.windowMs;
    state.requests = state.requests.filter((time) => time > windowStart);

    if (state.requests.length >= config.maxRequests) {
      state.blocked = true;
      state.blockedUntil = now + (config.retryAfterMs ?? config.windowMs);
      return {
        allowed: false,
        retryAfter: config.retryAfterMs ?? config.windowMs,
      };
    }

    state.requests.push(now);
    return { allowed: true };
  }

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

  reset(key: string): void {
    const state = this.states.get(key);
    if (state) {
      state.requests = [];
      state.blocked = false;
      state.blockedUntil = null;
    }
  }

  resetAll(): void {
    this.states.forEach((_, key) => this.reset(key));
  }
}
