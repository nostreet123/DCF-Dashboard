export const DEFAULT_JSON_BODY_LIMIT_BYTES = 200 * 1024;

export class BodyLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BodyLimitError";
  }
}

export const parseJsonWithLimit = async <T>(
  request: Request,
  limit: number = DEFAULT_JSON_BODY_LIMIT_BYTES,
): Promise<T> => {
  const lengthHeader = request.headers.get("content-length");
  if (lengthHeader) {
    const length = Number(lengthHeader);
    if (Number.isFinite(length) && length > limit) {
      throw new BodyLimitError(`Request body exceeds ${limit} bytes`);
    }
  }
  const reader = request.body?.getReader();
  if (!reader) {
    const text = await request.text();
    const byteLength = Buffer.byteLength(text, "utf8");
    if (byteLength > limit) {
      throw new BodyLimitError(`Request body exceeds ${limit} bytes`);
    }
    return JSON.parse(text) as T;
  }

  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (value) {
      received += value.byteLength;
      if (received > limit) {
        throw new BodyLimitError(`Request body exceeds ${limit} bytes`);
      }
      chunks.push(value);
    }
  }
  const text = new TextDecoder("utf-8").decode(
    Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))),
  );
  return JSON.parse(text) as T;
};
