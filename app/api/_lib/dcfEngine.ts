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

const parseResponse = async <T>(response: Response): Promise<T> => {
  const text = await response.text();
  const data = text ? (JSON.parse(text) as T) : ({} as T);
  if (!response.ok) {
    const message = extractErrorMessage(data);
    throw new Error(message || `DCF engine error (${response.status})`);
  }
  return data;
};

export const fetchDcfEngine = async <T>(
  path: string,
  init?: RequestInit,
): Promise<T> => {
  const baseUrl = resolveBaseUrl();
  const response = await fetch(`${baseUrl}${path}`, {
    cache: "no-store",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  return parseResponse<T>(response);
};
