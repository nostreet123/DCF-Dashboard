type DebugLevel = "error" | "standard" | "verbose";

export class DcfEngineHttpError extends Error {
  status: number;
  data: unknown;

  constructor(status: number, message: string, data: unknown) {
    super(message);
    this.name = "DcfEngineHttpError";
    this.status = status;
    this.data = data;
  }
}

const parseResponseBody = <T>(text: string): T | string | Record<string, never> => {
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    return text;
  }
};

const resolveBaseUrl = () => {
  const baseUrl = process.env.DCF_ENGINE_URL;
  if (!baseUrl) {
    throw new Error("DCF_ENGINE_URL is required");
  }
  return baseUrl.replace(/\/+$/, "");
};

const extractErrorMessage = (data: unknown): string | null => {
  if (typeof data === "string") {
    const trimmed = data.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (!data || typeof data !== "object") {
    return null;
  }
  const record = data as Record<string, unknown>;
  const candidate = record.message ?? record.detail ?? record.error;
  if (typeof candidate === "object" && candidate && "message" in candidate) {
    const nested = (candidate as Record<string, unknown>).message;
    if (typeof nested === "string") {
      return nested;
    }
  }
  if (typeof candidate === "string") {
    return candidate;
  }
  if (candidate !== undefined) {
    return JSON.stringify(candidate);
  }
  return null;
};

const parseResponse = async <T>(response: Response): Promise<T> => {
  const text = await response.text();
  const data = parseResponseBody<T>(text);
  if (!response.ok) {
    const message = extractErrorMessage(data);
    throw new DcfEngineHttpError(
      response.status,
      message || `DCF engine error (${response.status})`,
      data,
    );
  }
  return data as T;
};

export const fetchDcfEngine = async <T>(
  path: string,
  init?: RequestInit & {
    correlationId?: string;
    debugLevel?: DebugLevel;
  },
): Promise<T> => {
  const baseUrl = resolveBaseUrl();
  const {
    correlationId,
    debugLevel,
    headers: initHeaders,
    ...requestInit
  } = init ?? {};
  const response = await fetch(`${baseUrl}${path}`, {
    cache: "no-store",
    ...requestInit,
    headers: {
      "Content-Type": "application/json",
      ...(correlationId ? { "x-debug-id": correlationId } : {}),
      ...(debugLevel ? { "x-debug-level": debugLevel } : {}),
      ...(initHeaders ?? {}),
    },
  });
  return parseResponse<T>(response);
};
