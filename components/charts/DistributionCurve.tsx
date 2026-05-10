'use client';

import { useId, useMemo } from 'react';
import { formatCompactCurrency, formatCurrency } from '@/lib/utils/formatters';

interface DistributionCurveProps {
  /** Histogram data with bin centers and density values */
  histogram: {
    binCenters: number[];
    density: number[];
  };
  /** Current/highlighted value to mark on the curve */
  currentValue?: number;
  /** Monte Carlo P10 marker */
  p10?: number;
  /** Monte Carlo P90 marker */
  p90?: number;
  /** SVG width in pixels */
  width?: number;
  /** SVG height in pixels */
  height?: number;
  /** Additional CSS classes */
  className?: string;
}

function smoothDensity(values: number[]): number[] {
  if (values.length <= 4) {
    return values;
  }

  const radius = values.length >= 30 ? 2 : 1;

  return values.map((_, index) => {
    const start = Math.max(0, index - radius);
    const end = Math.min(values.length, index + radius + 1);
    const window = values.slice(start, end);
    return window.reduce((sum, value) => sum + value, 0) / window.length;
  });
}

/**
 * SVG distribution curve component.
 * Renders a filled area chart representing a probability distribution
 * with an optional marker for the current value.
 */
export function DistributionCurve({
  histogram,
  currentValue,
  p10,
  p90,
  width = 280,
  height = 100,
  className,
}: DistributionCurveProps) {
  const { binCenters, density } = histogram;

  const {
    areaPath,
    curvePath,
    currentX,
    markerY,
    markerRange,
    minValue,
    maxValue,
    percentileBand,
  } = useMemo(() => {
    if (!binCenters?.length || !density?.length) {
      return {
        areaPath: '',
        curvePath: '',
        currentX: null,
        markerY: null,
        markerRange: 'inside' as const,
        minValue: 0,
        maxValue: 0,
        percentileBand: null,
      };
    }

    const minVal = Math.min(...binCenters);
    const maxVal = Math.max(...binCenters);
    const displayDensity = smoothDensity(density);
    const maxDensity = Math.max(...displayDensity);
    const safeMaxDensity = maxDensity > 0 ? maxDensity : 1;
    const valueRange = maxVal - minVal || 1;

    // Padding for the chart area
    const paddingX = 20;
    const paddingTop = 10;
    const paddingBottom = 25;
    const chartWidth = width - paddingX * 2;
    const chartHeight = height - paddingTop - paddingBottom;

    const points = binCenters.map((value, i) => {
      const x = paddingX + ((value - minVal) / valueRange) * chartWidth;
      const y = paddingTop + chartHeight - (displayDensity[i] / safeMaxDensity) * chartHeight;
      return { x, y };
    });

    let topPath = `M ${points[0].x} ${points[0].y}`;

    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const cpx = (prev.x + curr.x) / 2;
      topPath += ` Q ${prev.x} ${prev.y}, ${cpx} ${(prev.y + curr.y) / 2}`;
    }

    const last = points[points.length - 1];
    topPath += ` L ${last.x} ${last.y}`;

    let path = `M ${points[0].x} ${paddingTop + chartHeight}`;
    path += ` L ${points[0].x} ${points[0].y}`;
    path += topPath.replace(/^M [^ ]+ [^ ]+/, '');
    path += ` L ${last.x} ${paddingTop + chartHeight}`;
    path += ' Z';

    const yAtX = (x: number) => {
      const segmentIndex = points.findIndex((point, index) => index > 0 && x <= point.x);
      if (segmentIndex <= 0) {
        return points[0].y;
      }
      const previous = points[segmentIndex - 1];
      const next = points[segmentIndex];
      const segmentWidth = next.x - previous.x || 1;
      const progress = Math.min(1, Math.max(0, (x - previous.x) / segmentWidth));
      return previous.y + (next.y - previous.y) * progress;
    };

    // Calculate current value position
    let currX: number | null = null;
    let activeMarkerY: number | null = null;
    let rangePosition: 'below' | 'inside' | 'above' = 'inside';
    if (currentValue !== undefined) {
      if (currentValue < minVal) {
        rangePosition = 'below';
      } else if (currentValue > maxVal) {
        rangePosition = 'above';
      }
      const clampedValue = Math.min(maxVal, Math.max(minVal, currentValue));
      currX = paddingX + ((clampedValue - minVal) / valueRange) * chartWidth;
      activeMarkerY = yAtX(currX);
    }

    let p10X: number | null = null;
    let p90X: number | null = null;
    if (
      p10 !== undefined &&
      p90 !== undefined &&
      Number.isFinite(p10) &&
      Number.isFinite(p90)
    ) {
      const lower = Math.min(p10, p90);
      const upper = Math.max(p10, p90);
      const clampedLower = Math.max(minVal, lower);
      const clampedUpper = Math.min(maxVal, upper);
      if (clampedUpper > clampedLower) {
        p10X = paddingX + ((clampedLower - minVal) / valueRange) * chartWidth;
        p90X = paddingX + ((clampedUpper - minVal) / valueRange) * chartWidth;
      }
    }

    return {
      areaPath: path,
      curvePath: topPath,
      currentX: currX,
      markerY: activeMarkerY,
      markerRange: rangePosition,
      minValue: minVal,
      maxValue: maxVal,
      percentileBand:
        p10X !== null && p90X !== null
          ? {
              x1: p10X,
              x2: p90X,
              y: paddingTop,
              height: chartHeight,
            }
          : null,
    };
  }, [binCenters, density, width, height, currentValue, p10, p90]);

  const gradientId = `dist-gradient-${useId().replace(/:/g, '')}`;

  if (!binCenters?.length || !density?.length) {
    return null;
  }

  const paddingBottom = 25;
  const baselineY = height - paddingBottom;
  const edgeMarkerY = baselineY - 18;
  const formatAxisValue = (value: number) =>
    Math.abs(value) >= 1000 ? formatCompactCurrency(value) : formatCurrency(value);
  const outsideLabel = markerRange === 'above' ? 'FV > range' : markerRange === 'below' ? 'FV < range' : null;

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

      {/* Area fill from empirical Monte Carlo bin heights */}
      <path d={areaPath} fill={`url(#${gradientId})`} />

      {percentileBand ? (
        <g>
          <title>MC P10-P90 range</title>
          <rect
            x={percentileBand.x1}
            y={percentileBand.y}
            width={percentileBand.x2 - percentileBand.x1}
            height={percentileBand.height}
            fill="var(--chart-line)"
            opacity={0.07}
          />
          <line
            x1={percentileBand.x1}
            y1={percentileBand.y}
            x2={percentileBand.x1}
            y2={baselineY}
            stroke="var(--chart-line)"
            strokeWidth={1}
            strokeDasharray="2 3"
            opacity={0.45}
          />
          <line
            x1={percentileBand.x2}
            y1={percentileBand.y}
            x2={percentileBand.x2}
            y2={baselineY}
            stroke="var(--chart-line)"
            strokeWidth={1}
            strokeDasharray="2 3"
            opacity={0.45}
          />
        </g>
      ) : null}

      {/* Curve stroke */}
      <path
        d={curvePath}
        fill="none"
        stroke="var(--chart-line)"
        strokeWidth={2}
        strokeLinecap="round"
      />

      {/* Current value marker */}
      {currentX !== null && markerY !== null && markerRange === 'inside' && (
        <>
          <line
            x1={currentX}
            y1={markerY}
            x2={currentX}
            y2={baselineY}
            stroke="var(--accent-gold)"
            strokeWidth={2}
            strokeDasharray="4 2"
          />
          <circle
            cx={currentX}
            cy={markerY}
            r={4}
            fill="var(--accent-gold)"
          />
        </>
      )}
      {currentX !== null && outsideLabel && (
        <g>
          <title>{outsideLabel}</title>
          <line
            x1={currentX}
            y1={edgeMarkerY}
            x2={currentX}
            y2={baselineY}
            stroke="var(--accent-gold)"
            strokeWidth={2}
            strokeDasharray="4 2"
          />
          <circle
            cx={currentX}
            cy={edgeMarkerY}
            r={4}
            fill="var(--accent-gold)"
          />
          <text
            x={markerRange === 'above' ? width - 22 : 22}
            y={edgeMarkerY - 8}
            textAnchor={markerRange === 'above' ? 'end' : 'start'}
            fill="var(--accent-gold)"
            fontSize="10"
            fontFamily="var(--font-mono)"
          >
            {outsideLabel}
          </text>
        </g>
      )}

      {/* X-axis ticks */}
      <g fill="var(--text-tertiary)" fontSize="10" fontFamily="var(--font-mono)">
        <text x={20} y={height - 5} textAnchor="start">
          {formatAxisValue(minValue)}
        </text>
        <text x={width - 20} y={height - 5} textAnchor="end">
          {formatAxisValue(maxValue)}
        </text>
      </g>
    </svg>
  );
}
