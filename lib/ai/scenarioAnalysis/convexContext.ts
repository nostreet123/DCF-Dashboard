import { browserHistoryReadsEnabled } from "@/app/api/_lib/browserRouteGuards";
import { getConvexClient, getSyncTokenOptional } from "@/app/api/_lib/convex";
import {
  queryCompaniesGet,
  queryCompanyStatementsListBySymbol,
  queryImportsGetImportedFacts,
  queryImportsListArtifactsForListing,
  queryImportsListBySymbol,
  querySeedGetReference,
  queryValuationsGet,
  queryValuationsListByTicker,
} from "@/app/api/_lib/convexServer";
import { redactPublicImportContext } from "@/lib/import/redaction";

import type { ConvexAiContext, ConvexLookup } from "./contracts";
import { dataContract, readRecord } from "./contracts";

const readString = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed || null;
};

const compactArray = (value: unknown, limit: number): unknown[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.slice(0, limit);
};

const pickFields = (
  value: unknown,
  fields: string[],
): Record<string, unknown> | null => {
  const record = readRecord(value);
  if (!record) {
    return null;
  }
  const picked: Record<string, unknown> = {};
  for (const field of fields) {
    if (record[field] !== undefined) {
      picked[field] = record[field];
    }
  }
  return picked;
};

const publicRunSummaryFields = [
  "_id",
  "createdAt",
  "status",
  "symbol",
  "resultSummary",
];

const privateRunSummaryFields = [
  "engineVersion",
  "normalizedInputs",
  "provenance",
  "primaryKeyNorm",
  "regionCode",
  "asOfDate",
  "traceStorage",
  "traceByteSize",
];

const compactRunSummary = (
  run: unknown,
  { includePrivateMetadata = false }: { includePrivateMetadata?: boolean } = {},
): Record<string, unknown> | null =>
  pickFields(run, [
    ...publicRunSummaryFields,
    ...(includePrivateMetadata ? privateRunSummaryFields : []),
  ]);

const compactTrace = (detail: unknown): unknown => {
  const detailRecord = readRecord(detail);
  const run = readRecord(detailRecord?.run);
  const traceWrapper = readRecord(detailRecord?.trace);
  const trace = readRecord(run?.trace) ?? readRecord(traceWrapper?.trace);
  if (!detailRecord || !run) {
    return detail;
  }
  return {
    run: compactRunSummary(run, { includePrivateMetadata: true }),
    trace: trace
      ? {
          base: trace.base,
          bull: trace.bull,
          bear: trace.bear,
          sensitivity: trace.sensitivity,
          monteCarlo: trace.monteCarlo
            ? {
                summary: readRecord(trace.monteCarlo)?.summary,
              }
            : undefined,
          kpis: trace.kpis,
        }
      : undefined,
  };
};

const compactReferenceCatalog = (catalog: unknown): unknown => {
  const record = readRecord(catalog);
  if (!record) {
    return catalog;
  }
  const datasets = compactArray(record.datasets, 80);
  return {
    datasets,
    datasetCount: Array.isArray(record.datasets) ? record.datasets.length : datasets.length,
    regions: compactArray(record.regions, 40),
    datasetMappings: compactArray(record.datasetMappings, 80),
  };
};

export const extractConvexLookup = (payload: unknown): ConvexLookup => {
  const record = readRecord(payload);
  const company = readRecord(record?.company);
  return {
    listingId: readString(company?.id) ?? readString(record?.listingId) ?? readString(record?.companyId),
    symbol: readString(company?.symbol) ?? readString(record?.symbol),
  };
};

export const browserPrivateConvexContextEnabled = (): boolean =>
  browserHistoryReadsEnabled();

