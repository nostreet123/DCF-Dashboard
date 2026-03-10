/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test";
import {
  resolvePlaywrightPort,
  resolvePlaywrightWebServer,
} from "../lib/utils/playwrightWebServer";

describe("playwright port resolution", () => {
  test("defaults to 3000 when no explicit Playwright port is provided", () => {
    expect(resolvePlaywrightPort({})).toBe(3000);
  });

  test("uses PLAYWRIGHT_PORT when provided", () => {
    expect(resolvePlaywrightPort({ PLAYWRIGHT_PORT: "4200", PORT: "3000" })).toBe(4200);
  });

  test("falls back to PORT when PLAYWRIGHT_PORT is not provided", () => {
    expect(resolvePlaywrightPort({ PORT: "3000" })).toBe(3000);
    expect(resolvePlaywrightPort({ PORT: "4100" })).toBe(4100);
  });

  test("falls back to 3000 when env values are invalid", () => {
    expect(resolvePlaywrightPort({ PLAYWRIGHT_PORT: "nope" })).toBe(3000);
    expect(resolvePlaywrightPort({ PLAYWRIGHT_PORT: "0" })).toBe(3000);
  });
});

describe("playwright web server config", () => {
  test("defaults to a production-like build-and-start server", () => {
    const result = resolvePlaywrightWebServer({
      port: 3000,
      externalBaseUrl: undefined,
      mode: undefined,
      env: { CI: "" },
    });

    expect(result).not.toBeNull();
    expect(result?.command).toBe("npm run build && npm run start -- --port 3000");
    expect(result?.reuseExistingServer).toBe(true);
    expect(result?.url).toBe("http://localhost:3000");
  });

  test("supports explicit dev mode for local interactive runs", () => {
    const result = resolvePlaywrightWebServer({
      port: 4173,
      externalBaseUrl: undefined,
      mode: "dev",
      env: {},
    });

    expect(result?.command).toBe("bun run dev -- --port 4173");
  });

  test("disables managed web server when an external base url is provided", () => {
    const result = resolvePlaywrightWebServer({
      port: 3000,
      externalBaseUrl: "http://127.0.0.1:3101",
      mode: undefined,
      env: {},
    });

    expect(result).toBeNull();
  });

  test("does not reuse existing servers in CI", () => {
    const result = resolvePlaywrightWebServer({
      port: 3000,
      externalBaseUrl: undefined,
      mode: undefined,
      env: { CI: "1" },
    });

    expect(result?.reuseExistingServer).toBe(false);
  });
});
