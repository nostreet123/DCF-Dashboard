import type { ConvexHttpClient } from "convex/browser";

import { getConvexClient, getSyncTokenOptional } from "@/app/api/_lib/convex";

type SyncArgs = Record<string, unknown> & { syncToken: string };

type UntypedConvexClient = ConvexHttpClient & {
  query(name: string, args: Record<string, unknown>): Promise<unknown>;
  mutation(name: string, args: Record<string, unknown>): Promise<unknown>;
};

const requireClient = (): ConvexHttpClient => {
  const client = getConvexClient();
  if (!client) {
    throw new Error("Convex client is not configured");
  }
  return client;
};

const requireSyncToken = (): string => {
  const syncToken = getSyncTokenOptional();
  if (!syncToken) {
    throw new Error("DAMODARAN_SYNC_TOKEN is not configured");
  }
  return syncToken;
};

const withSyncToken = (args: Record<string, unknown>): SyncArgs => ({
  syncToken: requireSyncToken(),
  ...args,
});

const convexQuery = async (name: string, args: Record<string, unknown>): Promise<unknown> => {
  const client = requireClient() as UntypedConvexClient;
  return client.query(name, args);
};

const convexMutation = async (name: string, args: Record<string, unknown>): Promise<unknown> => {
  const client = requireClient() as UntypedConvexClient;
  return client.mutation(name, args);
};

export const convexConfigured = (): boolean =>
  Boolean(getConvexClient() && getSyncTokenOptional());

export const queryCompaniesGet = (args: { symbol: string }) =>
  convexQuery("companies:get", args);

export const queryCompaniesSearch = (args: { q: string; limit: number }) =>
  convexQuery("companies:search", args);

export const queryCompanyStatementsListBySymbol = (args: { symbol: string; limit: number }) =>
  convexQuery("companyStatements:listBySymbol", args);

export const querySeedGetReference = () => convexQuery("seed:getReference", {});

export const queryImportsGetImportedFacts = (args: { listingId: string }) =>
  convexQuery("imports:getImportedFacts", withSyncToken(args));

export const queryImportsListBySymbol = (args: { symbol: string; limit: number }) =>
  convexQuery("imports:listBySymbol", withSyncToken(args));

export const queryImportsListArtifactsForListing = (args: {
  listingId: string;
  status?: string;
  limit?: number;
}) => convexQuery("imports:listArtifactsForListing", withSyncToken(args));

export const mutationImportsGenerateUploadUrl = () =>
  convexMutation("imports:generateUploadUrl", withSyncToken({}));

export const mutationImportsSaveParsedArtifact = (args: Record<string, unknown>) =>
  convexMutation("imports:saveParsedArtifact", withSyncToken(args));

export const mutationImportsApproveImportedFacts = (args: Record<string, unknown>) =>
  convexMutation("imports:approveImportedFacts", withSyncToken(args));

export const mutationCompaniesUpsertCompany = (args: Record<string, unknown>) =>
  convexMutation("companies:upsertCompany", withSyncToken(args));

export const mutationCompanyStatementsUpsertBatch = (args: Record<string, unknown>) =>
  convexMutation("companyStatements:upsertBatch", withSyncToken(args));

export const queryValuationsListByTicker = (args: { symbol: string; limit: number }) =>
  convexQuery("valuations:listByTicker", withSyncToken(args));

export const queryValuationsListBySymbol = (args: {
  primaryKeyNorm: string;
  regionCode?: string;
  limit: number;
}) => convexQuery("valuations:listBySymbol", withSyncToken(args));

export const queryValuationsGet = (args: { runId: string; includeTrace?: boolean }) =>
  convexQuery("valuations:get", withSyncToken(args));

export const mutationValuationsCreate = (args: Record<string, unknown>) =>
  convexMutation("valuations:create", withSyncToken(args));

export type SecurityAuthMutationName =
  | "securityAuth:reserveNonce"
  | "securityAuth:markNonceUsed"
  | "securityAuth:releasePendingNonce";

export const mutationSecurityAuth = async <T>(
  name: SecurityAuthMutationName,
  args: Record<string, unknown>,
): Promise<T | null> => {
  const client = getConvexClient();
  const syncToken = getSyncTokenOptional();
  if (!client || !syncToken) {
    return null;
  }
  try {
    return (await convexMutation(name, { syncToken, ...args })) as T;
  } catch (error) {
    console.warn("Security auth mutation failed", error);
    return null;
  }
};

export const mutationSecurityRateLimitHitBucket = (args: {
  bucketKey: string;
  limit: number;
  windowMs: number;
  nowMs: number;
}) => convexMutation("securityRateLimit:hitBucket", withSyncToken(args));
