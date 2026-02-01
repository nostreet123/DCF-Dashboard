const DEFAULT_LIMIT = 200 * 1024;

export class BodyLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BodyLimitError";
  }
}

export const parseJsonWithLimit = async <T>(
  request: Request,
  limit: number = DEFAULT_LIMIT,
): Promise<T> => {
  const lengthHeader = request.headers.get("content-length");
  if (lengthHeader) {
    const length = Number(lengthHeader);
    if (Number.isFinite(length) && length > limit) {
      throw new BodyLimitError(`Request body exceeds ${limit} bytes`);
    }
  }
  const text = await request.text();
  if (text.length > limit) {
    throw new BodyLimitError(`Request body exceeds ${limit} bytes`);
  }
  return JSON.parse(text) as T;
};
