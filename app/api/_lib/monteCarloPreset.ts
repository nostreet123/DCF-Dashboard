import { createHash } from "crypto";

export type MonteCarloPreset = "off" | "fast" | "default" | "high";

const PRESET_MAP: Record<Exclude<MonteCarloPreset, "off">, { runs: number; bins: number }> = {
  fast: { runs: 1000, bins: 60 },
  default: { runs: 2000, bins: 80 },
  high: { runs: 10000, bins: 100 },
};

type MonteCarloDependence = {
  model: "oneFactor";
  loading: number;
};

export type MonteCarloSpec = {
  runs: number;
  bins: number;
  seed: number;
  dependence?: MonteCarloDependence;
};

type ParsedMonteCarlo = {
  preset: MonteCarloPreset;
  monteCarlo?: MonteCarloSpec;
};

const parseDependence = (): MonteCarloDependence | undefined => {
  const dependenceEnv = process.env.MONTE_CARLO_DEPENDENCE;
  const loadingEnv = process.env.MONTE_CARLO_ONE_FACTOR_LOADING;
  if (dependenceEnv !== "oneFactor") {
    return undefined;
  }
  const parsed = loadingEnv ? Number(loadingEnv) : 0.8;
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed >= 1) {
    return undefined;
  }
  return { model: "oneFactor", loading: parsed };
};

export const parseMonteCarloPreset = (
  request: Request,
  payload: Record<string, unknown>,
): ParsedMonteCarlo => {
  const presetParam = new URL(request.url).searchParams.get("mc");
  if (!presetParam) {
    return { preset: "off" };
  }
  const preset = presetParam.trim().toLowerCase() as MonteCarloPreset;
  if (!["off", "fast", "default", "high"].includes(preset)) {
    throw new Error("Invalid mc parameter");
  }
  if (preset === "off") {
    return { preset };
  }
  const { runs, bins } = PRESET_MAP[preset];
  const seed = buildSeed(payload);
  const dependence = parseDependence();
  return {
    preset,
    monteCarlo: dependence ? { runs, bins, seed, dependence } : { runs, bins, seed },
  };
};

export const sanitizePayload = (payload: Record<string, unknown>): Record<string, unknown> => {
  const sanitized = { ...payload };
  delete sanitized.includeTrace;
  delete sanitized.monteCarlo;
  delete sanitized.monteCarloPreset;
  return sanitized;
};

const buildSeed = (payload: Record<string, unknown>): number => {
  const requestId = typeof payload.requestId === "string" ? payload.requestId : null;
  if (requestId) {
    return hashToSeed(requestId);
  }
  const core = sanitizePayload(payload);
  const stable = stableStringify(core);
  return hashToSeed(stable);
};

const hashToSeed = (value: string): number => {
  const digest = createHash("sha256").update(value).digest();
  return digest.readUInt32BE(0);
};

const stableStringify = (value: unknown): string => {
  return JSON.stringify(normalizeForStableStringify(value));
};

const normalizeForStableStringify = (value: unknown): unknown => {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeForStableStringify(item));
  }
  const obj = value as Record<string, unknown>;
  const entries = Object.entries(obj)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, entryValue]) => [key, normalizeForStableStringify(entryValue)]);
  return Object.fromEntries(entries);
};
