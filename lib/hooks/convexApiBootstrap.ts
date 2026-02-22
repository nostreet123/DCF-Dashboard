// Avoid importing api directly to prevent deep type instantiation.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ConvexApi = any;

let cachedApi: ConvexApi;

export function getConvexApi(): ConvexApi {
  if (cachedApi) {
    return cachedApi;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- avoids deep type instantiation from generated Convex API
    cachedApi = require('@/convex/_generated/api').api;
  } catch {
    cachedApi = {};
  }

  return cachedApi;
}
