'use client';

import { useEffect, useMemo, useState } from 'react';
import type {
  CompanySearchResult,
  ImportedArtifactMetadata,
  ImportReview,
  ParsedFieldName,
  SourceLink,
} from '@/lib/contracts/company';
import type { SettingsStatus } from '@/lib/settingsStatus';
import styles from './ParityPanels.module.css';

const reviewFields: ParsedFieldName[] = [
  'periodEnd',
  'filingCurrency',
  'revenue',
  'cash',
  'debt',
  'sharesOutstanding',
];

type ImportParseResult = {
  artifacts: ImportedArtifactMetadata[];
  review: ImportReview;
};

const fieldLabel = (field: ParsedFieldName): string =>
  field
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (value) => value.toUpperCase());

const sourceLinks = (links: SourceLink[]) => (
  <ul className={styles.sourceList}>
    {links.map((link) => (
      <li key={`${link.title}:${link.url}`}>
        <a href={link.url} target="_blank" rel="noreferrer">
          {link.title}
        </a>
      </li>
    ))}
  </ul>
);

export function CompanyDetailPanel({
  company,
  className,
}: {
  company: CompanySearchResult;
  className?: string;
}) {
  return (
    <section className={`${styles.panel} ${className || ''}`}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>{company.name}</h2>
          <p className={styles.subtitle}>
            {company.symbol} · {company.market ?? company.exchangeMic ?? 'Official source'} · {company.currency ?? 'Currency unknown'}
          </p>
        </div>
        <span className={styles.badge}>{company.coverageState.replace(/_/g, ' ')}</span>
      </div>
      {company.coverageReason ? <p className={styles.note}>{company.coverageReason}</p> : null}
      {company.sourceLinks.length > 0 ? sourceLinks(company.sourceLinks) : null}
    </section>
  );
}

export function SettingsStatusPanel({
  status,
  className,
}: {
  status: SettingsStatus | null;
  className?: string;
}) {
  const rows = [
    ['SEC user agent', status?.secUserAgent?.configured ? 'Configured' : 'Missing'],
    ['AI analysis', status?.ai?.configured ? status.ai.model ?? 'Configured' : 'Missing'],
    ['Convex', status?.convex?.configured ? 'Configured' : 'Missing'],
    ['History', status?.convex?.historyReady ? 'Ready' : 'Unavailable'],
    ['Imports', status?.convex?.importsReady ? 'Ready' : 'Unavailable'],
    ['Data mode', status?.dataMode ?? 'Unknown'],
  ];

  return (
    <section className={`${styles.panel} ${className || ''}`}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>Settings Status</h2>
          <p className={styles.subtitle}>Server-side readiness for official data, imports, AI, and saved runs.</p>
        </div>
      </div>
      <div className={styles.statusGrid}>
        {rows.map(([label, value]) => (
          <div key={label} className={styles.statusItem}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

export function ImportWorkspace({
  company,
  parseResult,
  status,
  error,
  onParse,
  onApprove,
  className,
}: {
  company: CompanySearchResult;
  parseResult: ImportParseResult | null;
  status: 'idle' | 'parsing' | 'approving' | 'approved' | 'error';
  error: string | null;
  onParse: (files: File[]) => void;
  onApprove: (review: ImportReview) => void;
  className?: string;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [review, setReview] = useState<ImportReview | null>(parseResult?.review ?? null);

  useEffect(() => {
    setReview(parseResult?.review ?? null);
  }, [parseResult]);

  const reviewValues = useMemo(() => {
    const values = new Map<ParsedFieldName, string>();
    for (const field of review?.fields ?? []) {
      values.set(field.field, field.value);
    }
    return values;
  }, [review]);

  const updateField = (field: ParsedFieldName, value: string) => {
    setReview((current) => {
      const base = current ?? {
        fields: [],
        missingRequiredFields: [],
        notes: [],
        isValuationReady: false,
      };
      const nextFields = [...base.fields];
      const index = nextFields.findIndex((item) => item.field === field);
      const nextField = {
        field,
        value,
        isManualOverride: true,
        confirmed: true,
      };
      if (index >= 0) {
        nextFields[index] = { ...nextFields[index], ...nextField };
      } else {
        nextFields.push(nextField);
      }
      const missingRequiredFields = reviewFields.filter(
        (item) => !nextFields.find((candidate) => candidate.field === item && candidate.value.trim()),
      );
      const hasUnconfirmedRequiredFields = reviewFields.some(
        (item) => !nextFields.find((candidate) => candidate.field === item && candidate.confirmed === true),
      );
      return {
        ...base,
        fields: nextFields,
        missingRequiredFields,
        isValuationReady: missingRequiredFields.length === 0 && !hasUnconfirmedRequiredFields,
      };
    });
  };

  return (
    <section className={`${styles.panel} ${className || ''}`}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>Import Review</h2>
          <p className={styles.subtitle}>
            {company.symbol} needs reviewed statements before the Python engine can value it.
          </p>
        </div>
        <span className={styles.badge}>{status}</span>
      </div>
      {company.sourceLinks.length > 0 ? sourceLinks(company.sourceLinks) : null}
      <div className={styles.uploadRow}>
        <input
          className={styles.fileInput}
          type="file"
          multiple
          accept=".csv,.tsv,.xlsx,.xls,.pdf"
          onChange={(event) => setFiles(Array.from(event.currentTarget.files ?? []))}
        />
        <button
          type="button"
          className={styles.button}
          disabled={files.length === 0 || status === 'parsing'}
          onClick={() => onParse(files)}
        >
          Parse Files
        </button>
      </div>
      {error ? <p className={`${styles.note} ${styles.error}`}>{error}</p> : null}
      {review ? (
        <>
          <div className={styles.fieldGrid}>
            {reviewFields.map((field) => (
              <label key={field} className={styles.fieldLabel}>
                {fieldLabel(field)}
                <input
                  value={reviewValues.get(field) ?? ''}
                  onChange={(event) => updateField(field, event.currentTarget.value)}
                />
              </label>
            ))}
          </div>
          {parseResult?.artifacts.length ? (
            <ul className={styles.artifactList}>
              {parseResult.artifacts.map((artifact) => (
                <li key={artifact.id} className={styles.artifactItem}>
                  <span>{artifact.kind}</span>
                  <strong>{artifact.originalFilename}</strong>
                </li>
              ))}
            </ul>
          ) : null}
          <div className={styles.uploadRow}>
            <button
              type="button"
              className={`${styles.button} ${styles.buttonPrimary}`}
              disabled={!review.isValuationReady || status === 'approving'}
              onClick={() => onApprove(review)}
            >
              Approve And Compute
            </button>
          </div>
        </>
      ) : null}
    </section>
  );
}
