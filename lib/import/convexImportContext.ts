import {
  queryImportsGetImportedFacts,
  queryImportsListArtifactsForListing,
  queryImportsListBySymbol,
} from "@/app/api/_lib/convexServer";
import { redactPublicImportContext } from "@/lib/import/redaction";

export type ImportContextLookup = {
  listingId?: string | null;
  symbol?: string | null;
};

export type ImportContextPayload = {
  importedFacts: unknown;
  artifacts: unknown[];
};

const readListingId = (importedFacts: unknown): string | null => {
  if (
    importedFacts &&
    typeof importedFacts === "object" &&
    !Array.isArray(importedFacts) &&
    typeof (importedFacts as { listingId?: unknown }).listingId === "string"
  ) {
    return (importedFacts as { listingId: string }).listingId;
  }
  return null;
};

const readArtifactIds = (importedFacts: unknown): Set<unknown> | null => {
  if (
    importedFacts &&
    typeof importedFacts === "object" &&
    !Array.isArray(importedFacts) &&
    Array.isArray((importedFacts as { artifactIds?: unknown }).artifactIds)
  ) {
    return new Set((importedFacts as { artifactIds: unknown[] }).artifactIds);
  }
  return null;
};

export const loadConvexImportContext = async ({
  listingId,
  symbol,
}: ImportContextLookup): Promise<ImportContextPayload> => {
  let importedFacts: unknown = null;
  if (listingId) {
    importedFacts = await queryImportsGetImportedFacts({ listingId });
  }
  if (!importedFacts && symbol) {
    const matches = await queryImportsListBySymbol({ symbol, limit: 1 });
    importedFacts = Array.isArray(matches) ? matches[0] ?? null : null;
  }

  const resolvedListingId = readListingId(importedFacts) ?? listingId ?? null;
  const artifactIds = readArtifactIds(importedFacts);
  let artifacts: unknown[] = [];
  if (resolvedListingId) {
    const allArtifacts = await queryImportsListArtifactsForListing({
      listingId: resolvedListingId,
      status: "approved",
      limit: 20,
    });
    artifacts = Array.isArray(allArtifacts)
      ? allArtifacts.filter((artifact) => {
          if (!artifactIds) {
            return true;
          }
          return (
            artifact &&
            typeof artifact === "object" &&
            !Array.isArray(artifact) &&
            artifactIds.has((artifact as { artifactId?: unknown }).artifactId)
          );
        })
      : [];
  }

  return {
    importedFacts: redactPublicImportContext(importedFacts),
    artifacts: redactPublicImportContext(artifacts) as unknown[],
  };
};
