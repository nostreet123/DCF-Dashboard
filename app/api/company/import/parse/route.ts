import { randomUUID } from "crypto";
import { NextResponse } from "next/server";

import {
  convexConfigured,
  mutationImportsGenerateUploadUrl,
  mutationImportsSaveParsedArtifact,
} from "@/app/api/_lib/convexServer";
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
const MAX_ENGINE_PARSE_BODY_BYTES = (65 * 1024 * 1024);
const MAX_MULTIPART_BODY_BYTES = Math.floor((MAX_ENGINE_PARSE_BODY_BYTES - (1024 * 1024)) * 3 / 4);
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_PARSE_AUTH_BODY_BYTES = MAX_ENGINE_PARSE_BODY_BYTES;

class MultipartBodyLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MultipartBodyLimitError";
  }
}

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
  if (!convexConfigured()) {
    return undefined;
  }
  const uploadUrl = (await mutationImportsGenerateUploadUrl()) as string;
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

const readMultipartBodyWithLimit = async (
  request: Request,
  maxBytes: number,
): Promise<Buffer> => {
  const lengthHeader = request.headers.get("content-length");
  if (lengthHeader) {
    const length = Number(lengthHeader);
    if (Number.isFinite(length) && length > maxBytes) {
      throw new MultipartBodyLimitError("Import request body is too large");
    }
  }

  const reader = request.body?.getReader();
  if (!reader) {
    const body = Buffer.from(await request.arrayBuffer());
    if (body.byteLength > maxBytes) {
      throw new MultipartBodyLimitError("Import request body is too large");
    }
    return body;
  }

  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (!value) {
      continue;
    }
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel().catch(() => {
        // Ignore cancellation failures; the route returns 413 below.
      });
      throw new MultipartBodyLimitError("Import request body is too large");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
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

  let requestBody: Buffer;
  try {
    requestBody = await readMultipartBodyWithLimit(request, MAX_MULTIPART_BODY_BYTES);
  } catch (error) {
    if (error instanceof MultipartBodyLimitError) {
      return errorResponse("PAYLOAD_TOO_LARGE", error.message, 413);
    }
    return errorResponse("BAD_REQUEST", "Invalid multipart form data", 400);
  }

  const boundedRequest = new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body: new Uint8Array(requestBody),
  });

  const canPersistArtifacts = await isInternalPersistenceRequest(boundedRequest.clone(), {
    maxBodyBytes: MAX_PARSE_AUTH_BODY_BYTES,
  });

  let formData: FormData;
  try {
    formData = await boundedRequest.formData();
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
  const engineBody = JSON.stringify({ artifacts: parseArtifacts });
  if (Buffer.byteLength(engineBody, "utf8") > MAX_ENGINE_PARSE_BODY_BYTES) {
    return errorResponse("PAYLOAD_TOO_LARGE", "Import request body is too large", 413);
  }

  try {
    parsed = await fetchDcfEngine<ParseResponse>("/company/import/parse", {
      method: "POST",
      body: engineBody,
    });
  } catch (error) {
    console.error("Import parse failed", error);
    const status = error instanceof DcfEngineHttpError ? error.status : 502;
    return errorResponse("IMPORT_PARSE_ERROR", "Import parse failed", status);
  }

  if (canPersistArtifacts && convexConfigured()) {
    try {
      for (const artifact of parsed.artifacts ?? []) {
        const stored = uploadCandidatesByArtifactId.get(artifact.id);
        const storageId = stored
          ? await uploadToConvexStorage(stored.bytes, stored.contentType)
          : undefined;
        await mutationImportsSaveParsedArtifact({
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
