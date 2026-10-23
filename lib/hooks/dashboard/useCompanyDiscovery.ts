'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CompanySearchResult } from '@/lib/contracts/company';
import type { CoverageFilter, WorkspaceMode } from '@/lib/dashboard/viewModel';
import { resolveActiveCompany, type RailVariant } from '@/lib/hooks/useWorkbenchViewState';
import { markRecentCompanyReady, readRecentCompanies, rememberRecentCompany } from '@/lib/lab/recentCompanies';
import { mockDatasets } from '@/lib/workbench/mockData';

const getCompanySearchSymbol = (company: CompanySearchResult): string | null => {
  const symbol = company.symbol;
  return symbol?.trim() || null;
};

const getCompanySearchId = (company: CompanySearchResult, symbol: string): string =>
  company.id ?? `search:${symbol}`;

export const workspaceModeForCoverage = (coverageState: CompanySearchResult['coverageState']): WorkspaceMode => {
  if (coverageState === 'import_required') {
    return 'import';
  }
  if (coverageState === 'detail_only') {
    return 'detail';
  }
  return 'valuation';
};

export function companyDiscoveryBootstrapFromUrl(
  pathname: string,
  search: string,
): { kind: 'listing'; listingId: string } | { kind: 'search'; query: string } | null {
  const params = new URLSearchParams(search);
  if (pathname === '/workbench') {
    const listingId = params.get('listingId')?.trim();
    if (listingId) {
      return { kind: 'listing', listingId };
    }
  }
  const query = params.get('company-search')?.trim() ?? params.get('symbol')?.trim();
  return query ? { kind: 'search', query } : null;
}

export async function applyLatestRequest<T>(
  requestId: number,
  currentRequestId: () => number,
  request: () => Promise<T>,
  onSuccess: (result: T) => void,
  onError: () => void,
): Promise<void> {
  let result: T;
  try {
    result = await request();
  } catch {
    if (requestId === currentRequestId()) {
      onError();
    }
    return;
  }
  if (requestId === currentRequestId()) {
    onSuccess(result);
  }
}

export function applyLatestSearchSelection<T>(
  requestId: number,
  currentRequestId: () => number,
  request: () => Promise<T[]>,
  choose: (results: T[]) => T | null,
  onSelect: (result: T) => void,
  onEmpty: () => void,
): Promise<void> {
  return applyLatestRequest(
    requestId,
    currentRequestId,
    request,
    (results) => {
      const selected = choose(results);
      if (selected !== null) {
        onSelect(selected);
      } else {
        onEmpty();
      }
    },
    () => undefined,
  );
}

