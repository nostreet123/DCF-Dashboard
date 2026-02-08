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
  const correlationId = String(options["correlation-id"] || "").trim();
  const limit = toPositiveInt(options.limit, 100);

  if (!convexUrl) {
    throw new Error("Missing CONVEX_URL.");
  }
  if (!syncToken) {
    throw new Error("Missing DAMODARAN_SYNC_TOKEN.");
  }
  if (!correlationId) {
    throw new Error("Missing --correlation-id=<value>.");
  }

  const client = new ConvexHttpClient(convexUrl);
  const timeline = await client.query("debugEvents:getTimeline", {
    syncToken,
    correlationId,
    limit,
  });

  process.stdout.write(`${JSON.stringify(timeline, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
