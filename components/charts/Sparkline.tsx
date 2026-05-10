'use client';

import { useMemo, useId } from 'react';

interface SparklineProps {
  /** Array of numeric values to plot */
  data: number[];
  /** SVG width in pixels */
  width?: number;
  /** SVG height in pixels */
  height?: number;
  /** Stroke color (defaults to CSS variable) */
  color?: string;
  /** Show glow effect (best for dark theme) */
  showGlow?: boolean;
  /** Additional CSS classes */
  className?: string;
  /** Stroke width */
  strokeWidth?: number;
}

/**
 * A minimal SVG sparkline chart component.
 * Renders a smooth line chart from an array of numbers.
 */
export function Sparkline({
  data,
  width = 100,
  height = 32,
  color,
  showGlow = false,
  className,
  strokeWidth = 1.5,
}: SparklineProps) {
  const pathData = useMemo(() => {
    if (!data || data.length < 2) return '';

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;

    // Padding to prevent clipping at edges
    const paddingY = height * 0.1;
    const effectiveHeight = height - paddingY * 2;

    const points = data.map((value, index) => {
      const x = (index / (data.length - 1)) * width;
      const y = paddingY + effectiveHeight - ((value - min) / range) * effectiveHeight;
      return { x, y };
    });

    // Build SVG path with smooth curves
    let path = `M ${points[0].x} ${points[0].y}`;

    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];

      // Use quadratic bezier for smoother lines
      const cpx = (prev.x + curr.x) / 2;
      path += ` Q ${prev.x} ${prev.y}, ${cpx} ${(prev.y + curr.y) / 2}`;
    }

    // Final line to last point
    const last = points[points.length - 1];
    path += ` L ${last.x} ${last.y}`;

    return path;
  }, [data, width, height]);

  const rawId = useId();
  const glowId = `sparkline-glow-${rawId.replace(/:/g, '')}`;

  if (!data || data.length < 2) {
    return null;
  }

  const strokeColor = color || 'var(--chart-line)';

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      style={{ overflow: 'visible' }}
    >
      {showGlow && (
        <defs>
          <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
      )}
      <path
        d={pathData}
        fill="none"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        filter={showGlow ? `url(#${glowId})` : undefined}
      />
    </svg>
  );
}
