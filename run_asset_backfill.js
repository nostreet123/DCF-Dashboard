const { ConvexHttpClient } = require("convex/browser");
const {
  loadProjectEnv,
  resolveConvexUrl,
  resolveSyncToken,
} = require("./script_utils");

const env = loadProjectEnv();
const convexUrl = resolveConvexUrl(env);
const syncToken = resolveSyncToken(env);

if (!convexUrl) {
  console.error("Missing CONVEX_URL.");
  process.exit(1);
}
if (!syncToken) {
  console.error("Missing DAMODARAN_SYNC_TOKEN.");
  process.exit(1);
}

const client = new ConvexHttpClient(convexUrl);

async function main() {
  let totalUpdated = 0;
  let pages = 0;
  for (const pageType of ["current", "archive"]) {
    let cursor = undefined;
    while (true) {
      const args = { syncToken, pageType, limit: 200 };
      if (cursor !== undefined) args.cursor = cursor;
      const res = await client.mutation("maintenance:backfillAssetKeysPage", args);
      totalUpdated += res.updated || 0;
      cursor = res.nextCursor ?? undefined;
      pages += 1;
      if (pages % 50 === 0) {
        console.log(`... pages=${pages} updated=${totalUpdated}`);
      }
      if (!cursor) break;
    }
  }
  console.log(`Done. pages=${pages} updated=${totalUpdated}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
