import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { GET as companyFactsGet } from "../app/api/company/facts/route";
import { GET as companySearchGet } from "../app/api/company/search/route";
import { POST as dcfPreviewPost } from "../app/api/dcf/preview/route";

const originalFetch = globalThis.fetch;
const originalDcfEngineUrl = process.env.DCF_ENGINE_URL;
const originalConvexUrl = process.env.CONVEX_URL;

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

const mockUpstreamError = () => {
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ message: "sensitive upstream detail" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
};

describe("API error sanitization", () => {
  test("dcf preview route hides upstream error details", async () => {
    mockUpstreamError();

    const response = await dcfPreviewPost(
      new Request("http://localhost/api/dcf/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(502);
    expect(json).toEqual({
      code: "DCF_ENGINE_ERROR",
      message: "DCF compute failed",
    });
  });

  test("company search route hides upstream error details", async () => {
    mockUpstreamError();

    const response = await companySearchGet(
      new Request("http://localhost/api/company/search?q=AAPL"),
    );
    const json = await response.json();

    expect(response.status).toBe(502);
    expect(json).toEqual({
      code: "EDGAR_ERROR",
      message: "EDGAR search failed",
    });
  });

  test("company facts route hides upstream error details", async () => {
    mockUpstreamError();

    const response = await companyFactsGet(
      new Request("http://localhost/api/company/facts?symbol=AAPL"),
    );
    const json = await response.json();

    expect(response.status).toBe(502);
    expect(json).toEqual({
      code: "EDGAR_ERROR",
      message: "EDGAR facts failed",
    });
  });
});
