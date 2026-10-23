import type { CompanySearchResult } from '@/lib/contracts/company';

export const RECENT_COMPANIES_KEY = 'dcf-dashboard:recent-companies';

function isCompany(value: unknown): value is CompanySearchResult {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === 'string' &&
    typeof record.symbol === 'string' &&
    typeof record.name === 'string' &&
    (record.coverageState === 'valuation_ready' ||
      record.coverageState === 'import_required' ||
      record.coverageState === 'detail_only') &&
    Array.isArray(record.sourceLinks) &&
    record.sourceLinks.every((link) => {
      if (!link || typeof link !== 'object') {
        return false;
      }
      const source = link as Record<string, unknown>;
      return typeof source.title === 'string' && typeof source.url === 'string';
    })
  );
}

export function readRecentCompanies(): CompanySearchResult[] {
  if (typeof window === 'undefined') {
    return [];
  }
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RECENT_COMPANIES_KEY) ?? '[]') as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(isCompany).slice(0, 8);
  } catch {
    return [];
  }
}

export function rememberRecentCompany(
  company: CompanySearchResult,
  current: CompanySearchResult[] = [],
): CompanySearchResult[] {
  const seen = new Set<string>();
  const next = [company, ...readRecentCompanies(), ...current].filter((item) => {
    if (seen.has(item.id)) {
      return false;
    }
    seen.add(item.id);
    return true;
  }).slice(0, 8);
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(RECENT_COMPANIES_KEY, JSON.stringify(next));
    } catch {
      // Recent history is optional and must not interrupt navigation.
    }
  }
  return next;
}

export function markRecentCompanyReady(
  company: CompanySearchResult,
  current: CompanySearchResult[] = [],
): CompanySearchResult[] {
  return rememberRecentCompany({ ...company, coverageState: 'valuation_ready' }, current);
}
