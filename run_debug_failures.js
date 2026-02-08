const { ConvexHttpClient } = require("convex/browser");
const {
  loadProjectEnv,
  parseArgs,
  resolveConvexUrl,
  resolveSyncToken,
  toPositiveInt,
} = require("./script_utils");

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const env = loadProjectEnv();
  const convexUrl = resolveConvexUrl(env);
  const syncToken = resolveSyncToken(env);
  const limit = toPositiveInt(options.limit, 50);
  const source = options.source ? String(options.source).trim() : undefined;

  if (!convexUrl) {
    throw new Error("Missing CONVEX_URL.");
  }
  if (!syncToken) {
    throw new Error("Missing DAMODARAN_SYNC_TOKEN.");
  }

  const client = new ConvexHttpClient(convexUrl);
  const args = {
    syncToken,
    limit,
  };
  if (source) {
    args.source = source;
  }
  const failures = await client.query("debugEvents:listRecentFailures", args);

  process.stdout.write(`${JSON.stringify(failures, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
