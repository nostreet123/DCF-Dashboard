/// <reference types="bun-types" />
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import {
  __resetConvexApiBootstrapForTests,
  __setModuleRequireForTests,
  getConvexApi,
} from "../lib/hooks/convexApiBootstrap";

const originalNodeEnv = process.env.NODE_ENV;
const processEnv = process.env as Record<string, string | undefined>;

describe("convexApiBootstrap", () => {
  beforeEach(() => {
    processEnv.NODE_ENV = "test";
    __resetConvexApiBootstrapForTests();
  });

  afterEach(() => {
    __resetConvexApiBootstrapForTests();
    if (originalNodeEnv === undefined) {
      delete processEnv.NODE_ENV;
    } else {
      processEnv.NODE_ENV = originalNodeEnv;
    }
  });

  test("returns an empty API object when generated and fallback modules are unavailable", () => {
    __setModuleRequireForTests(() => {
      throw new Error("module missing");
    });

    const api = getConvexApi();
    expect(api).toEqual({});
  });

  test("uses convex/server anyApi fallback when generated API is unavailable", () => {
    const anyApiFallback = { companies: { search: "ref" } };

    __setModuleRequireForTests((moduleId) => {
      if (moduleId === "@/convex/_generated/api") {
        throw new Error("generated API missing");
      }
      if (moduleId === "convex/server") {
        return { anyApi: anyApiFallback };
      }
      throw new Error(`Unexpected module: ${moduleId}`);
    });

    const api = getConvexApi();
    expect(api).toBe(anyApiFallback);
  });

  test("caches the resolved API after the first successful bootstrap", () => {
    let calls = 0;
    const anyApiFallback = { catalog: { getSidebar: "ref" } };

    __setModuleRequireForTests((moduleId) => {
      calls += 1;
      if (moduleId === "@/convex/_generated/api") {
        throw new Error("generated API missing");
      }
      if (moduleId === "convex/server") {
        return { anyApi: anyApiFallback };
      }
      throw new Error(`Unexpected module: ${moduleId}`);
    });

    const first = getConvexApi();
    const second = getConvexApi();

    expect(first).toBe(anyApiFallback);
    expect(second).toBe(anyApiFallback);
    expect(calls).toBe(2);
  });
});
