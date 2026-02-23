import { afterEach, describe, expect, test } from "bun:test";

import {
  createInternalPersistenceHeaders,
  internalPersistenceNonceHeaderName,
  internalPersistenceTimestampHeaderName,
  internalPersistenceHeaderName,
  isInternalPersistenceRequest,
  resetInternalAuthStateForTests,
} from "../app/api/_lib/internalAuth";

const originalInternalPersistenceKey = process.env.INTERNAL_PERSISTENCE_KEY;

afterEach(() => {
  resetInternalAuthStateForTests();
  if (originalInternalPersistenceKey === undefined) {
    delete process.env.INTERNAL_PERSISTENCE_KEY;
  } else {
    process.env.INTERNAL_PERSISTENCE_KEY = originalInternalPersistenceKey;
  }
});

describe("internal persistence auth", () => {
  test("rejects requests when INTERNAL_PERSISTENCE_KEY is missing", async () => {
    delete process.env.INTERNAL_PERSISTENCE_KEY;
    const request = new Request("http://localhost/api/dcf/run", {
      method: "POST",
      headers: { [internalPersistenceHeaderName]: "secret" },
    });

    expect(await isInternalPersistenceRequest(request)).toBeFalse();
  });

  test("rejects requests without auth header", async () => {
    process.env.INTERNAL_PERSISTENCE_KEY = "secret";
    const request = new Request("http://localhost/api/dcf/run", {
      method: "POST",
    });

    expect(await isInternalPersistenceRequest(request)).toBeFalse();
  });

  test("rejects requests with wrong auth signature", async () => {
    process.env.INTERNAL_PERSISTENCE_KEY = "secret";
    const headers = createInternalPersistenceHeaders({
      secret: "secret",
      method: "POST",
      url: "http://localhost/api/dcf/run",
      body: "{}",
    });
    headers[internalPersistenceHeaderName] = "invalid-signature";
    const request = new Request("http://localhost/api/dcf/run", {
      method: "POST",
      headers,
      body: "{}",
    });

    expect(await isInternalPersistenceRequest(request)).toBeFalse();
  });

  test("accepts requests with valid signed headers", async () => {
    process.env.INTERNAL_PERSISTENCE_KEY = "secret";
    const body = JSON.stringify({ requestId: "req-1" });
    const headers = createInternalPersistenceHeaders({
      secret: "secret",
      method: "POST",
      url: "http://localhost/api/dcf/run",
      body,
      nonce: "nonce-1",
      timestampMs: Date.now(),
    });
    const request = new Request("http://localhost/api/dcf/run", {
      method: "POST",
      headers,
      body,
    });

    expect(await isInternalPersistenceRequest(request)).toBeTrue();
  });

  test("rejects stale timestamps", async () => {
    process.env.INTERNAL_PERSISTENCE_KEY = "secret";
    const staleTimestamp = Date.now() - 10 * 60 * 1000;
    const headers = createInternalPersistenceHeaders({
      secret: "secret",
      method: "POST",
      url: "http://localhost/api/dcf/run",
      body: "{}",
      nonce: "nonce-stale",
      timestampMs: staleTimestamp,
    });
    const request = new Request("http://localhost/api/dcf/run", {
      method: "POST",
      headers,
      body: "{}",
    });

    expect(await isInternalPersistenceRequest(request)).toBeFalse();
  });

  test("rejects replayed nonce", async () => {
    process.env.INTERNAL_PERSISTENCE_KEY = "secret";
    const headers = createInternalPersistenceHeaders({
      secret: "secret",
      method: "POST",
      url: "http://localhost/api/dcf/run",
      body: "{}",
      nonce: "nonce-replay",
      timestampMs: Date.now(),
    });

    const first = new Request("http://localhost/api/dcf/run", {
      method: "POST",
      headers,
      body: "{}",
    });
    const second = new Request("http://localhost/api/dcf/run", {
      method: "POST",
      headers: {
        [internalPersistenceHeaderName]: headers[internalPersistenceHeaderName],
        [internalPersistenceTimestampHeaderName]: headers[internalPersistenceTimestampHeaderName],
        [internalPersistenceNonceHeaderName]: headers[internalPersistenceNonceHeaderName],
      },
      body: "{}",
    });

    expect(await isInternalPersistenceRequest(first)).toBeTrue();
    expect(await isInternalPersistenceRequest(second)).toBeFalse();
  });
});
