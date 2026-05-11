import { createInternalPersistenceHeaders } from "@/app/api/_lib/internalAuth";

export class DcfEngineHttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "DcfEngineHttpError";
    this.status = status;
  }
}

const resolveBaseUrl = () => {
  const baseUrl = process.env.DCF_ENGINE_URL;
  if (!baseUrl) {
    throw new Error("DCF_ENGINE_URL is required");
  }
  return baseUrl.replace(/\/+$/, "");
};

const allowUnsignedEngineRequests = () => process.env.DCF_ENGINE_ALLOW_UNSIGNED === "1";

const extractErrorMessage = (data: unknown): string | null => {
  if (!data || typeof data !== "object") {
    return null;
  }
  const record = data as Record<string, unknown>;
  const candidate = record.message ?? record.detail ?? record.error;
  if (typeof candidate === "string") {
    return candidate;
  }
  if (candidate !== undefined) {
    return JSON.stringify(candidate);
  }
  return null;
};

const truncateText = (text: string, maxLength: number = 800): string => {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength)}…`;
};

const parseJsonBody = (text: string, contentType: string | null): unknown | null => {
  if (!text) {
    return null;
  }
  const trimmed = text.trim();
  const isJsonContent =
    contentType?.includes("application/json") ||
    contentType?.includes("+json") ||
    trimmed.startsWith("{") ||
    trimmed.startsWith("[");
  if (!isJsonContent) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
};

const parseResponse = async <T>(response: Response): Promise<T> => {
  const text = await response.text();
  const data = parseJsonBody(text, response.headers.get("content-type"));
  if (!response.ok) {
    const message = extractErrorMessage(data);
    if (message) {
      throw new DcfEngineHttpError(response.status, message);
    }
    const detail = text ? `: ${truncateText(text)}` : "";
    throw new DcfEngineHttpError(
      response.status,
      `DCF engine error (${response.status})${detail}`,
    );
  }
  if (data === null) {
    if (text) {
      throw new Error(
        `Unexpected DCF engine response (${response.status}): ${truncateText(text)}`,
      );
    }
    throw new Error(`Unexpected empty DCF engine response (${response.status})`);
  }
  return data as T;
};

export const fetchDcfEngine = async <T>(
  path: string,
  init?: RequestInit,
): Promise<T> => {
  const baseUrl = resolveBaseUrl();
  const headers = new Headers(init?.headers);
  const secret = process.env.DCF_ENGINE_INTERNAL_KEY;
  if (!secret && !allowUnsignedEngineRequests()) {
    throw new Error(
      "DCF_ENGINE_INTERNAL_KEY is required unless DCF_ENGINE_ALLOW_UNSIGNED=1",
    );
  }
  const body =
    typeof init?.body === "string"
      ? init.body
      : init?.body === undefined || init?.body === null
        ? ""
        : String(init.body);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (secret) {
    const authHeaders = createInternalPersistenceHeaders({
      secret,
      method: init?.method ?? "GET",
      url: `${baseUrl}${path}`,
      body,
    });
    for (const [name, value] of Object.entries(authHeaders)) {
      headers.set(name, value);
    }
  }
  const response = await fetch(`${baseUrl}${path}`, {
    cache: "no-store",
    ...init,
    headers,
  });
  return parseResponse<T>(response);
};
