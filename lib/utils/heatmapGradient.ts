/**
 * Heatmap color gradient utilities
 * Interpolates between burgundy (low) -> amber (mid) -> sage (high)
 */

import { colors, type Theme } from '@/lib/design/colors';

interface RGB {
  r: number;
  g: number;
  b: number;
}

/**
 * Parse hex color to RGB
 */
function hexToRgb(hex: string): RGB {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) {
    return { r: 0, g: 0, b: 0 };
  }
  return {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  };
}

/**
 * Convert RGB to hex color
 */
function rgbToHex(rgb: RGB): string {
  const toHex = (n: number) => {
    const hex = Math.round(Math.max(0, Math.min(255, n))).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
}

/**
 * Linearly interpolate between two RGB colors
 */
function lerpRgb(a: RGB, b: RGB, t: number): RGB {
  return {
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
  };
}

/**
 * Heatmap colors sourced from design tokens
 */
export const heatmapColors = {
  dark: colors.dark.heatmap,
  light: colors.light.heatmap,
} as const satisfies Record<Theme, { low: string; mid: string; high: string }>;

/**
 * Get heatmap color for a normalized value (0-1)
 * Uses three-stop gradient: low (0) -> mid (0.5) -> high (1)
 */
export function getHeatmapColor(
  value: number,
  theme: Theme = 'dark'
): string {
  const colors = heatmapColors[theme];
  const low = hexToRgb(colors.low);
  const mid = hexToRgb(colors.mid);
  const high = hexToRgb(colors.high);

  // Clamp value to 0-1
  const t = Math.max(0, Math.min(1, value));

  let rgb: RGB;
  if (t <= 0.5) {
    // Interpolate low -> mid
    rgb = lerpRgb(low, mid, t * 2);
  } else {
    // Interpolate mid -> high
    rgb = lerpRgb(mid, high, (t - 0.5) * 2);
  }

  return rgbToHex(rgb);
}

/**
 * Normalize a value within a range to 0-1
 */
export function normalizeValue(value: number, min: number, max: number): number {
  if (max === min) return 0.5;
  return (value - min) / (max - min);
}

/**
 * Get heatmap color for an actual value given the data range
 */
export function getHeatmapColorForValue(
  value: number,
  min: number,
  max: number,
  theme: Theme = 'dark'
): string {
  const normalized = normalizeValue(value, min, max);
  return getHeatmapColor(normalized, theme);
}
