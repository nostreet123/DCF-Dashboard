/**
 * Formatting utilities for displaying numbers, currencies, and percentages
 */

const percentFormatter = new Intl.NumberFormat('en-US', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const numberFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const compactNumberFormatter = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

/**
 * Format a number as currency (e.g., $1,234.56)
 */
export function formatCurrency(value: number, currency = 'USD'): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency} ${numberFormatter.format(value)}`;
  }
}

/**
 * Format a number as compact currency (e.g., $1.2B)
 */
export function formatCompactCurrency(value: number, currency = 'USD'): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      notation: 'compact',
      minimumFractionDigits: 0,
      maximumFractionDigits: 1,
    }).format(value);
  } catch {
    return `${currency} ${compactNumberFormatter.format(value)}`;
  }
}

/**
 * Format a number as percentage (e.g., 12.5%)
 */
export function formatPercent(value: number): string {
  return percentFormatter.format(value);
}

/**
 * Format a decimal as percentage (e.g., 0.125 -> 12.5%)
 */
export function formatDecimalAsPercent(value: number): string {
  return percentFormatter.format(value);
}

/**
 * Format a number with commas (e.g., 1,234.56)
 */
export function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

/**
 * Format a number in compact notation (e.g., 1.2M)
 */
export function formatCompactNumber(value: number): string {
  return compactNumberFormatter.format(value);
}

/**
 * Format a number with explicit sign (e.g., +5.2%, -3.1%)
 */
export function formatSignedPercent(value: number): string {
  const formatted = percentFormatter.format(Math.abs(value));
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `-${formatted}`;
  return formatted;
}

/**
 * Format basis points (e.g., 0.0125 -> +125 bps)
 */
export function formatBasisPoints(value: number): string {
  const bps = Math.round(value * 10000);
  const sign = bps > 0 ? '+' : '';
  return `${sign}${bps} bps`;
}
