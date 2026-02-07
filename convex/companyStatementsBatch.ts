export type CompanyStatementBatchItem = {
  periodEnd: string;
  periodType: string;
  filingDate?: string;
  currency?: string;
  revenue?: number;
  cash?: number;
  debt?: number;
  sharesOutstanding?: number;
  source: string;
  updatedAt?: number;
};

const statementKey = (statement: CompanyStatementBatchItem) =>
  `${statement.periodEnd}::${statement.periodType}`;

export const dedupeStatements = <T extends CompanyStatementBatchItem>(
  statements: T[],
): T[] => {
  const deduped = new Map<string, T>();
  for (const statement of statements) {
    deduped.set(statementKey(statement), statement);
  }
  return Array.from(deduped.values());
};
