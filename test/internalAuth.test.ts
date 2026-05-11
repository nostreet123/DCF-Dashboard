import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import {
  createInternalPersistenceHeaders,
  internalPersistenceNonceHeaderName,
  internalPersistenceTimestampHeaderName,
  internalPersistenceHeaderName,
  isInternalPersistenceRequest,
  resetInternalAuthStateForTests,
} from "../app/api/_lib/internalAuth";
import { installSecurityMutationsMock } from "./helpers/securityMutationsMock";

const originalInternalPersistenceKey = process.env.INTERNAL_PERSISTENCE_KEY;
const originalConvexUrl = process.env.CONVEX_URL;
const originalSyncToken = process.env.DAMODARAN_SYNC_TOKEN;

let restoreSecurityMock: (() => void) | null = null;

beforeEach(() => {
  process.env.CONVEX_URL = "https://example.convex.cloud";
  process.env.DAMODARAN_SYNC_TOKEN = "sync-token";
  const securityMock = installSecurityMutationsMock();
  restoreSecurityMock = securityMock.restore;
});

afterEach(() => {
  resetInternalAuthStateForTests();
  if (restoreSecurityMock) {
    restoreSecurityMock();
  }
  restoreSecurityMock = null;

  if (originalConvexUrl === undefined) {
    delete process.env.CONVEX_URL;
  } else {
    process.env.CONVEX_URL = originalConvexUrl;
  }
  if (originalSyncToken === undefined) {
    delete process.env.DAMODARAN_SYNC_TOKEN;
  } else {
    process.env.DAMODARAN_SYNC_TOKEN = originalSyncToken;
  }
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

  test("rejects a concurrent replay attempt for the same nonce", async () => {
    process.env.INTERNAL_PERSISTENCE_KEY = "secret";
    const body = JSON.stringify({ requestId: "req-concurrent" });
    const headers = createInternalPersistenceHeaders({
      secret: "secret",
      method: "POST",
      url: "http://localhost/api/dcf/run",
      body,
      nonce: "nonce-concurrent",
      timestampMs: Date.now(),
    });

    const first = new Request("http://localhost/api/dcf/run", {
      method: "POST",
      headers,
      body,
    });
    const second = new Request("http://localhost/api/dcf/run", {
      method: "POST",
      headers: {
        [internalPersistenceHeaderName]: headers[internalPersistenceHeaderName],
        [internalPersistenceTimestampHeaderName]: headers[internalPersistenceTimestampHeaderName],
        [internalPersistenceNonceHeaderName]: headers[internalPersistenceNonceHeaderName],
      },
      body,
    });

    const [firstAllowed, secondAllowed] = await Promise.all([
      isInternalPersistenceRequest(first),
      isInternalPersistenceRequest(second),
    ]);
    const allowedCount = [firstAllowed, secondAllowed].filter(Boolean).length;
    expect(allowedCount).toBe(1);
  });

  test("rejects oversized signed payloads during auth verification", async () => {
    process.env.INTERNAL_PERSISTENCE_KEY = "secret";
    const body = "a".repeat(210 * 1024);
    const headers = createInternalPersistenceHeaders({
      secret: "secret",
      method: "POST",
      url: "http://localhost/api/dcf/run",
      body,
      nonce: "nonce-oversized",
      timestampMs: Date.now(),
    });
    const request = new Request("http://localhost/api/dcf/run", {
      method: "POST",
      headers,
      body,
    });

    expect(await isInternalPersistenceRequest(request)).toBeFalse();
  });

  test("rejects nonclosing oversized streamed payloads without waiting for body cancellation", async () => {
    process.env.INTERNAL_PERSISTENCE_KEY = "secret";
    const maxBodyBytes = 1024;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(maxBodyBytes + 1));
      },
    });
    const request = new Request("http://localhost/api/dcf/run", {
      method: "POST",
      headers: {
        [internalPersistenceHeaderName]: "invalid-signature",
        [internalPersistenceTimestampHeaderName]: String(Date.now()),
        [internalPersistenceNonceHeaderName]: "nonce-nonclosing-oversized",
      },
      body,
      duplex: "half",
    } as RequestInit & { duplex: "half" });

    const result = await Promise.race([
      isInternalPersistenceRequest(request, { maxBodyBytes }),
      new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), 100)),
    ]);

    await request.body?.cancel("test cleanup").catch(() => undefined);

    expect(result).toBeFalse();
  });
});
