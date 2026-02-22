'use client';

import { useQuery } from 'convex/react';
import { useState, useEffect } from 'react';

// Avoid importing api directly to prevent deep type instantiation
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let api: any;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- avoids deep type instantiation from generated Convex API
  api = require('@/convex/_generated/api').api;
} catch {
  api = {};
}

interface Company {
  _id: string;
  symbol: string;
  name?: string;
  cik?: string;
  country?: string;
  currency?: string;
  source: string;
  updatedAt: number;
}

/**
 * Hook to search for companies with debouncing.
 */
export function useCompanySearch(query: string, limit: number = 10) {
  const [debouncedQuery, setDebouncedQuery] = useState(query);

  // Debounce the query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  const results = useQuery(
    api.companies?.search,
    debouncedQuery.trim() ? { q: debouncedQuery, limit } : 'skip'
  );

  const isLoading = debouncedQuery.trim() !== '' && results === undefined;

  return {
    results: (results as Company[] | undefined) ?? [],
    isLoading,
    query: debouncedQuery,
  };
}

/**
 * Hook to get a single company by symbol.
 */
export function useCompany(symbol: string | undefined) {
  const data = useQuery(
    api.companies?.get,
    symbol ? { symbol } : 'skip'
  );

  return {
    company: data as Company | null | undefined,
    isLoading: symbol !== undefined && data === undefined,
  };
}
