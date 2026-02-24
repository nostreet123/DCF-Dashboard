/// <reference types="bun-types" />
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { GET as companyFactsGet } from "../app/api/company/facts/route";
import { GET as companySearchGet } from "../app/api/company/search/route";
import { POST as dcfPreviewPost } from "../app/api/dcf/preview/route";

const originalFetch = globalThis.fetch;
const originalDcfEngineUrl = process.env.DCF_ENGINE_URL;
const originalConvexUrl = process.env.CONVEX_URL;
const noopPreconnect: typeof fetch.preconnect = () => {};

function createMockFetch(
  impl: (...args: Parameters<typeof fetch>) => ReturnType<typeof fetch>,
): typeof fetch {
  return Object.assign(impl, { preconnect: noopPreconnect });
}

beforeEach(() => {
  process.env.DCF_ENGINE_URL = "http://example.test";
  delete process.env.CONVEX_URL;
});

afterEach(() => {
  globalThis.fetch = originalFetch;

  if (originalDcfEngineUrl === undefined) {
    delete process.env.DCF_ENGINE_URL;
  } else {
    process.env.DCF_ENGINE_URL = originalDcfEngineUrl;
  }

  if (originalConvexUrl === undefined) {
    delete process.env.CONVEX_URL;
  } else {
    process.env.CONVEX_URL = originalConvexUrl;
  }
});

const mockUpstreamError = (status = 500) => {
  globalThis.fetch = createMockFetch(async () =>
    new Response(JSON.stringify({ message: "sensitive upstream detail" }), {
      status,
      headers: { "Content-Type": "application/json" },
    }));
};

describe("API error sanitization", () => {
  test("dcf preview route propagates upstream HTTP status", async () => {
    mockUpstreamError(422);

    const response = await dcfPreviewPost(
      new Request("http://localhost/api/dcf/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(422);
    expect(json.code).toBe("DCF_ENGINE_ERROR");
  });

  test("dcf preview route defaults to 502 for unknown errors", async () => {
    globalThis.fetch = createMockFetch(async () => {
      throw new Error("Network error");
    });

    const response = await dcfPreviewPost(
      new Request("http://localhost/api/dcf/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(502);
  });

  test("company search route propagates upstream HTTP status", async () => {
    mockUpstreamError(429);

    const response = await companySearchGet(
      new Request("http://localhost/api/company/search?q=AAPL"),
    );
    const json = await response.json();

    expect(response.status).toBe(429);
    expect(json.code).toBe("EDGAR_ERROR");
  });

  test("company facts route propagates upstream HTTP status", async () => {
    mockUpstreamError(404);

    const response = await companyFactsGet(
      new Request("http://localhost/api/company/facts?symbol=AAPL"),
    );
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.code).toBe("EDGAR_ERROR");
  });
});
