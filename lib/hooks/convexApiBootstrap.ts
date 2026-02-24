// Avoid importing api directly to prevent deep type instantiation.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ConvexApi = any;

let cachedApi: ConvexApi;
let didReportBootstrapFailure = false;

function reportBootstrapFailure(error: unknown): void {
  if (didReportBootstrapFailure) {
    return;
  }
  if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
    return;
  }

  didReportBootstrapFailure = true;
  console.error(
    'Failed to load generated Convex API from "@/convex/_generated/api". Falling back to an empty API object.',
    error,
  );
}

export function getConvexApi(): ConvexApi {
  if (cachedApi) {
    return cachedApi;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- avoids deep type instantiation from generated Convex API
    cachedApi = require('@/convex/_generated/api').api;
  } catch (error: unknown) {
    reportBootstrapFailure(error);
    cachedApi = {};
  }

  return cachedApi;
}
