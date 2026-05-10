const FMP_LOGO_BASE_URL = 'https://financialmodelingprep.com/image-stock';

export function getCompanyLogoUrl(symbol: string): string | null {
  const normalized = normalizeLogoSymbol(symbol);
  if (!normalized) {
    return null;
  }

  return `${FMP_LOGO_BASE_URL}/${encodeURIComponent(normalized)}.png`;
}

export function normalizeLogoSymbol(symbol: string): string | null {
  const normalized = symbol.trim().toUpperCase().replace(/\./g, '-');
  if (!/^[A-Z0-9-]{1,16}$/.test(normalized)) {
    return null;
  }
  return normalized;
}
