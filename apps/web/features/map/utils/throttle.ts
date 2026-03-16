/**
 * Throttle — app wrapper with React hook.
 */

import { useCallback, useRef } from "react";
import { throttle } from "@urbanus/utils";

// Re-export pure function
export { throttle } from "@urbanus/utils";

// ============ HOOK ============

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
