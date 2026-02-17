'use client';

import { useId, useMemo } from 'react';
import { formatCurrency } from '@/lib/utils/formatters';

interface DistributionCurveProps {
  /** Histogram data with bin centers and density values */
  histogram: {
    binCenters: number[];
    density: number[];
  };
  /** Current/highlighted value to mark on the curve */
  currentValue?: number;
  /** SVG width in pixels */
  width?: number;
  /** SVG height in pixels */
  height?: number;
  /** Additional CSS classes */
  className?: string;
}

/**
 * SVG distribution curve component.
 * Renders a filled area chart representing a probability distribution
 * with an optional marker for the current value.
 */
export function DistributionCurve({
  histogram,
  currentValue,
  width = 280,
  height = 100,
  className,
}: DistributionCurveProps) {
  const { binCenters, density } = histogram;

  const { areaPath, currentX, minValue, maxValue } = useMemo(() => {
    if (!binCenters?.length || !density?.length) {
      return { areaPath: '', currentX: null, minValue: 0, maxValue: 0 };
    }

    const minVal = Math.min(...binCenters);
    const maxVal = Math.max(...binCenters);
    const maxDensity = Math.max(...density);
    const safeMaxDensity = maxDensity > 0 ? maxDensity : 1;
    const valueRange = maxVal - minVal || 1;

    // Padding for the chart area
    const paddingX = 20;
    const paddingTop = 10;
    const paddingBottom = 25;
    const chartWidth = width - paddingX * 2;
    const chartHeight = height - paddingTop - paddingBottom;

    // Convert data points to SVG coordinates
    const points = binCenters.map((value, i) => {
      const x = paddingX + ((value - minVal) / valueRange) * chartWidth;
      const y = paddingTop + chartHeight - (density[i] / safeMaxDensity) * chartHeight;
      return { x, y };
    });

    // Build area path (filled beneath the curve)
    let path = `M ${points[0].x} ${paddingTop + chartHeight}`;
    path += ` L ${points[0].x} ${points[0].y}`;

    // Smooth curve through points
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const cpx = (prev.x + curr.x) / 2;
      path += ` Q ${prev.x} ${prev.y}, ${cpx} ${(prev.y + curr.y) / 2}`;
    }

    // Close the path
    const last = points[points.length - 1];
    path += ` L ${last.x} ${last.y}`;
    path += ` L ${last.x} ${paddingTop + chartHeight}`;
    path += ' Z';

    // Calculate current value position
    let currX: number | null = null;
    if (currentValue !== undefined && currentValue >= minVal && currentValue <= maxVal) {
      currX = paddingX + ((currentValue - minVal) / valueRange) * chartWidth;
    }

    return { areaPath: path, currentX: currX, minValue: minVal, maxValue: maxVal };
  }, [binCenters, density, width, height, currentValue]);

  const gradientId = `dist-gradient-${useId().replace(/:/g, '')}`;

  if (!binCenters?.length || !density?.length) {
    return null;
  }

  const paddingBottom = 25;
  const baselineY = height - paddingBottom;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--chart-line)" stopOpacity="0.4" />
          <stop offset="100%" stopColor="var(--chart-line)" stopOpacity="0.05" />
        </linearGradient>
      </defs>

      {/* Area fill */}
      <path d={areaPath} fill={`url(#${gradientId})`} />

      {/* Curve stroke */}
      <path
        d={areaPath}
        fill="none"
        stroke="var(--chart-line)"
        strokeWidth={2}
        strokeLinecap="round"
      />

      {/* Current value marker */}
      {currentX !== null && (
        <>
          <line
            x1={currentX}
            y1={10}
            x2={currentX}
            y2={baselineY}
            stroke="var(--accent-gold)"
            strokeWidth={2}
            strokeDasharray="4 2"
          />
          <circle
            cx={currentX}
            cy={baselineY}
            r={4}
            fill="var(--accent-gold)"
          />
        </>
      )}

      {/* X-axis ticks */}
      <g fill="var(--text-tertiary)" fontSize="10" fontFamily="var(--font-mono)">
        <text x={20} y={height - 5} textAnchor="start">
          {formatCurrency(minValue)}
        </text>
        <text x={width - 20} y={height - 5} textAnchor="end">
          {formatCurrency(maxValue)}
        </text>
      </g>
    </svg>
  );
}
