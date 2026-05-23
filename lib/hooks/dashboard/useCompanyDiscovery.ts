'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CompanySearchResult } from '@/lib/contracts/company';
import type { CoverageFilter, WorkspaceMode } from '@/lib/dashboard/viewModel';
import { resolveActiveCompany, type RailVariant } from '@/lib/hooks/useWorkbenchViewState';
import { mockDatasets } from '@/lib/workbench/mockData';

const getCompanySearchSymbol = (company: CompanySearchResult): string | null => {
  const symbol = company.symbol;
  return symbol?.trim() || null;
};

const getCompanySearchId = (company: CompanySearchResult, symbol: string): string =>
  company.id ?? `search:${symbol}`;

const workspaceModeForCoverage = (coverageState: CompanySearchResult['coverageState']): WorkspaceMode => {
  if (coverageState === 'import_required') {
    return 'import';
  }
  if (coverageState === 'detail_only') {
    return 'detail';
  }
  return 'valuation';
};

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

  const searchRequestIdRef = useRef(0);
  const detailRequestIdRef = useRef(0);
  const didBootstrapUrlSearchRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const raw = window.localStorage.getItem('dcf-dashboard:recent-companies');
    if (!raw) {
      return;
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        setRecentCompanies(parsed.filter((item): item is CompanySearchResult => {
          return Boolean(item && typeof item === 'object' && 'id' in item && 'symbol' in item);
        }).slice(0, 8));
      }
    } catch {
      setRecentCompanies([]);
    }
  }, []);

  const rememberCompany = useCallback((company: CompanySearchResult) => {
    setRecentCompanies((current) => {
      const next = [company, ...current.filter((item) => item.id !== company.id)].slice(0, 8);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('dcf-dashboard:recent-companies', JSON.stringify(next));
      }
      return next;
    });
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
      if (!applyCompanySelection(company)) {
        return;
      }
      const detailRequestId = detailRequestIdRef.current + 1;
      detailRequestIdRef.current = detailRequestId;
      void fetch(`/api/company/detail?id=${encodeURIComponent(company.id)}`)
        .then(async (detailResponse) => (detailResponse.ok ? detailResponse.json() : null))
        .then((detail: CompanySearchResult | null) => {
          if (detailRequestId === detailRequestIdRef.current && detail?.id === company.id) {
            setCompanyDetail(detail);
            setSelectedSearchCompany(detail);
            rememberCompany(detail);
            setWorkspaceMode(workspaceModeForCoverage(detail.coverageState));
          }
        })
        .catch(() => undefined);
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
      const candidates = await fetchSearchResults(normalizedQuery, 10);
      const company =
        coverageFilter === 'all'
          ? candidates.find((item) => item.coverageState === 'valuation_ready') ?? candidates[0]
          : candidates.find((item) => item.coverageState === coverageFilter);
      if (!company) {
        setSearchFeedback(`No matching company found for "${normalizedQuery}".`);
        return;
      }
      handleSelectSearchResult(company);
    },
    [coverageFilter, fetchSearchResults, handleSelectSearchResult],
  );

  useEffect(() => {
    if (didBootstrapUrlSearchRef.current || typeof window === 'undefined') {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const initialQuery = params.get('company-search')?.trim() ?? params.get('symbol')?.trim();
    if (!initialQuery) {
      return;
    }

    didBootstrapUrlSearchRef.current = true;
    params.delete('company-search');
    const nextSearch = params.toString();
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`,
    );
    void handleSearch(initialQuery);
  }, [handleSearch]);

  const handleSelectCompany = useCallback(
    (id: string, source: RailVariant) => {
      const company = isDemoMode ? resolveActiveCompany(mockDatasets, id) : null;
      const recent = recentCompanies.find((item) => item.id === id) ?? null;
      if (!isDemoMode && recent) {
        const detailRequestId = detailRequestIdRef.current + 1;
        detailRequestIdRef.current = detailRequestId;
        onCompanyChange();
        void (async () => {
          let selected = recent;
          try {
            const response = await fetch(`/api/company/detail?id=${encodeURIComponent(recent.id)}`);
            const detail = (await response.json().catch(() => null)) as CompanySearchResult | null;
            if (response.ok && detail && detailRequestId === detailRequestIdRef.current && detail.id === recent.id) {
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
    handleSearch,
    handleSearchPreview,
    handleSelectSearchResult,
    handleSelectCompany,
  };
}
