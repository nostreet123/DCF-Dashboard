import { afterEach, describe, expect, test } from "bun:test";

import { GET, POST } from "../app/api/company/facts/route";
import { createInternalPersistenceHeaders } from "../app/api/_lib/internalAuth";
import { resetRateLimitStateForTests } from "../app/api/_lib/rateLimit";

const originalInternalPersistenceKey = process.env.INTERNAL_PERSISTENCE_KEY;

afterEach(() => {
  resetRateLimitStateForTests();
  if (originalInternalPersistenceKey === undefined) {
    delete process.env.INTERNAL_PERSISTENCE_KEY;
  } else {
    process.env.INTERNAL_PERSISTENCE_KEY = originalInternalPersistenceKey;
  }
});

describe("company facts route auth boundaries", () => {
  test("GET returns bad request when symbol is missing", async () => {
    const response = await GET(new Request("http://localhost/api/company/facts"));
    expect(response.status).toBe(400);
  });

  test("POST rejects unauthorized persistence requests", async () => {
    process.env.INTERNAL_PERSISTENCE_KEY = "secret";
    const response = await POST(
      new Request("http://localhost/api/company/facts?symbol=AAPL", {
        method: "POST",
      }),
    );
    expect(response.status).toBe(401);
  });

  test("POST validates symbol even for authorized requests", async () => {
    process.env.INTERNAL_PERSISTENCE_KEY = "secret";
    const authHeaders = createInternalPersistenceHeaders({
      secret: "secret",
      method: "POST",
      url: "http://localhost/api/company/facts",
      body: "",
      nonce: "company-facts-auth-test",
      timestampMs: Date.now(),
    });
    const response = await POST(
      new Request("http://localhost/api/company/facts", {
        method: "POST",
        headers: authHeaders,
      }),
    );
    expect(response.status).toBe(400);
  });
});
