import { createHash } from "node:crypto";

import type { AiTokenUsage } from "@/app/api/ai/_lib/tokenizer";

import type { AnalysisPayload } from "./contracts";
import { AI_CACHE_TTL_MS, AI_SCENARIO_PROMPT_VERSION } from "./contracts";

export type CachedScenarioAnalysisEntry = {
  analysis: AnalysisPayload;
  tokenUsage: AiTokenUsage;
  expiresAt: number;
};

export interface ScenarioAnalysisCache {
  get(key: string): { analysis: AnalysisPayload; tokenUsage: AiTokenUsage } | null;
  set(
    key: string,
    analysis: AnalysisPayload,
    tokenUsage: AiTokenUsage,
    ttlMs?: number,
  ): void;
  delete(key: string): void;
}

export class MemoryScenarioAnalysisCache implements ScenarioAnalysisCache {
  private readonly store = new Map<string, CachedScenarioAnalysisEntry>();

  get(key: string): { analysis: AnalysisPayload; tokenUsage: AiTokenUsage } | null {
    const cached = this.store.get(key);
    if (!cached) {
      return null;
    }
    if (cached.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }
    return {
      analysis: cached.analysis,
      tokenUsage: cached.tokenUsage,
    };
  }

  set(
    key: string,
    analysis: AnalysisPayload,
    tokenUsage: AiTokenUsage,
    ttlMs: number = AI_CACHE_TTL_MS,
  ): void {
    this.store.set(key, {
      analysis,
      tokenUsage,
      expiresAt: Date.now() + ttlMs,
    });
  }

  delete(key: string): void {
    this.store.delete(key);
  }
}

export const defaultScenarioAnalysisCache = new MemoryScenarioAnalysisCache();

export const cacheKeyFor = (model: string, payload: unknown): string =>
  createHash("sha256")
    .update(AI_SCENARIO_PROMPT_VERSION)
    .update("\n")
    .update(model)
    .update("\n")
    .update(JSON.stringify(payload))
    .digest("hex");
