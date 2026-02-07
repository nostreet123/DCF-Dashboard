export type CompanySearchItem = {
  symbol: string;
  name: string;
  cik: string;
};

export type CompanySearchResult = {
  results: CompanySearchItem[];
  source: "convex" | "edgar";
};

export type CompanySearchError = {
  code: "CONVEX_ERROR" | "EDGAR_ERROR";
  message: string;
  status: 500 | 502;
};

export type CompanySearchOutcome =
  | { ok: true; data: CompanySearchResult }
  | { ok: false; error: CompanySearchError };

type ExecuteCompanySearchArgs = {
  q: string;
  limit: number;
  hasEdgar: boolean;
  searchConvex: (q: string, limit: number) => Promise<CompanySearchItem[]>;
  searchEdgar: (q: string, limit: number) => Promise<CompanySearchItem[]>;
};

export const executeCompanySearch = async (
  args: ExecuteCompanySearchArgs,
): Promise<CompanySearchOutcome> => {
  let convexError: string | null = null;
  try {
    const results = await args.searchConvex(args.q, args.limit);
    if (results.length > 0) {
      return {
        ok: true,
        data: {
          results,
          source: "convex",
        },
      };
    }
  } catch (error) {
    convexError = error instanceof Error ? error.message : "Convex query failed";
  }

  if (!args.hasEdgar) {
    if (convexError) {
      return {
        ok: false,
        error: {
          code: "CONVEX_ERROR",
          message: convexError,
          status: 500,
        },
      };
    }
    return {
      ok: true,
      data: {
        results: [],
        source: "convex",
      },
    };
  }

  try {
    const results = await args.searchEdgar(args.q, args.limit);
    return {
      ok: true,
      data: {
        results,
        source: "edgar",
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "EDGAR_ERROR",
        message: error instanceof Error ? error.message : "EDGAR search failed",
        status: 502,
      },
    };
  }
};