export function useCompanyDiscovery({
  isDemoMode,
  selectCompany,
  setSelectedRunId,
  onCompanySelected,
  onCompanyChange,
}: {
  isDemoMode: boolean;
  selectCompany: (id: string, symbol: string | null) => void;
  setSelectedRunId: (runId: string | null) => void;
  onCompanySelected: (source: RailVariant) => void;
  onCompanyChange: () => void;
}) {
  const [searchFeedback, setSearchFeedback] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<CompanySearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedSearchCompany, setSelectedSearchCompany] = useState<CompanySearchResult | null>(null);
  const [companyDetail, setCompanyDetail] = useState<CompanySearchResult | null>(null);
  const [coverageFilter, setCoverageFilter] = useState<CoverageFilter>('all');
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('valuation');
  const [recentCompanies, setRecentCompanies] = useState<CompanySearchResult[]>([]);
  const recentCompaniesRef = useRef<CompanySearchResult[]>([]);

  const searchRequestIdRef = useRef(0);
  const detailRequestIdRef = useRef(0);
  const didBootstrapUrlSearchRef = useRef(false);

  useEffect(() => {
    const recent = readRecentCompanies();
    recentCompaniesRef.current = recent;
    setRecentCompanies(recent);
  }, []);

  const rememberCompany = useCallback((company: CompanySearchResult) => {
    const next = rememberRecentCompany(company, recentCompaniesRef.current);
    recentCompaniesRef.current = next;
    setRecentCompanies(next);
  }, []);

  const markCompanyReady = useCallback((company: CompanySearchResult) => {
    const next = markRecentCompanyReady(company, recentCompaniesRef.current);
    recentCompaniesRef.current = next;
    setRecentCompanies(next);
  }, []);

  const applyCompanySelection = useCallback(
    (company: CompanySearchResult): boolean => {
      const symbol = getCompanySearchSymbol(company);
      if (!symbol) {
        setSearchFeedback('Search result did not include a ticker symbol.');
        return false;
      }
      setSearchFeedback(null);
      setSearchResults([]);
      setSelectedRunId(null);
      onCompanyChange();
      setSelectedSearchCompany(company);
      setCompanyDetail(company);
      rememberCompany(company);
      selectCompany(getCompanySearchId(company, symbol), symbol);
      setWorkspaceMode(workspaceModeForCoverage(company.coverageState));
      return true;
    },
    [onCompanyChange, rememberCompany, selectCompany, setSelectedRunId],
  );

  const handleSelectSearchResult = useCallback(
    (company: CompanySearchResult) => {
      const detailRequestId = ++detailRequestIdRef.current;
      searchRequestIdRef.current += 1;
      if (!applyCompanySelection(company)) {
        return;
      }
      void applyLatestRequest(
        detailRequestId,
        () => detailRequestIdRef.current,
        async () => {
          const response = await fetch(`/api/company/detail?id=${encodeURIComponent(company.id)}`);
          return response.ok ? (await response.json()) as CompanySearchResult : null;
        },
        (detail) => {
          if (detail?.id === company.id) {
            setCompanyDetail(detail);
            setSelectedSearchCompany(detail);
            rememberCompany(detail);
            setWorkspaceMode(workspaceModeForCoverage(detail.coverageState));
          }
        },
        () => undefined,
      );
    },
    [applyCompanySelection, rememberCompany],
  );

  const fetchSearchResults = useCallback(
    async (query: string, limit: number): Promise<CompanySearchResult[]> => {
      const normalizedQuery = query.trim();
      if (!normalizedQuery) {
        setSearchResults([]);
        return [];
      }
      const requestId = searchRequestIdRef.current + 1;
      searchRequestIdRef.current = requestId;
      setIsSearching(true);
      if (isDemoMode) {
        const normalizedLower = normalizedQuery.toLowerCase();
        const results = Object.values(mockDatasets)
          .flat()
          .filter(
            (company) =>
              company.ticker.toLowerCase().includes(normalizedLower) ||
              company.name.toLowerCase().includes(normalizedLower),
          )
          .slice(0, limit)
          .map((company) => ({
            id: company.id,
            symbol: company.ticker,
            name: company.name,
            exchangeMic: 'XNAS',
            market: 'Nasdaq',
            country: 'US',
            currency: 'USD',
            coverageState: 'valuation_ready' as const,
            coverageReason: 'Valuation-ready from the demo catalog.',
            sourceLinks: [],
          }));
        if (requestId === searchRequestIdRef.current) {
          setSearchResults(results);
          setIsSearching(false);
        }
        return results;
      }

      try {
        const response = await fetch(
          `/api/company/search?q=${encodeURIComponent(normalizedQuery)}&limit=${limit}`,
          { method: 'GET' },
        );
        const payload = (await response.json().catch(() => ({}))) as {
          message?: string;
          results?: CompanySearchResult[];
        };
        if (requestId !== searchRequestIdRef.current) {
          return [];
        }
        if (!response.ok) {
          throw new Error(payload.message ?? `Search failed (${response.status})`);
        }
        const results = payload.results ?? [];
        setSearchResults(results);
        return results;
      } catch (searchError) {
        if (requestId !== searchRequestIdRef.current) {
          return [];
        }
        setSearchResults([]);
        setSearchFeedback(
          searchError instanceof Error ? searchError.message : 'Company search failed.',
        );
        return [];
      } finally {
        if (requestId === searchRequestIdRef.current) {
          setIsSearching(false);
        }
      }
    },
    [isDemoMode],
  );

  const handleSearchPreview = useCallback(
    async (query: string) => {
      const normalizedQuery = query.trim();
      if (normalizedQuery.length < 2) {
        searchRequestIdRef.current += 1;
        setSearchResults([]);
        setIsSearching(false);
        return;
      }
      setSearchFeedback(null);
      await fetchSearchResults(normalizedQuery, 6);
    },
    [fetchSearchResults],
  );

  const handleSearch = useCallback(
    async (query: string) => {
      const normalizedQuery = query.trim();
      if (!normalizedQuery) {
        setSearchFeedback('Enter a ticker or company name to search.');
        return;
      }

      setSearchFeedback('Searching companies...');
      const detailRequestId = ++detailRequestIdRef.current;
      await applyLatestSearchSelection(
        detailRequestId,
        () => detailRequestIdRef.current,
        () => fetchSearchResults(normalizedQuery, 10),
        (candidates) => coverageFilter === 'all'
          ? candidates.find((item) => item.coverageState === 'valuation_ready') ?? candidates[0] ?? null
          : candidates.find((item) => item.coverageState === coverageFilter) ?? null,
        handleSelectSearchResult,
        () => setSearchFeedback(`No matching company found for "${normalizedQuery}".`),
      );
    },
    [coverageFilter, fetchSearchResults, handleSelectSearchResult],
  );

  useEffect(() => {
    if (didBootstrapUrlSearchRef.current || typeof window === 'undefined') {
      return;
    }

    const bootstrap = companyDiscoveryBootstrapFromUrl(window.location.pathname, window.location.search);
    if (!bootstrap) {
      return;
    }

    didBootstrapUrlSearchRef.current = true;
    if (bootstrap.kind === 'listing') {
      const detailRequestId = ++detailRequestIdRef.current;
      setSearchFeedback('Loading company details…');
      setWorkspaceMode('detail');
      void applyLatestRequest(
        detailRequestId,
        () => detailRequestIdRef.current,
        async () => {
          const response = await fetch(`/api/company/detail?id=${encodeURIComponent(bootstrap.listingId)}`);
          return response.ok ? (await response.json()) as CompanySearchResult : null;
        },
        (company) => {
          if (company?.id === bootstrap.listingId) {
            applyCompanySelection(company);
          } else {
            setSearchFeedback('Could not load details for this listing.');
          }
        },
        () => setSearchFeedback('Could not load details for this listing.'),
      );
      return;
    }

    const params = new URLSearchParams(window.location.search);
    params.delete('company-search');
    const nextSearch = params.toString();
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`,
    );
    void handleSearch(bootstrap.query);
  }, [applyCompanySelection, handleSearch]);

  const handleSelectCompany = useCallback(
    (id: string, source: RailVariant) => {
      const company = isDemoMode ? resolveActiveCompany(mockDatasets, id) : null;
      const recent = recentCompanies.find((item) => item.id === id) ?? null;
      const detailRequestId = ++detailRequestIdRef.current;
      searchRequestIdRef.current += 1;
      if (!isDemoMode && recent) {
        onCompanyChange();
        void (async () => {
          let selected = recent;
          try {
            const response = await fetch(`/api/company/detail?id=${encodeURIComponent(recent.id)}`);
            const detail = (await response.json().catch(() => null)) as CompanySearchResult | null;
            if (response.ok && detail && detail.id === recent.id && detailRequestId === detailRequestIdRef.current) {
              selected = detail;
              rememberCompany(detail);
            }
          } catch {
            // Fall back to the locally remembered company if detail refresh fails.
          }
          if (detailRequestId !== detailRequestIdRef.current) {
            return;
          }
          const symbol = getCompanySearchSymbol(selected);
          setSearchFeedback(null);
          setSelectedRunId(null);
          setSelectedSearchCompany(selected);
          setCompanyDetail(selected);
          setWorkspaceMode(workspaceModeForCoverage(selected.coverageState));
          selectCompany(getCompanySearchId(selected, symbol ?? selected.symbol), symbol);
          onCompanySelected(source);
        })();
        return;
      }
      setSearchFeedback(null);
      setSelectedRunId(null);
      onCompanyChange();
      setSelectedSearchCompany(recent);
      setCompanyDetail(recent);
      setWorkspaceMode(
        recent ? workspaceModeForCoverage(recent.coverageState) : 'valuation',
      );
      selectCompany(company?.id ?? recent?.id ?? id, company?.ticker ?? recent?.symbol ?? null);
      onCompanySelected(source);
    },
    [
      isDemoMode,
      onCompanyChange,
      onCompanySelected,
      recentCompanies,
      rememberCompany,
      selectCompany,
      setSelectedRunId,
    ],
  );

  return {
    searchFeedback,
    searchResults,
    isSearching,
    selectedSearchCompany,
    companyDetail,
    coverageFilter,
    setCoverageFilter,
    workspaceMode,
    setWorkspaceMode,
    recentCompanies,
    markCompanyReady,
    handleSearch,
    handleSearchPreview,
    handleSelectSearchResult,
    handleSelectCompany,
  };
}
