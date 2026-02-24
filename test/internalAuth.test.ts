/// <reference types="bun-types" />
import { afterEach, describe, expect, test } from "bun:test";

import {
  internalPersistenceHeaderName,
  isInternalPersistenceRequest,
} from "../app/api/_lib/internalAuth";

const originalInternalPersistenceKey = process.env.INTERNAL_PERSISTENCE_KEY;

afterEach(() => {
  if (originalInternalPersistenceKey === undefined) {
    delete process.env.INTERNAL_PERSISTENCE_KEY;
  } else {
    process.env.INTERNAL_PERSISTENCE_KEY = originalInternalPersistenceKey;
  }
});

describe("internal persistence auth", () => {
  test("rejects requests when INTERNAL_PERSISTENCE_KEY is missing", () => {
    delete process.env.INTERNAL_PERSISTENCE_KEY;
    const request = new Request("http://localhost/api/dcf/run", {
      method: "POST",
      headers: { [internalPersistenceHeaderName]: "secret" },
    });

    expect(isInternalPersistenceRequest(request)).toBeFalse();
  });

  test("rejects requests without auth header", () => {
    process.env.INTERNAL_PERSISTENCE_KEY = "secret";
    const request = new Request("http://localhost/api/dcf/run", {
      method: "POST",
    });

    expect(isInternalPersistenceRequest(request)).toBeFalse();
  });

  test("rejects requests with wrong auth header", () => {
    process.env.INTERNAL_PERSISTENCE_KEY = "secret";
    const request = new Request("http://localhost/api/dcf/run", {
      method: "POST",
      headers: { [internalPersistenceHeaderName]: "wrong" },
    });

    expect(isInternalPersistenceRequest(request)).toBeFalse();
  });

  test("accepts requests with correct auth header", () => {
    process.env.INTERNAL_PERSISTENCE_KEY = "secret";
    const request = new Request("http://localhost/api/dcf/run", {
      method: "POST",
      headers: { [internalPersistenceHeaderName]: "secret" },
    });

    expect(isInternalPersistenceRequest(request)).toBeTrue();
  });
});
