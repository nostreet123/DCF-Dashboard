import { randomUUID } from "crypto";
import { NextResponse } from "next/server";

import { getConvexClient, getSyncTokenOptional } from "@/app/api/_lib/convex";
import { DcfEngineHttpError, fetchDcfEngine } from "@/app/api/_lib/dcfEngine";
import { errorResponse } from "@/app/api/_lib/errors";
import { isInternalPersistenceRequest } from "@/app/api/_lib/internalAuth";
import {
  enforceRateLimit,
  getRateLimitPerMinute,
  rateLimitErrorResponse,
} from "@/app/api/_lib/rateLimit";
import type { ImportedArtifactKind } from "@/lib/contracts/company";

const MAX_FILES = 8;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_PARSE_AUTH_BODY_BYTES = (MAX_FILES * MAX_FILE_BYTES) + (1024 * 1024);
const MAX_MULTIPART_BODY_BYTES = MAX_PARSE_AUTH_BODY_BYTES;

type ParseResponse = {
  artifacts?: Array<Record<string, unknown> & {
    id: string;
    kind: ImportedArtifactKind;
    originalFilename: string;
    parserName: string;
    fileFormat: string;
  }>;
};

const readPreferredKind = (value: FormDataEntryValue | null): ImportedArtifactKind | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }
  if (
    value === "incomeStatement" ||
    value === "balanceSheet" ||
    value === "cashFlow" ||
    value === "sharesMeta"
  ) {
    return value;
  }
  return undefined;
};

const uploadToConvexStorage = async (
  bytes: Buffer,
  contentType?: string,
): Promise<string | undefined> => {
  const convexClient = getConvexClient();
  const syncToken = getSyncTokenOptional();
  if (!convexClient || !syncToken) {
    return undefined;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- avoids deep Convex type instantiation
  const uploadUrl = await (convexClient as any).mutation("imports:generateUploadUrl" as any, {
    syncToken,
  });
  const uploadResponse = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": contentType || "application/octet-stream" },
    body: new Blob([new Uint8Array(bytes)]),
  });
  if (!uploadResponse.ok) {
    throw new Error("Import artifact upload failed");
  }
  const payload = (await uploadResponse.json()) as { storageId?: string };
  return payload.storageId;
};

export async function POST(request: Request) {
  const rateLimit = await enforceRateLimit(request, {
    key: "api:company:import:parse",
    limit: getRateLimitPerMinute("API_RATE_LIMIT_IMPORT_PARSE_PER_MINUTE", 12),
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return rateLimitErrorResponse(rateLimit);
  }

  const listingId = new URL(request.url).searchParams.get("listingId")?.trim();
  if (!listingId) {
    return errorResponse("BAD_REQUEST", "Missing listingId parameter", 400);
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    const parsedLength = Number.parseInt(contentLength, 10);
    if (Number.isFinite(parsedLength) && parsedLength > MAX_MULTIPART_BODY_BYTES) {
      return errorResponse("PAYLOAD_TOO_LARGE", "Import request body is too large", 413);
    }
  }
  const canPersistArtifacts = await isInternalPersistenceRequest(request.clone(), {
    maxBodyBytes: MAX_PARSE_AUTH_BODY_BYTES,
  });

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return errorResponse("BAD_REQUEST", "Invalid multipart form data", 400);
  }

  const files = formData.getAll("files").filter((value): value is File => value instanceof File);
  if (files.length === 0) {
    return errorResponse("BAD_REQUEST", "No files were provided", 400);
  }
  if (files.length > MAX_FILES) {
    return errorResponse("BAD_REQUEST", `Too many files: maximum ${MAX_FILES}`, 400);
  }

  const preferredKind = readPreferredKind(formData.get("preferredKind"));
  const parseArtifacts = [];
  const uploadCandidatesByArtifactId = new Map<string, { bytes: Buffer; byteSize: number; contentType?: string }>();
  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) {
      return errorResponse("PAYLOAD_TOO_LARGE", `${file.name} is too large`, 413);
    }
    const artifactId = randomUUID();
    const bytes = Buffer.from(await file.arrayBuffer());
    uploadCandidatesByArtifactId.set(artifactId, {
      bytes,
      byteSize: bytes.byteLength,
      contentType: file.type || undefined,
    });
    parseArtifacts.push({
      id: artifactId,
      originalFilename: file.name,
      contentType: file.type || undefined,
      contentBase64: bytes.toString("base64"),
      preferredKind,
    });
  }

  let parsed: ParseResponse;
  try {
    parsed = await fetchDcfEngine<ParseResponse>("/company/import/parse", {
      method: "POST",
      body: JSON.stringify({ artifacts: parseArtifacts }),
    });
  } catch (error) {
    console.error("Import parse failed", error);
    const status = error instanceof DcfEngineHttpError ? error.status : 502;
    return errorResponse("IMPORT_PARSE_ERROR", "Import parse failed", status);
  }

  const convexClient = getConvexClient();
  const syncToken = getSyncTokenOptional();
  if (canPersistArtifacts && convexClient && syncToken) {
    try {
      for (const artifact of parsed.artifacts ?? []) {
        const stored = uploadCandidatesByArtifactId.get(artifact.id);
        const storageId = stored
          ? await uploadToConvexStorage(stored.bytes, stored.contentType)
          : undefined;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- avoids deep Convex type instantiation
        await (convexClient as any).mutation("imports:saveParsedArtifact" as any, {
          syncToken,
          listingId,
          artifactId: artifact.id,
          kind: artifact.kind,
          originalFilename: artifact.originalFilename,
          parserName: artifact.parserName,
          fileFormat: artifact.fileFormat,
          contentType: stored?.contentType,
          byteSize: stored?.byteSize ?? 0,
          storageId,
          parseResult: artifact,
        });
      }
    } catch (error) {
      console.warn("Import artifact persistence failed", error);
    }
  }

  return NextResponse.json(parsed);
}
