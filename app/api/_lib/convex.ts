import { ConvexHttpClient } from "convex/browser";

type ConvexNamedClient = {
  query: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  mutation: (name: string, args: Record<string, unknown>) => Promise<unknown>;
};

let cachedUrl: string | null = null;
let cachedClient: ConvexNamedClient | null = null;

const getConvexUrl = () => {
  const url = process.env.CONVEX_URL?.trim();
  if (!url) {
    throw new Error("CONVEX_URL is required");
  }
  return url;
};

const getNamedClient = (): ConvexNamedClient => {
  const url = getConvexUrl();
  if (!cachedClient || cachedUrl !== url) {
    cachedClient = new ConvexHttpClient(url) as unknown as ConvexNamedClient;
    cachedUrl = url;
  }
  return cachedClient;
};

export const queryConvex = async <TResult>(
  name: string,
  args: Record<string, unknown>,
): Promise<TResult> => {
  return (await getNamedClient().query(name, args)) as TResult;
};

export const mutateConvex = async <TResult>(
  name: string,
  args: Record<string, unknown>,
): Promise<TResult> => {
  return (await getNamedClient().mutation(name, args)) as TResult;
};

export const getSyncToken = () => {
  const token = process.env.DAMODARAN_SYNC_TOKEN;
  if (!token) {
    throw new Error("DAMODARAN_SYNC_TOKEN is required");
  }
  return token;
};
