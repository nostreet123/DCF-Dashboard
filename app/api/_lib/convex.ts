import { ConvexHttpClient } from "convex/browser";

const convexUrl = process.env.CONVEX_URL;
if (!convexUrl) {
  throw new Error("CONVEX_URL is required");
}

export const convexClient = new ConvexHttpClient(convexUrl);

export const getSyncToken = () => {
  const token = process.env.DAMODARAN_SYNC_TOKEN;
  if (!token) {
    throw new Error("DAMODARAN_SYNC_TOKEN is required");
  }
  return token;
};
