/**
 * Throttle utility function
 * Limits how often a function can be called
 */

export function throttle<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  let previous = 0;

  return function (this: any, ...args: Parameters<T>) {
    const now = Date.now();
    const remaining = wait - (now - previous);

    if (remaining <= 0 || remaining > wait) {
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
      previous = now;
      func.apply(this, args);
    } else if (!timeout) {
      timeout = setTimeout(() => {
        previous = Date.now();
        timeout = null;
        func.apply(this, args);
      }, remaining);
    }
  };
}

/**
 * React hook for throttled callbacks
 */
import { useCallback, useRef } from 'react';

export function useThrottle<T extends (...args: any[]) => any>(
  callback: T,
  wait: number
): T {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  const throttledRef = useRef(
    throttle((...args: Parameters<T>) => {
      callbackRef.current(...args);
    }, wait)
  );

  return throttledRef.current as T;
}
