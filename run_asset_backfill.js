const fs = require('fs');
const path = require('path');
const { ConvexHttpClient } = require('convex/browser');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.trim().startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let val = line.slice(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

const envLocal = loadEnvFile(path.join(process.cwd(), '.env.local'));
const envDot = loadEnvFile(path.join(process.cwd(), '.env'));

const convexUrl =
  process.env.CONVEX_URL ||
  envLocal.CONVEX_URL ||
  envLocal.VITE_CONVEX_URL ||
  envLocal.NEXT_PUBLIC_CONVEX_URL ||
  envDot.CONVEX_URL ||
  envDot.VITE_CONVEX_URL ||
  envDot.NEXT_PUBLIC_CONVEX_URL;
const syncToken = process.env.DAMODARAN_SYNC_TOKEN;

if (!convexUrl) {
  console.error('Missing CONVEX_URL.');
  process.exit(1);
}
if (!syncToken) {
  console.error('Missing DAMODARAN_SYNC_TOKEN.');
  process.exit(1);
}

const client = new ConvexHttpClient(convexUrl);

async function main() {
  let totalUpdated = 0;
  let pages = 0;
  for (const pageType of ['current', 'archive']) {
    let cursor = undefined;
    while (true) {
      const args = { syncToken, pageType, limit: 200 };
      if (cursor !== undefined) args.cursor = cursor;
      const res = await client.mutation('maintenance:backfillAssetKeysPage', args);
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
