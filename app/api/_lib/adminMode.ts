import { createHash, timingSafeEqual } from "node:crypto";

const ADMIN_HEADER = "x-dcf-admin-token";
const MIN_ADMIN_TOKEN_LENGTH = 16;
const MAX_ADMIN_TOKEN_LENGTH = 512;

export function isAdminModeConfigured(): boolean {
  const configuredHash = process.env.DCF_DEMO_ADMIN_TOKEN_SHA256;
  return Boolean(configuredHash && /^[a-f0-9]{64}$/i.test(configuredHash));
}

export function isAdminModeRequest(request: Request): boolean {
  const configuredHash = process.env.DCF_DEMO_ADMIN_TOKEN_SHA256;
  if (!isAdminModeConfigured() || !configuredHash) {
    return false;
  }

  const providedToken = request.headers.get(ADMIN_HEADER);
  if (
    !providedToken ||
    providedToken.length < MIN_ADMIN_TOKEN_LENGTH ||
    providedToken.length > MAX_ADMIN_TOKEN_LENGTH
  ) {
    return false;
  }

  const configured = Buffer.from(configuredHash.toLowerCase(), "hex");
  const provided = createHash("sha256").update(providedToken).digest();
  if (configured.length !== provided.length) {
    return false;
  }

  return timingSafeEqual(configured, provided);
}
