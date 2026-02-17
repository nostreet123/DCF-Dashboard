import { ConvexHttpClient } from "convex/browser";

let cachedClient: ConvexHttpClient | null = null;
let cachedConvexUrl: string | null = null;

export const getConvexClient = (): ConvexHttpClient | null => {
  const convexUrl = process.env.CONVEX_URL ?? null;
  if (!convexUrl) {
    cachedClient = null;
    cachedConvexUrl = null;
    return null;
  }
  if (cachedClient && cachedConvexUrl === convexUrl) {
    return cachedClient;
  }
  cachedClient = new ConvexHttpClient(convexUrl);
  cachedConvexUrl = convexUrl;
  return cachedClient;
};

export const getSyncToken = () => {
  const token = process.env.DAMODARAN_SYNC_TOKEN;
  if (!token) {
    throw new Error("DAMODARAN_SYNC_TOKEN is required");
  }
  return token;
};

export const getSyncTokenOptional = () => process.env.DAMODARAN_SYNC_TOKEN ?? null;
