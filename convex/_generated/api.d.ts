/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as assets from "../assets.js";
import type * as catalog from "../catalog.js";
import type * as companies from "../companies.js";
import type * as companyStatements from "../companyStatements.js";
import type * as http from "../http.js";
import type * as industries from "../industries.js";
import type * as maintenance from "../maintenance.js";
import type * as maintenance_backfill from "../maintenance/backfill.js";
import type * as maintenance_duplicateCleanup from "../maintenance/duplicateCleanup.js";
import type * as maintenance_duplicateScan from "../maintenance/duplicateScan.js";
import type * as maintenance_pruning from "../maintenance/pruning.js";
import type * as maintenance_shared from "../maintenance/shared.js";
import type * as metrics from "../metrics.js";
import type * as reference from "../reference.js";
import type * as seed from "../seed.js";
import type * as snapshots from "../snapshots.js";
import type * as syncAuth from "../syncAuth.js";
import type * as syncErrors from "../syncErrors.js";
import type * as syncLogs from "../syncLogs.js";
import type * as syncManifests from "../syncManifests.js";
import type * as tableData from "../tableData.js";
import type * as valuations from "../valuations.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  assets: typeof assets;
  catalog: typeof catalog;
  companies: typeof companies;
  companyStatements: typeof companyStatements;
  http: typeof http;
  industries: typeof industries;
  maintenance: typeof maintenance;
  "maintenance/backfill": typeof maintenance_backfill;
  "maintenance/duplicateCleanup": typeof maintenance_duplicateCleanup;
  "maintenance/duplicateScan": typeof maintenance_duplicateScan;
  "maintenance/pruning": typeof maintenance_pruning;
  "maintenance/shared": typeof maintenance_shared;
  metrics: typeof metrics;
  reference: typeof reference;
  seed: typeof seed;
  snapshots: typeof snapshots;
  syncAuth: typeof syncAuth;
  syncErrors: typeof syncErrors;
  syncLogs: typeof syncLogs;
  syncManifests: typeof syncManifests;
  tableData: typeof tableData;
  valuations: typeof valuations;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
