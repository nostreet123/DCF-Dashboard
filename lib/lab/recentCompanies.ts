import type { CompanySearchResult } from '@/lib/contracts/company';

export const RECENT_COMPANIES_KEY = 'dcf-dashboard:recent-companies';

function isCompany(value: unknown): value is CompanySearchResult {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  return typeof record.id === 'string' && typeof record.symbol === 'string' && typeof record.name === 'string';
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

export function rememberRecentCompany(company: CompanySearchResult): CompanySearchResult[] {
  const next = [company, ...readRecentCompanies().filter((item) => item.id !== company.id)].slice(0, 8);
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(RECENT_COMPANIES_KEY, JSON.stringify(next));
  }
  return next;
}
