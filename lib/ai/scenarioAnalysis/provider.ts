import {
  estimateChatInputTokens,
  withProviderPromptTokens,
  type AiTokenUsage,
  type ChatTokenMessage,
} from "@/app/api/ai/_lib/tokenizer";
import type { Assumptions, Scenario } from "@/lib/workbench/scenarioProfiles";

import {
  DEFAULT_AI_MAX_TOKENS,
  DEFAULT_AI_TEMPERATURE,
  DEFAULT_AI_TOP_P,
  scenarioAnalysisResponseFormat,
} from "./contracts";
import {
  AI_SCENARIO_SYSTEM_PROMPT,
  buildCompactPrompt,
  buildPrompt,
} from "./prompts";
import {
  findUnsupportedRationaleTopics,
  parseAnalysisPayload,
} from "./validation";
import { readRecord } from "./contracts";

import type { AnalysisPayload } from "./contracts";

const parsePositiveIntegerEnv = (key: string, defaultValue: number): number => {
  const raw = process.env[key];
  const parsed = raw ? Number(raw) : defaultValue;
  return Number.isFinite(parsed) && Number.isInteger(parsed) && parsed > 0
    ? parsed
    : defaultValue;
};

const parseNumberEnv = (key: string, defaultValue: number): number => {
  const raw = process.env[key];
  const parsed = raw ? Number(raw) : defaultValue;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : defaultValue;
};

export const getMaxOutputTokens = (): number =>
  parsePositiveIntegerEnv("HUGGING_FACE_MAX_OUTPUT_TOKENS", DEFAULT_AI_MAX_TOKENS);

export const getTemperature = (): number =>
  Math.min(2, parseNumberEnv("HUGGING_FACE_TEMPERATURE", DEFAULT_AI_TEMPERATURE));

export const getTopP = (): number =>
  Math.min(1, parseNumberEnv("HUGGING_FACE_TOP_P", DEFAULT_AI_TOP_P));

export const getReasoningEffort = (): string =>
  process.env.HUGGING_FACE_REASONING_EFFORT || "xhigh";

export const getResponseFormat = () =>
  process.env.HUGGING_FACE_RESPONSE_FORMAT === "json_schema"
    ? scenarioAnalysisResponseFormat
    : { type: "json_object" as const };

export const getProviderTimeoutMs = (): number =>
  parsePositiveIntegerEnv("HUGGING_FACE_PROVIDER_TIMEOUT_MS", 90_000);

const readString = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed || null;
};

const extractProviderContent = (data: unknown): string | null =>
  typeof data === "object" &&
  data !== null &&
  Array.isArray((data as { choices?: unknown }).choices)
    ? ((data as { choices: Array<{ message?: { content?: unknown } }> }).choices[0]
        ?.message?.content as string | null)
    : null;

const extractProviderErrorMessage = (data: unknown): string | undefined => {
  const record = readRecord(data);
  const error = readRecord(record?.error);
  return readString(error?.message) ?? readString(record?.message) ?? undefined;
};

const isProviderInputValidationMessage = (message: string | undefined): boolean =>
  typeof message === "string" && message.toLowerCase().includes("input validation");

const summarizeProviderResponse = (data: unknown): Record<string, unknown> | undefined => {
  const record = readRecord(data);
  if (!record) {
    return undefined;
  }
  const choices = Array.isArray(record.choices) ? record.choices : [];
  const firstChoice = readRecord(choices[0]);
  const message = readRecord(firstChoice?.message);
  return {
    object: readString(record.object),
    choiceCount: choices.length,
    finishReason: readString(firstChoice?.finish_reason),
    messageKeys: message ? Object.keys(message).sort() : [],
    contentType: typeof message?.content,
    contentLength: typeof message?.content === "string" ? message.content.length : null,
    reasoningContentLength:
      typeof message?.reasoning_content === "string" ? message.reasoning_content.length : null,
    errorMessage: extractProviderErrorMessage(data),
  };
};

const isProviderTimeoutError = (error: unknown): error is Error => {
  if (!(error instanceof Error)) return false;
  return error.name === "TimeoutError" || error.message.toLowerCase().includes("aborted due to timeout");
};

