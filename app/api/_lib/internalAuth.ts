import { timingSafeEqual } from "crypto";

const INTERNAL_PERSISTENCE_HEADER = "x-dcf-internal-key";

const safeCompare = (provided: string, expected: string): boolean => {
  const providedBytes = Buffer.from(provided, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  if (providedBytes.length !== expectedBytes.length) {
    return false;
  }
  return timingSafeEqual(providedBytes, expectedBytes);
};

export const isInternalPersistenceRequest = (request: Request): boolean => {
  const expected = process.env.INTERNAL_PERSISTENCE_KEY;
  if (!expected) {
    return false;
  }
  const provided = request.headers.get(INTERNAL_PERSISTENCE_HEADER);
  if (!provided) {
    return false;
  }
  return safeCompare(provided, expected);
};

export const internalPersistenceHeaderName = INTERNAL_PERSISTENCE_HEADER;
