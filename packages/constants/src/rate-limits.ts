export const RATE_LIMITS = {
  STREETS_FETCH: {
    maxRequests: 10,
    windowMs: 60000,
  },
  TOPOGRAPHY_FETCH: {
    maxRequests: 5,
    windowMs: 60000,
  },
  NODE_OPERATIONS: {
    maxRequests: 100,
    windowMs: 60000,
  },
} as const;
