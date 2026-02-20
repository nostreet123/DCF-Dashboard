import { ConvexError } from "convex/values";

const encoder = new TextEncoder();
const MAX_TOKEN_BYTES = 4096;

const timingSafeEqualUtf8 = (left: string, right: string): boolean => {
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  if (leftBytes.length > MAX_TOKEN_BYTES || rightBytes.length > MAX_TOKEN_BYTES) {
    return false;
  }

  const maxLength = Math.max(leftBytes.length, rightBytes.length);
  let mismatch = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < maxLength; index += 1) {
    const leftByte = index < leftBytes.length ? leftBytes[index] : 0;
    const rightByte = index < rightBytes.length ? rightBytes[index] : 0;
    mismatch |= leftByte ^ rightByte;
  }
  return mismatch === 0;
};

const unauthorizedError = () =>
  new ConvexError({
    code: "UNAUTHORIZED",
    message: "Invalid sync token",
  });

export const hasValidSyncToken = (syncToken: string | undefined) => {
  const expected = process.env.DAMODARAN_SYNC_TOKEN;
  if (!expected || !syncToken) {
    return false;
  }
  return timingSafeEqualUtf8(syncToken, expected);
};

export const requireSyncToken = (syncToken: string | undefined) => {
  if (!hasValidSyncToken(syncToken)) {
    throw unauthorizedError();
  }
};
