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

const SEED_SCENARIO_KEYS = [
  "revenueGrowth",
  "ebitMargin",
  "taxRate",
  "salesToCapital",
  "wacc",
  "gStable",
  "waccStable",
] as const;

const SEED_TOP_LEVEL_KEYS = [
  "periods",
  "revenueT0",
  "cash",
  "debt",
  "otherNonOperatingAssets",
  "sharesOutstanding",
  "reinvestmentLagYears",
  "base",
  "bull",
  "bear",
] as const;

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
  const core = extractSeedInputs(payload);
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

const extractSeedInputs = (payload: Record<string, unknown>): Record<string, unknown> => {
  const seedInputs: Record<string, unknown> = {};
  for (const key of SEED_TOP_LEVEL_KEYS) {
    const value = payload[key];
    if (value === undefined) {
      continue;
    }
    if (key === "base" || key === "bull" || key === "bear") {
      if (isRecord(value)) {
        seedInputs[key] = pickScenarioInputs(value);
      } else {
        seedInputs[key] = value;
      }
      continue;
    }
    seedInputs[key] = value;
  }
  return seedInputs;
};

const pickScenarioInputs = (value: Record<string, unknown>): Record<string, unknown> => {
  const picked: Record<string, unknown> = {};
  for (const key of SEED_SCENARIO_KEYS) {
    if (value[key] !== undefined) {
      picked[key] = value[key];
    }
  }
  return picked;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
