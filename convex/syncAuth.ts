import { ConvexError } from "convex/values";

export const requireSyncToken = (syncToken: string | undefined) => {
  const expected = process.env.DAMODARAN_SYNC_TOKEN;
  if (!expected) {
    throw new ConvexError({
      code: "CONFIGURATION",
      message: "Missing DAMODARAN_SYNC_TOKEN",
    });
  }
  if (!syncToken || syncToken !== expected) {
    throw new ConvexError({
      code: "UNAUTHORIZED",
      message: "Invalid sync token",
    });
  }
};
