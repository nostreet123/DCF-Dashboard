'use client';

import { useMemo } from 'react';
import { useTheme } from '@/lib/contexts/ThemeContext';
import { getHeatmapColorForValue } from '@/lib/utils/heatmapGradient';
import { formatCurrency } from '@/lib/utils/formatters';

interface SensitivityHeatmapProps {
  /** 2D array of values (rows = WACC offsets, cols = growth offsets) */
  data: number[][];
  /** Growth rate offset labels (e.g., [-2, -1, 0, 1, 2]) */
  growthOffsets: number[];
  /** WACC offset labels (e.g., [-2, -1, 0, 1, 2]) */
  waccOffsets: number[];
  /** Custom value formatter */
  formatValue?: (value: number) => string;
  /** Additional CSS classes */
  className?: string;
}

/**
 * A 5x5 sensitivity analysis heatmap.
 * Shows how valuation changes with different growth and WACC assumptions.
 * Uses burgundy (low) → amber (mid) → sage (high) gradient.
 */
export function SensitivityHeatmap({
  data,
  growthOffsets,
  waccOffsets,
  formatValue = formatCurrency,
  className,
}: SensitivityHeatmapProps) {
  const { theme } = useTheme();

  const { min, max, cells } = useMemo(() => {
    if (!data?.length || !data[0]?.length) {
      return { min: 0, max: 0, cells: [] };
    }

    // Flatten to find min/max
    const allValues = data.flat();
    const minVal = Math.min(...allValues);
    const maxVal = Math.max(...allValues);

    // Build cell data
    const cellData: Array<{
      row: number;
      col: number;
      value: number;
      color: string;
    }> = [];

    for (let row = 0; row < data.length; row++) {
      for (let col = 0; col < data[row].length; col++) {
        const value = data[row][col];
        const color = getHeatmapColorForValue(value, minVal, maxVal, theme);
        cellData.push({ row, col, value, color });
      }
    }

    return { min: minVal, max: maxVal, cells: cellData };
  }, [data, theme]);

  if (!data?.length || !growthOffsets?.length || !waccOffsets?.length) {
    return null;
  }

  const numRows = data.length;
  const numCols = data[0]?.length || 0;
  const cellSize = 56;
  const labelWidth = 48;
  const labelHeight = 24;
  const gap = 2;

  const gridWidth = numCols * (cellSize + gap) - gap;
  const gridHeight = numRows * (cellSize + gap) - gap;
  const totalWidth = labelWidth + 8 + gridWidth;
  const totalHeight = labelHeight + 8 + gridHeight;

  // Determine text color based on background brightness
  const getTextColor = (bgColor: string): string => {
    // Simple luminance check
    const hex = bgColor.replace('#', '');
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    if (theme === 'light') {
      return '#201a13';
    }

    return luminance > 0.52 ? '#17130f' : '#ede8de';
  };

  return (
    <div className={className} style={{ overflowX: 'auto' }}>
      <svg
        width={totalWidth}
        height={totalHeight}
        viewBox={`0 0 ${totalWidth} ${totalHeight}`}
        style={{ display: 'block' }}
      >
        {/* Column headers (Growth offsets) */}
        <g
          fill="var(--text-secondary)"
          fontSize="10"
          fontFamily="var(--font-mono)"
          textAnchor="middle"
        >
          {growthOffsets.map((offset, i) => (
            <text
              key={`col-${i}`}
              x={labelWidth + 8 + i * (cellSize + gap) + cellSize / 2}
              y={labelHeight - 6}
            >
              {offset > 0 ? `+${offset}%` : `${offset}%`}
            </text>
          ))}
        </g>

        {/* Row headers (WACC offsets) */}
        <g
          fill="var(--text-secondary)"
          fontSize="10"
          fontFamily="var(--font-mono)"
          textAnchor="end"
          dominantBaseline="middle"
        >
          {waccOffsets.map((offset, i) => (
            <text
              key={`row-${i}`}
              x={labelWidth - 4}
              y={labelHeight + 8 + i * (cellSize + gap) + cellSize / 2}
            >
              {offset > 0 ? `+${offset}%` : `${offset}%`}
            </text>
          ))}
        </g>

        {/* Heatmap cells */}
        <g>
          {cells.map(({ row, col, value, color }) => {
            const x = labelWidth + 8 + col * (cellSize + gap);
            const y = labelHeight + 8 + row * (cellSize + gap);
            const textColor = getTextColor(color);
            const isCenter = row === Math.floor(numRows / 2) && col === Math.floor(numCols / 2);

            return (
              <g key={`cell-${row}-${col}`}>
                <rect
                  x={x}
                  y={y}
                  width={cellSize}
                  height={cellSize}
                  rx={4}
                  fill={color}
                  stroke={isCenter ? 'var(--accent-gold)' : 'none'}
                  strokeWidth={isCenter ? 2 : 0}
                />
                <text
                  x={x + cellSize / 2}
                  y={y + cellSize / 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill={textColor}
                  fontSize="11"
                  fontFamily="var(--font-mono)"
                  fontWeight={isCenter ? 600 : 400}
                >
                  {formatValue(value)}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      {/* Axis labels */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: '8px',
          paddingLeft: labelWidth + 8,
          fontSize: '11px',
          color: 'var(--text-tertiary)',
        }}
      >
        <span>← Lower Growth</span>
        <span>Higher Growth →</span>
      </div>
    </div>
  );
}
