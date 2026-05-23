'use client';

import { useCallback, useRef, useState } from 'react';
import { readBrowserImportApprovalToken } from '@/lib/browserImportTokens';
import type { ImportReview } from '@/lib/contracts/company';
import type { CompanySearchResult } from '@/lib/contracts/company';
import type { Assumptions, Scenario } from '@/lib/workbench/scenarioProfiles';
import type { ImportParseResult, ImportStatus, WorkspaceMode } from '@/lib/dashboard/viewModel';

export function useImportWorkflow({
  selectedSearchCompany,
  activeCompanyId,
  scenarioAssumptions,
  reset,
  selectCompany,
  setWorkspaceMode,
  setRetryToken,
  onImportReset,
}: {
  selectedSearchCompany: CompanySearchResult | null;
  activeCompanyId: string | null;
  scenarioAssumptions: Record<Scenario, Assumptions>;
  reset: () => void;
  selectCompany: (id: string, symbol: string | null) => void;
  setWorkspaceMode: (mode: WorkspaceMode) => void;
  setRetryToken: (updater: (value: number) => number) => void;
  onImportReset: () => void;
}) {
  const [importParseResult, setImportParseResult] = useState<ImportParseResult | null>(null);
  const [importStatus, setImportStatus] = useState<ImportStatus>('idle');
  const [importError, setImportError] = useState<string | null>(null);

  const importParseRequestIdRef = useRef(0);
  const activeCompanyIdRef = useRef(activeCompanyId);
  activeCompanyIdRef.current = activeCompanyId;

  const resetImportState = useCallback(() => {
    importParseRequestIdRef.current += 1;
    onImportReset();
    setImportParseResult(null);
    setImportStatus('idle');
    setImportError(null);
  }, [onImportReset]);

  const handleImportParse = useCallback(async (files: File[]) => {
    if (!selectedSearchCompany) {
      return;
    }
    const requestId = importParseRequestIdRef.current + 1;
    importParseRequestIdRef.current = requestId;
    const listingId = selectedSearchCompany.id;
    setImportStatus('parsing');
    setImportError(null);
    const formData = new FormData();
    for (const file of files) {
      formData.append('files', file);
    }
    try {
      const response = await fetch(
        `/api/company/import/parse?listingId=${encodeURIComponent(listingId)}`,
        { method: 'POST', body: formData },
      );
      const payload = (await response.json().catch(() => ({}))) as {
        message?: string;
        artifacts?: ImportParseResult['artifacts'];
        review?: ImportReview;
      };
      if (!response.ok || !payload.review || !payload.artifacts) {
        throw new Error(payload.message ?? 'Import parse failed.');
      }
      if (
        requestId !== importParseRequestIdRef.current ||
        activeCompanyIdRef.current !== listingId
      ) {
        return;
      }
      setImportParseResult({ artifacts: payload.artifacts, review: payload.review });
      setImportStatus('idle');
    } catch (error) {
      if (
        requestId !== importParseRequestIdRef.current ||
        activeCompanyIdRef.current !== listingId
      ) {
        return;
      }
      setImportStatus('error');
      setImportError(error instanceof Error ? error.message : 'Import parse failed.');
    }
  }, [selectedSearchCompany]);

  const handleApproveImport = useCallback(async (review: ImportReview) => {
    if (!selectedSearchCompany || !importParseResult) {
      return;
    }
    const requestCompany = selectedSearchCompany;
    const requestCompanyId = requestCompany.id;
    setImportStatus('approving');
    setImportError(null);
    try {
      const headers = new Headers({ 'Content-Type': 'application/json' });
      const approvalToken = readBrowserImportApprovalToken();
      if (approvalToken) {
        headers.set('x-import-approval-token', approvalToken);
      }
      const response = await fetch('/api/company/import/approve/browser', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          company: requestCompany,
          review,
          artifacts: importParseResult.artifacts,
          assumptions: scenarioAssumptions,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        message?: string;
        result?: unknown;
        importedFacts?: { statements?: unknown[] };
      };
      if (!response.ok || !payload.result) {
        throw new Error(payload.message ?? 'Import approval failed.');
      }
      if (activeCompanyIdRef.current !== requestCompanyId) {
        return;
      }
      reset();
      setWorkspaceMode('valuation');
      setImportStatus('approved');
      setRetryToken((value) => value + 1);
      selectCompany(requestCompany.id, requestCompany.symbol);
    } catch (error) {
      if (activeCompanyIdRef.current !== requestCompanyId) {
        return;
      }
      setImportStatus('error');
      setImportError(error instanceof Error ? error.message : 'Import approval failed.');
    }
  }, [
    importParseResult,
    reset,
    scenarioAssumptions,
    selectCompany,
    selectedSearchCompany,
    setRetryToken,
    setWorkspaceMode,
  ]);

  return {
    importParseResult,
    importStatus,
    importError,
    handleImportParse,
    handleApproveImport,
    resetImportState,
  };
}
