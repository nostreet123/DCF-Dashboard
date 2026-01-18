export const requireSyncToken = (syncToken: string | undefined) => {
  const expected = process.env.DAMODARAN_SYNC_TOKEN;
  if (!expected) {
    throw new Error("Missing DAMODARAN_SYNC_TOKEN");
  }
  if (!syncToken || syncToken !== expected) {
    throw new Error("Invalid sync token");
  }
};