export const loadConvexAiContext = async (
  payload: unknown,
  { includeImportContext, includePrivateData, includeSavedRunTrace }: {
    includeImportContext: boolean;
    includePrivateData: boolean;
    includeSavedRunTrace: boolean;
  },
): Promise<ConvexAiContext> => {
  const lookup = extractConvexLookup(payload);
  if (!includePrivateData) {
    return {
      available: false,
      reason: "BROWSER_READS_DISABLED",
      lookup,
      dataContract,
    };
  }
  if (!getConvexClient()) {
    return {
      available: false,
      reason: "CONVEX_NOT_CONFIGURED",
      lookup,
      dataContract,
    };
  }

  try {
    const [companyCache, statementHistoryResult, referenceDataCatalog] = await Promise.all([
      lookup.symbol
        ? queryCompaniesGet({ symbol: lookup.symbol })
        : Promise.resolve(null),
      lookup.symbol
        ? queryCompanyStatementsListBySymbol({ symbol: lookup.symbol, limit: 10 })
        : Promise.resolve(null),
      querySeedGetReference(),
    ]);

    const syncToken = getSyncTokenOptional();
    let importedFacts: unknown = null;
    if (includeImportContext && syncToken && lookup.listingId) {
      importedFacts = await queryImportsGetImportedFacts({ listingId: lookup.listingId });
    }
    if (includeImportContext && syncToken && !importedFacts && lookup.symbol) {
      const matches = await queryImportsListBySymbol({
        symbol: lookup.symbol,
        limit: 1,
      });
      importedFacts = Array.isArray(matches) ? matches[0] ?? null : null;
    }

    const importedRecord = readRecord(importedFacts);
    const resolvedListingId = readString(importedRecord?.listingId) ?? lookup.listingId;
    const artifactIds = Array.isArray(importedRecord?.artifactIds)
      ? new Set(importedRecord.artifactIds)
      : null;
    let importArtifacts: unknown[] = [];
    if (includeImportContext && syncToken && resolvedListingId) {
      const artifacts = await queryImportsListArtifactsForListing({
        listingId: resolvedListingId,
        status: "approved",
        limit: 20,
      });
      importArtifacts = Array.isArray(artifacts)
        ? artifacts.filter((artifact) => {
            if (!artifactIds) {
              return true;
            }
            const artifactRecord = readRecord(artifact);
            return artifactIds.has(artifactRecord?.artifactId);
          })
        : [];
    }

    let recentValuationRuns: unknown[] = [];
    let latestValuationRunDetail: unknown = null;
    if (syncToken && lookup.symbol) {
      const runs = await queryValuationsListByTicker({
        symbol: lookup.symbol,
        limit: 5,
      });
      recentValuationRuns = Array.isArray(runs) ? runs : [];
      const latestSuccessfulRun = recentValuationRuns.find((run) => {
        const runRecord = readRecord(run);
        return readString(runRecord?.status) === "success" && readString(runRecord?._id);
      });
      const latestRunId = readString(readRecord(latestSuccessfulRun)?._id);
      if (includeSavedRunTrace && latestRunId) {
        latestValuationRunDetail = await queryValuationsGet({
          runId: latestRunId,
          includeTrace: true,
        });
      }
    }

    return {
      available: true,
      lookup,
      dataContract,
      companyCache: pickFields(companyCache, [
        "symbol",
        "name",
        "cik",
        "country",
        "currency",
        "source",
        "updatedAt",
      ]),
      companyStatementHistory: compactArray(readRecord(statementHistoryResult)?.statements, 10),
      importedFacts: redactPublicImportContext(importedFacts),
      importArtifacts: compactArray(redactPublicImportContext(importArtifacts), 10),
      recentValuationRuns: recentValuationRuns.flatMap((run) => {
        const compact = compactRunSummary(run, {
          includePrivateMetadata: includeSavedRunTrace,
        });
        return compact ? [compact] : [];
      }),
      latestValuationRunDetail: compactTrace(latestValuationRunDetail),
      referenceDataCatalog: compactReferenceCatalog(referenceDataCatalog),
    };
  } catch (error) {
    console.error("AI Convex context fetch failed", error);
    return {
      available: false,
      reason: "CONVEX_CONTEXT_ERROR",
      lookup,
      dataContract,
    };
  }
};

export const withConvexContext = (payload: unknown, convexContext: ConvexAiContext): unknown => {
  const record = readRecord(payload);
  if (!record) {
    return { request: payload, convexContext };
  }
  return {
    ...record,
    convexContext,
  };
};
