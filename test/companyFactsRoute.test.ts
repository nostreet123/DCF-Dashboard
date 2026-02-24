/// <reference types="bun-types" />
import { afterEach, describe, expect, test } from "bun:test";

import { GET, POST } from "../app/api/company/facts/route";
import { internalPersistenceHeaderName } from "../app/api/_lib/internalAuth";

const originalInternalPersistenceKey = process.env.INTERNAL_PERSISTENCE_KEY;

afterEach(() => {
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
    const response = await POST(
      new Request("http://localhost/api/company/facts", {
        method: "POST",
        headers: {
          [internalPersistenceHeaderName]: "secret",
        },
      }),
    );
    expect(response.status).toBe(400);
  });
});
