'use client';

import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';

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
  const data = useQuery(api.catalog.getSidebar);

  return {
    data: data as CatalogData | undefined,
    isLoading: data === undefined,
    categories: data?.categories ?? [],
    regions: data?.regions ?? [],
  };
}
