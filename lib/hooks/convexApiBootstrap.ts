// Avoid importing api directly to prevent deep type instantiation.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ConvexApi = any;

type ModuleRequire = (moduleId: string) => unknown;

let cachedApi: ConvexApi | undefined;
let didReportBootstrapFailure = false;

function defaultModuleRequire(moduleId: string): unknown {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- avoids deep type instantiation from generated Convex API
  return require(moduleId);
}

let moduleRequire: ModuleRequire = defaultModuleRequire;

function reportBootstrapFailure(error: unknown): void {
  if (didReportBootstrapFailure) {
    return;
  }
  if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
    return;
  }

  didReportBootstrapFailure = true;
  console.error(
    'Failed to load generated Convex API from "@/convex/_generated/api". Falling back to an untyped Convex API proxy.',
    error,
  );
}

function loadGeneratedApi(): ConvexApi {
  return (moduleRequire('@/convex/_generated/api') as { api: ConvexApi }).api;
}

function loadFallbackApiProxy(): ConvexApi {
  try {
    const fallback = moduleRequire('convex/server') as { anyApi?: ConvexApi };
    if (fallback?.anyApi !== undefined) {
      return fallback.anyApi;
    }
  } catch {
    // Return an empty API object if the fallback proxy isn't available.
  }
  return {};
}

export function __setModuleRequireForTests(requireFn: ModuleRequire): void {
  if (process.env.NODE_ENV !== 'test') {
    return;
  }
  moduleRequire = requireFn;
}

export function __resetConvexApiBootstrapForTests(): void {
  if (process.env.NODE_ENV !== 'test') {
    return;
  }
  cachedApi = undefined;
  didReportBootstrapFailure = false;
  moduleRequire = defaultModuleRequire;
}

export function getConvexApi(): ConvexApi {
  if (cachedApi !== undefined) {
    return cachedApi;
  }

  try {
    cachedApi = loadGeneratedApi();
  } catch (generatedApiError: unknown) {
    reportBootstrapFailure(generatedApiError);
    cachedApi = loadFallbackApiProxy();
  }

  return cachedApi;
}
