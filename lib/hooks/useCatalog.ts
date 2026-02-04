'use client';

import { useQuery } from 'convex/react';

// Avoid importing api directly to prevent deep type instantiation
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let api: any;
try {
  api = require('@/convex/_generated/api').api;
} catch {
  api = {};
}

interface Category {
  slug: string;
  name: string;
  description: string;
  sortOrder: number;
  datasets: Dataset[];
}

interface Dataset {
  key: string;
  name: string;
  description: string;
  categorySlug: string;
  dataType: 'industry' | 'country' | 'timeseries' | 'other';
  defaultRegionCode: string;
}

interface Region {
  code: string;
  name: string;
  sortOrder: number;
}

interface CatalogData {
  categories: Category[];
  regions: Region[];
}

/**
 * Hook to fetch the sidebar catalog data from Convex.
 * Returns categories with their datasets and available regions.
 */
export function useCatalog() {
  const data = useQuery(api.catalog?.getSidebar);

  return {
    data: data as CatalogData | undefined,
    isLoading: data === undefined,
    categories: (data?.categories ?? []) as Category[],
    regions: (data?.regions ?? []) as Region[],
  };
}
