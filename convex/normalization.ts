import { ConvexError } from "convex/values";

export const normalizeSymbol = (symbol: string) => symbol.trim().toUpperCase();

export const normalizeOptionalSymbol = (symbol: string | undefined) => {
  if (!symbol) {
    return undefined;
  }
  const trimmed = symbol.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.toUpperCase();
};

export const normalizePositiveIntegerLimit = (
  requested: number | undefined,
  defaultLimit: number,
  maxLimit: number,
  errorMessage = "Limit must be a positive integer",
) => {
  if (requested === undefined) {
    return defaultLimit;
  }
  const limit = Number(requested);
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new ConvexError({
      code: "BAD_REQUEST",
      message: errorMessage,
    });
  }
  return Math.min(limit, maxLimit);
};
