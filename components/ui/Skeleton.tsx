import styles from './Skeleton.module.css';

interface SkeletonProps {
  /** Width (CSS value) */
  width?: string | number;
  /** Height (CSS value) */
  height?: string | number;
  /** Border radius variant */
  variant?: 'text' | 'circular' | 'rectangular';
  /** Additional CSS classes */
  className?: string;
}

/**
 * Pulse animation placeholder for loading states.
 */
export function Skeleton({
  width,
  height,
  variant = 'rectangular',
  className,
}: SkeletonProps) {
  const variantClass = styles[variant] || '';

  return (
    <div
      className={`${styles.skeleton} ${variantClass} ${className || ''}`}
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
      }}
    />
  );
}

/**
 * Skeleton for text lines.
 */
export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <div className={styles.textContainer}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          variant="text"
          width={i === lines - 1 ? '60%' : '100%'}
          height={14}
        />
      ))}
    </div>
  );
}
