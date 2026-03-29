import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { withRetry, isRetryableError } from "./retry";

describe("withRetry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("succeeds on first attempt → no retry", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const promise = withRetry(fn, { maxRetries: 3, initialDelay: 100 });
    const result = await promise;
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("fails then succeeds → retries work", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValueOnce("ok");

    const promise = withRetry(fn, { maxRetries: 3, initialDelay: 10 });
    // Advance timers to let the sleep resolve
    await vi.advanceTimersByTimeAsync(100);
    const result = await promise;
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("exceeds maxRetries → throws last error", async () => {
    vi.useRealTimers();
    const fn = vi.fn().mockRejectedValue(new Error("persistent"));

    await expect(
      withRetry(fn, { maxRetries: 2, initialDelay: 1, maxDelay: 5 })
    ).rejects.toThrow("persistent");
    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it("non-retryable error → throws immediately", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("bad request"));

    const promise = withRetry(fn, {
      maxRetries: 3,
      initialDelay: 10,
      retryCondition: () => false,
    });

    await expect(promise).rejects.toThrow("bad request");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("calls onRetry callback", async () => {
    const onRetry = vi.fn();
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValueOnce("ok");

    const promise = withRetry(fn, { maxRetries: 3, initialDelay: 10, onRetry });
    await vi.advanceTimersByTimeAsync(100);
    await promise;

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(1, expect.any(Error), 10);
  });
});

describe("isRetryableError", () => {
  it("status 500 → true", () => {
    expect(isRetryableError({ status: 500 })).toBe(true);
  });

  it("status 503 → true", () => {
    expect(isRetryableError({ status: 503 })).toBe(true);
  });

  it("status 429 → true", () => {
    expect(isRetryableError({ status: 429 })).toBe(true);
  });

  it("status 400 → false", () => {
    expect(isRetryableError({ status: 400 })).toBe(false);
  });

  it("status 404 → false", () => {
    expect(isRetryableError({ status: 404 })).toBe(false);
  });

  it("network error → true", () => {
    expect(isRetryableError(new Error("network error"))).toBe(true);
  });

  it("timeout error → true", () => {
    expect(isRetryableError(new Error("Request timeout"))).toBe(true);
  });

  it("Overpass error → true", () => {
    expect(isRetryableError(new Error("Overpass server busy"))).toBe(true);
  });

  it("generic error → false", () => {
    expect(isRetryableError(new Error("something went wrong"))).toBe(false);
  });

  it("null → false", () => {
    expect(isRetryableError(null)).toBe(false);
  });
});
