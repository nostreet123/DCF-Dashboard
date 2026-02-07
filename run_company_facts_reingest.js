const { ConvexHttpClient } = require("convex/browser");
const {
  loadProjectEnv,
  parseArgs,
  resolveConvexUrl,
  toPositiveInt,
} = require("./script_utils");

function uniqueSymbols(symbols) {
  const seen = new Set();
  const out = [];
  for (const symbol of symbols) {
    const normalized = String(symbol || "").trim().toUpperCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

async function fetchAllTrackedSymbols(client, pageSize, maxSymbols) {
  const symbols = [];
  let cursor = null;
  while (true) {
    const result = await client.query("companies:listSymbolsPage", {
      limit: pageSize,
      cursor: cursor ?? undefined,
    });
    symbols.push(...(result.symbols || []));
    if (maxSymbols !== null && symbols.length >= maxSymbols) {
      return uniqueSymbols(symbols).slice(0, maxSymbols);
    }
    cursor = result.nextCursor;
    if (!cursor) break;
  }
  return uniqueSymbols(symbols);
}

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function reingestSymbols({
  symbols,
  baseUrl,
  concurrency,
  timeoutMs,
}) {
  let nextIndex = 0;
  let success = 0;
  const failures = [];

  const worker = async () => {
    while (true) {
      const current = nextIndex;
      nextIndex += 1;
      if (current >= symbols.length) return;

      const symbol = symbols[current];
      const url = `${baseUrl}/api/company/facts?symbol=${encodeURIComponent(symbol)}`;
      try {
        const response = await fetchWithTimeout(url, timeoutMs);
        if (!response.ok) {
          const body = await response.text();
          failures.push({
            symbol,
            status: response.status,
            message: body.slice(0, 300),
          });
        } else {
          success += 1;
        }
      } catch (error) {
        failures.push({
          symbol,
          status: "request_error",
          message: error instanceof Error ? error.message : String(error),
        });
      }

      const processed = current + 1;
      if (processed % 10 === 0 || processed === symbols.length) {
        console.log(
          `progress=${processed}/${symbols.length} success=${success} failures=${failures.length}`,
        );
      }
    }
  };

  const workers = [];
  const workerCount = Math.min(concurrency, symbols.length);
  for (let i = 0; i < workerCount; i += 1) {
    workers.push(worker());
  }
  await Promise.all(workers);

  return { success, failures };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const convexUrl = resolveConvexUrl(loadProjectEnv());
  if (!convexUrl) {
    throw new Error("Missing CONVEX_URL.");
  }

  const baseUrl = (
    options["base-url"] ||
    process.env.COMPANY_FACTS_API_BASE_URL ||
    process.env.APP_BASE_URL ||
    "http://localhost:3000"
  ).replace(/\/+$/, "");
  const pageSize = toPositiveInt(options["page-size"], 200);
  const concurrency = toPositiveInt(options.concurrency, 4);
  const timeoutMs = toPositiveInt(options.timeout, 30000);
  const max = options.max ? toPositiveInt(options.max, 0) : null;

  const explicitSymbols = options.symbols
    ? uniqueSymbols(options.symbols.split(","))
    : null;
  const client = new ConvexHttpClient(convexUrl);

  let symbols = explicitSymbols;
  if (!symbols) {
    symbols = await fetchAllTrackedSymbols(client, pageSize, max);
  }
  if (max !== null) {
    symbols = symbols.slice(0, max);
  }

  if (symbols.length === 0) {
    console.log("No symbols found. Nothing to re-ingest.");
    return;
  }

  console.log(
    `Starting re-ingest for ${symbols.length} symbols via ${baseUrl}/api/company/facts`,
  );
  const { success, failures } = await reingestSymbols({
    symbols,
    baseUrl,
    concurrency,
    timeoutMs,
  });

  console.log(`Done. success=${success} failures=${failures.length}`);
  if (failures.length > 0) {
    const preview = failures.slice(0, 20);
    for (const failure of preview) {
      console.error(
        `FAIL symbol=${failure.symbol} status=${failure.status} message=${failure.message}`,
      );
    }
    if (failures.length > preview.length) {
      console.error(`... ${failures.length - preview.length} additional failures omitted`);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
