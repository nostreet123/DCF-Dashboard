import { BodyLimitError, parseJsonWithLimit } from "@/app/api/_lib/body";
import {
  parseMonteCarloPreset,
  sanitizePayload,
} from "@/app/api/_lib/monteCarloPreset";

export class DcfRequestError extends Error {
  code: "BAD_REQUEST" | "PAYLOAD_TOO_LARGE";
  status: 400 | 413;

  constructor(
    code: "BAD_REQUEST" | "PAYLOAD_TOO_LARGE",
    message: string,
    status: 400 | 413,
  ) {
    super(message);
    this.name = "DcfRequestError";
    this.code = code;
    this.status = status;
  }
}

export type PreparedDcfRequest = {
  payload: Record<string, unknown>;
  basePayload: Record<string, unknown>;
  computePayload: Record<string, unknown>;
};

export const prepareDcfRequest = async (
  request: Request,
  includeTrace: boolean,
): Promise<PreparedDcfRequest> => {
  let payload: Record<string, unknown>;
  try {
    payload = await parseJsonWithLimit<Record<string, unknown>>(request);
  } catch (error) {
    if (error instanceof BodyLimitError) {
      throw new DcfRequestError("PAYLOAD_TOO_LARGE", error.message, 413);
    }
    throw new DcfRequestError("BAD_REQUEST", "Invalid JSON payload", 400);
  }

  const basePayload = sanitizePayload(payload);
  let monteCarlo;
  try {
    ({ monteCarlo } = parseMonteCarloPreset(request, basePayload));
  } catch (error) {
    throw new DcfRequestError(
      "BAD_REQUEST",
      error instanceof Error ? error.message : "Invalid mc parameter",
      400,
    );
  }

  return {
    payload,
    basePayload,
    computePayload: {
      ...basePayload,
      includeTrace,
      ...(monteCarlo ? { monteCarlo } : {}),
    },
  };
};
