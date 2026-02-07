const fs = require("fs");
const path = require("path");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.trim().startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function loadProjectEnv() {
  return {
    envLocal: loadEnvFile(path.join(process.cwd(), ".env.local")),
    envDot: loadEnvFile(path.join(process.cwd(), ".env")),
  };
}

function resolveConvexUrl({ envLocal, envDot }) {
  return (
    process.env.CONVEX_URL ||
    envLocal.CONVEX_URL ||
    envLocal.VITE_CONVEX_URL ||
    envLocal.NEXT_PUBLIC_CONVEX_URL ||
    envDot.CONVEX_URL ||
    envDot.VITE_CONVEX_URL ||
    envDot.NEXT_PUBLIC_CONVEX_URL ||
    null
  );
}

function resolveSyncToken({ envLocal, envDot }) {
  return (
    process.env.DAMODARAN_SYNC_TOKEN ||
    envLocal.DAMODARAN_SYNC_TOKEN ||
    envDot.DAMODARAN_SYNC_TOKEN ||
    null
  );
}

function parseArgs(argv) {
  const options = {};
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const [key, value] = arg.slice(2).split("=", 2);
    options[key] = value === undefined ? "true" : value;
  }
  return options;
}

function toPositiveInt(value, fallback) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Expected positive integer, got: ${value}`);
  }
  return parsed;
}

module.exports = {
  loadEnvFile,
  loadProjectEnv,
  resolveConvexUrl,
  resolveSyncToken,
  parseArgs,
  toPositiveInt,
};
