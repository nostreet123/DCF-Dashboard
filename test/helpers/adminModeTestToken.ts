import { createHash } from "node:crypto";

export const VALID_ADMIN_TOKEN = "test-admin-token-123456";

export const VALID_ADMIN_TOKEN_HASH = createHash("sha256")
  .update(VALID_ADMIN_TOKEN)
  .digest("hex");