export type ProviderFailureCode =
  | "AI_PROVIDER_TIMEOUT"
  | "AI_PROVIDER_ERROR"
  | "AI_PROVIDER_INPUT_VALIDATION"
  | "AI_PROVIDER_MALFORMED"
  | "AI_RESPONSE_INVALID"
  | "AI_RESPONSE_UNSUPPORTED_RATIONALE";

export type ProviderFailure = {
  ok: false;
  status: number;
  code: ProviderFailureCode;
  providerMessage?: string;
  providerSummary?: Record<string, unknown>;
  unsupportedTopics?: string[];
};

export type ProviderSuccess = {
  ok: true;
  analysis: AnalysisPayload;
  tokenUsage: AiTokenUsage;
};

export type ProviderResult = ProviderFailure | ProviderSuccess;

export const isProviderFailure = (result: ProviderResult): result is ProviderFailure =>
  result.ok === false;

export type ProviderRequestOptions = {
  apiKey: string;
  model: string;
  payload: unknown;
  reasoningEffort: string | null;
  forceDistinct?: boolean;
  currentAssumptions?: Record<Scenario, Assumptions> | null;
  activeScenario?: Scenario | null;
  compact?: boolean;
  responseFormat?: ReturnType<typeof getResponseFormat> | null;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
};

export const requestAiAnalysis = async ({
  apiKey,
  model,
  payload,
  reasoningEffort,
  forceDistinct = false,
  currentAssumptions = null,
  activeScenario = null,
  compact = false,
  responseFormat = getResponseFormat(),
  maxTokens = getMaxOutputTokens(),
  temperature = getTemperature(),
  timeoutMs = getProviderTimeoutMs(),
}: ProviderRequestOptions): Promise<ProviderResult> => {
  const prompt = compact
    ? buildCompactPrompt(payload, { forceDistinct, currentAssumptions, activeScenario })
    : buildPrompt(payload, {
        forceDistinct,
        currentAssumptions,
        activeScenario,
        fastFinal: reasoningEffort === null,
      });
  const messages: ChatTokenMessage[] = [
    {
      role: "system",
      content: AI_SCENARIO_SYSTEM_PROMPT,
    },
    {
      role: "user",
      content: prompt,
    },
  ];
  const estimatedTokenUsage = estimateChatInputTokens(messages, model);
  let response: Response;
  try {
    response = await fetch(`https://router.huggingface.co/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({
        model,
        ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
        messages,
        max_tokens: maxTokens,
        temperature,
        top_p: getTopP(),
        ...(responseFormat ? { response_format: responseFormat } : {}),
      }),
    });
  } catch (error) {
    if (isProviderTimeoutError(error)) {
      return {
        ok: false as const,
        status: 504,
        code: "AI_PROVIDER_TIMEOUT",
        providerMessage: error.message,
      };
    }
    return {
      ok: false as const,
      status: 504,
      code: "AI_PROVIDER_ERROR",
      providerMessage: error instanceof Error ? error.message : "Provider request failed",
    };
  }
  const data = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    const providerMessage = extractProviderErrorMessage(data);
    if (response.status === 400 && isProviderInputValidationMessage(providerMessage)) {
      return {
        ok: false as const,
        status: response.status,
        code: "AI_PROVIDER_INPUT_VALIDATION",
        providerMessage,
      };
    }
    return {
      ok: false as const,
      status: response.status,
      code: "AI_PROVIDER_ERROR",
      providerMessage,
    };
  }
  const content = extractProviderContent(data);
  if (typeof content !== "string") {
    return {
      ok: false as const,
      status: 502,
      code: "AI_PROVIDER_MALFORMED",
      providerSummary: summarizeProviderResponse(data),
    };
  }
  const analysis = parseAnalysisPayload(content);
  if (!analysis) {
    return {
      ok: false as const,
      status: 502,
      code: "AI_RESPONSE_INVALID",
    };
  }
  const unsupportedTopics = findUnsupportedRationaleTopics(analysis, payload);
  if (unsupportedTopics.length > 0) {
    return {
      ok: false as const,
      status: 502,
      code: "AI_RESPONSE_UNSUPPORTED_RATIONALE",
      unsupportedTopics,
    };
  }
  return {
    ok: true as const,
    analysis,
    tokenUsage: withProviderPromptTokens(estimatedTokenUsage, data),
  };
};
