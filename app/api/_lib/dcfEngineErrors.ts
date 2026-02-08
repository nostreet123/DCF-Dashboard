export type MappedDcfEngineError = {
  code: "BAD_REQUEST" | "DCF_ENGINE_ERROR";
  message: string;
  status: 400 | 502;
  upstreamStatus?: number;
};

type EngineErrorLike = Error & { status: number };

const isEngineErrorLike = (error: unknown): error is EngineErrorLike => {
  return (
    error instanceof Error &&
    error.name === "DcfEngineHttpError" &&
    typeof (error as { status?: unknown }).status === "number"
  );
};

export const mapDcfEngineError = (
  error: unknown,
  fallbackMessage: string,
): MappedDcfEngineError => {
  if (isEngineErrorLike(error)) {
    if (error.status === 400 || error.status === 422) {
      return {
        code: "BAD_REQUEST",
        message: error.message,
        status: 400,
        upstreamStatus: error.status,
      };
    }
    return {
      code: "DCF_ENGINE_ERROR",
      message: error.message,
      status: 502,
      upstreamStatus: error.status,
    };
  }
  return {
    code: "DCF_ENGINE_ERROR",
    message: error instanceof Error ? error.message : fallbackMessage,
    status: 502,
  };
};
