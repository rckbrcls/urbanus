import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RateLimiter } from "./rate-limiter";

describe("RateLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("unregistered key → always allowed", () => {
    const limiter = new RateLimiter();
    expect(limiter.acquire("unknown")).toEqual({ allowed: true });
  });

  it("respects maxRequests", () => {
    const limiter = new RateLimiter();
    limiter.register("api", { maxRequests: 3, windowMs: 60_000 });

    expect(limiter.acquire("api").allowed).toBe(true);
    expect(limiter.acquire("api").allowed).toBe(true);
    expect(limiter.acquire("api").allowed).toBe(true);
    expect(limiter.acquire("api").allowed).toBe(false);
  });

  it("returns retryAfter when blocked", () => {
    const limiter = new RateLimiter();
    limiter.register("api", { maxRequests: 1, windowMs: 60_000, retryAfterMs: 5_000 });

    limiter.acquire("api");
    const result = limiter.acquire("api");
    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBe(5_000);
  });

  it("allows after window expires", () => {
    const limiter = new RateLimiter();
    limiter.register("api", { maxRequests: 1, windowMs: 1_000 });

    limiter.acquire("api");
    expect(limiter.acquire("api").allowed).toBe(false);

    // Advance past window + block
    vi.advanceTimersByTime(2_000);

    expect(limiter.acquire("api").allowed).toBe(true);
  });

  it("getStatus returns null for unknown key", () => {
    const limiter = new RateLimiter();
    expect(limiter.getStatus("unknown")).toBeNull();
  });

  it("getStatus returns correct remaining", () => {
    const limiter = new RateLimiter();
    limiter.register("api", { maxRequests: 5, windowMs: 60_000 });

    limiter.acquire("api");
    limiter.acquire("api");

    const status = limiter.getStatus("api")!;
    expect(status.remaining).toBe(3);
    expect(status.total).toBe(5);
    expect(status.blocked).toBe(false);
  });

  it("reset clears state", () => {
    const limiter = new RateLimiter();
    limiter.register("api", { maxRequests: 1, windowMs: 60_000 });

    limiter.acquire("api");
    expect(limiter.acquire("api").allowed).toBe(false);

    limiter.reset("api");
    expect(limiter.acquire("api").allowed).toBe(true);
  });

  it("resetAll clears all keys", () => {
    const limiter = new RateLimiter();
    limiter.register("a", { maxRequests: 1, windowMs: 60_000 });
    limiter.register("b", { maxRequests: 1, windowMs: 60_000 });

    limiter.acquire("a");
    limiter.acquire("b");

    limiter.resetAll();
    expect(limiter.acquire("a").allowed).toBe(true);
    expect(limiter.acquire("b").allowed).toBe(true);
  });
});
