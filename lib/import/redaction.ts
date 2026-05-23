export const redactPublicImportContext = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(redactPublicImportContext);
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  const redacted: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === "_id" || key === "_creationTime" || key === "storageId" || key === "parseResult") {
      continue;
    }
    redacted[key] =
      key === "url" && typeof child === "string" && child.startsWith("convex-storage:")
        ? "approved-import-artifact"
        : redactPublicImportContext(child);
  }
  return redacted;
};
