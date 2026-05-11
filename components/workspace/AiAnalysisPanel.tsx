'use client';

import styles from './AiAnalysisPanel.module.css';

type Scenario = 'base' | 'bull' | 'bear';
type AiAnalysisStatus = 'idle' | 'loading' | 'applied' | 'error';

type AiTokenUsage = {
  inputTokens: number;
  estimated: boolean;
  inputBytes: number;
  systemTokens?: number;
  userTokens?: number;
  messageCount?: number;
  model?: string;
  tokenizer?: string;
};

interface AiAnalysisPanelProps {
  status: AiAnalysisStatus;
  rationales?: Partial<Record<Scenario, string>>;
  stream?: string[];
  expectedStreamSteps?: number;
  tokenUsage?: AiTokenUsage | null;
  className?: string;
}

const scenarioLabels: Record<Scenario, string> = {
  base: 'Base',
  bull: 'Bull',
  bear: 'Bear',
};

const integerFormatter = new Intl.NumberFormat('en-US');

const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 KB';
  }
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export function AiAnalysisPanel({
  status,
  rationales,
  stream = [],
  expectedStreamSteps = 5,
  tokenUsage,
  className,
}: AiAnalysisPanelProps) {
  const hasRationales = Boolean(rationales && Object.values(rationales).some(Boolean));
  const shouldRender = status === 'loading' || status === 'error' || hasRationales;

  if (!shouldRender) {
    return null;
  }

  const panelClass = className ? `${styles.panel} ${className}` : styles.panel;
  const completedStreamSteps = Math.max(1, expectedStreamSteps - 1);
  const progressValue =
    status === 'loading'
      ? Math.min(
          92,
          Math.round(
            (Math.max(0, stream.length - 1) / completedStreamSteps) * 100,
          ),
        )
      : 100;

  return (
    <section className={panelClass} aria-live="polite">
      <div className={styles.header}>
        <div>
          <p className={styles.eyebrow}>AI Analysis</p>
          <h3 className={styles.title}>
            {status === 'loading' ? 'Model stream' : 'Scenario rationale'}
          </h3>
        </div>
        <span className={`${styles.status} ${styles[status]}`}>
          {status === 'loading' ? 'Running' : status === 'error' ? 'Failed' : 'Applied'}
        </span>
      </div>

      {status === 'loading' ? (
        <>
          <div
            className={styles.progress}
            role="progressbar"
            aria-label="AI analysis progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progressValue}
          >
            <div className={styles.progressTrack}>
              <span
                className={styles.progressFill}
                style={{ width: `${progressValue}%` }}
              />
            </div>
            <span className={styles.progressLabel}>{progressValue}%</span>
          </div>

          <ol className={styles.stream}>
            {stream.map((line, index) => (
              <li key={`${line}-${index}`}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                {line}
              </li>
            ))}
            <li className={styles.activeLine}>
              <span>{String(stream.length + 1).padStart(2, '0')}</span>
              Waiting for the model response
            </li>
          </ol>
        </>
      ) : null}

      {status === 'error' ? (
        <p className={styles.message}>
          The model did not return a valid analysis. The current assumptions were left unchanged.
        </p>
      ) : null}

      {tokenUsage ? (
        <dl className={styles.tokenStats} aria-label="AI model token usage">
          <div>
            <dt>Input tokens</dt>
            <dd>
              {tokenUsage.estimated ? '~' : ''}
              {integerFormatter.format(tokenUsage.inputTokens)}
            </dd>
          </div>
          <div>
            <dt>Payload</dt>
            <dd>{formatBytes(tokenUsage.inputBytes)}</dd>
          </div>
          <div>
            <dt>Tokenizer</dt>
            <dd>{tokenUsage.estimated ? 'Estimated' : 'Provider'}</dd>
          </div>
        </dl>
      ) : null}

      {hasRationales ? (
        <div className={styles.rationales}>
          {(['base', 'bull', 'bear'] as const).map((scenario) => (
            rationales?.[scenario] ? (
              <article key={scenario} className={styles.rationale}>
                <h4>{scenarioLabels[scenario]}</h4>
                <p>{rationales[scenario]}</p>
              </article>
            ) : null
          ))}
        </div>
      ) : null}
    </section>
  );
}
