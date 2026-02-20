const resolveBaseUrl = () => {
  const baseUrl = process.env.DCF_ENGINE_URL;
  if (!baseUrl) {
    throw new Error("DCF_ENGINE_URL is required");
  }
  return baseUrl.replace(/\/+$/, "");
};

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
      throw new Error(message);
    }
    const detail = text ? `: ${truncateText(text)}` : "";
    throw new Error(`DCF engine error (${response.status})${detail}`);
  }
  if (data === null) {
    if (text) {
      throw new Error(
        `Unexpected DCF engine response (${response.status}): ${truncateText(text)}`,
      );
    }
    return {} as T;
  }
  return data as T;
};

export const fetchDcfEngine = async <T>(
  path: string,
  init?: RequestInit,
): Promise<T> => {
  const baseUrl = resolveBaseUrl();
  const headers = new Headers(init?.headers);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(`${baseUrl}${path}`, {
    cache: "no-store",
    ...init,
    headers,
  });
  return parseResponse<T>(response);
};
