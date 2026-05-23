export type ChatTokenMessage = {
  role: string;
  content: string;
};

export type AiTokenUsage = {
  inputTokens: number;
  estimated: boolean;
  inputBytes: number;
  systemTokens: number;
  userTokens: number;
  messageCount: number;
  model: string;
  tokenizer: "provider-usage" | "local-estimate-v1";
};

const REQUEST_TOKEN_OVERHEAD = 8;
const MESSAGE_TOKEN_OVERHEAD = 4;

const encoder = new TextEncoder();

export const estimateTextTokens = (text: string): number => {
  if (!text) {
    return 0;
  }

  const parts = (text.match(/[A-Za-z0-9_]+|[^\sA-Za-z0-9_]/g) ?? []) as string[];
  const count = parts.reduce((sum, part) => {
    if (/^[A-Za-z0-9_]+$/.test(part)) {
      return sum + Math.max(1, Math.ceil(part.length / 4));
    }
    return sum + 1;
  }, 0);

  return Math.max(1, count);
};

export const estimateChatInputTokens = (
  messages: ChatTokenMessage[],
  model: string,
): AiTokenUsage => {
  let systemTokens = 0;
  let userTokens = 0;
  let inputTokens = REQUEST_TOKEN_OVERHEAD;

  for (const message of messages) {
    const contentTokens = estimateTextTokens(message.content);
    const roleTokens = estimateTextTokens(message.role);
    inputTokens += MESSAGE_TOKEN_OVERHEAD + roleTokens + contentTokens;
    if (message.role === "system") {
      systemTokens += contentTokens;
    } else if (message.role === "user") {
      userTokens += contentTokens;
    }
  }

  return {
    inputTokens,
    estimated: true,
    inputBytes: encoder.encode(JSON.stringify(messages)).length,
    systemTokens,
    userTokens,
    messageCount: messages.length,
    model,
    tokenizer: "local-estimate-v1",
  };
};

const readRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

const readPositiveInteger = (value: unknown): number | null => {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) && Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

export const readProviderPromptTokens = (data: unknown): number | null => {
  const record = readRecord(data);
  const usage = readRecord(record?.usage);
  return (
    readPositiveInteger(usage?.prompt_tokens) ??
    readPositiveInteger(usage?.promptTokens) ??
    readPositiveInteger(usage?.input_tokens) ??
    readPositiveInteger(usage?.inputTokens)
  );
};

export const withProviderPromptTokens = (
  estimate: AiTokenUsage,
  data: unknown,
): AiTokenUsage => {
  const providerPromptTokens = readProviderPromptTokens(data);
  if (!providerPromptTokens) {
    return estimate;
  }

  return {
    ...estimate,
    inputTokens: providerPromptTokens,
    estimated: false,
    tokenizer: "provider-usage",
  };
};
