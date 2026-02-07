import { ConvexHttpClient } from "convex/browser";

type ConvexNamedClient = {
  query: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  mutation: (name: string, args: Record<string, unknown>) => Promise<unknown>;
};

const convexUrl = process.env.CONVEX_URL;
if (!convexUrl) {
  throw new Error("CONVEX_URL is required");
}

export const convexClient = new ConvexHttpClient(convexUrl);
const namedClient = convexClient as unknown as ConvexNamedClient;

export const queryConvex = async <TResult>(
  name: string,
  args: Record<string, unknown>,
): Promise<TResult> => {
  return (await namedClient.query(name, args)) as TResult;
};

export const mutateConvex = async <TResult>(
  name: string,
  args: Record<string, unknown>,
): Promise<TResult> => {
  return (await namedClient.mutation(name, args)) as TResult;
};

export const getSyncToken = () => {
  const token = process.env.DAMODARAN_SYNC_TOKEN;
  if (!token) {
    throw new Error("DAMODARAN_SYNC_TOKEN is required");
  }
  return token;
};
