# Common Maintenance Failures (Convex)

## UNAUTHORIZED

Symptoms:
- Error includes `ConvexError` with code `UNAUTHORIZED`.
- Typically happens when a mutation/query requires `syncToken` but the caller did not provide it.

Checks:
- Confirm the called function uses `requireSyncToken()` or otherwise enforces a token.
- Confirm `DAMODARAN_SYNC_TOKEN` is set in the environment where the caller runs.

Fix:
- For local dev scripts, load `.env.local` or `.env` (gitignored) and pass `syncToken`.
- For deployed Convex env vars, set the token via the Convex dashboard or CLI.

## CONFLICT (Locks / Already Running)

Symptoms:
- Messages like `Duplicate scan already running`.
- State rows exist with status `running`, or an in-flight lock hasn't expired.

Checks:
- Locate the state tables:
  - `duplicateScanState`
  - `duplicateCleanupState`
- Locate public mutations:
  - `startDuplicateScan`, `stopDuplicateScan`
  - `startDuplicateCleanup`, `stopDuplicateCleanup`

Fix:
- Prefer calling the stop mutation rather than manually patching state rows.
- If a scheduled job is stuck, inspect lock fields like `inFlightUntil` (if present) and the `runId` deconfliction logic.

## Inspecting State Rows (CLI)

These maintenance queries require a `syncToken`.

Examples:
- Get current scan state:
  - `bunx convex run maintenance:getDuplicateScanState '{"syncToken":"<REDACTED>"}'`
- Get current cleanup state:
  - `bunx convex run maintenance:getDuplicateCleanupState '{"syncToken":"<REDACTED>"}'`
- Stop a stuck scan/cleanup:
  - `bunx convex run maintenance:stopDuplicateScan '{"syncToken":"<REDACTED>"}'`
  - `bunx convex run maintenance:stopDuplicateCleanup '{"syncToken":"<REDACTED>"}'`

## ArgumentValidationError / ReturnsValidationError

Symptoms:
- Error text includes `ArgumentValidationError` or `ReturnsValidationError`.

Checks:
- Open the function definition and inspect:
  - `args` validator
  - `returns` validator
- Confirm any code path returns the exact declared shape (including optional fields).

Fix:
- Update either:
  - the validator to match the actual data, or
  - the returned data to match the validator,
  but not both unless you also update callers.
