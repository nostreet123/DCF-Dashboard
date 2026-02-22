/**
 * Design tokens for DCF Dashboard
 * Supports dark and light themes with semantic color naming
 */

export const colors = {
  dark: {
    base: {
      bg: '#0a0a0b',
      surface: 'rgba(28,26,24,0.85)',
      surfaceHover: 'rgba(38,36,34,0.9)',
      border: 'rgba(255,255,255,0.08)',
    },
    text: {
      primary: '#e8e4dd',
      secondary: '#a8a099',
      tertiary: '#6b6660',
    },
    accent: {
      gold: '#d4a853',
      teal: '#4ecdc4',
      coral: '#c75d5d',
    },
    heatmap: {
      low: '#8b4a52',
      mid: '#d4a853',
      high: '#7a9b76',
    },
  },
  light: {
    base: {
      bg: '#f6f4ef',
      surface: '#ffffff',
      surfaceHover: '#fafaf8',
      border: 'rgba(0,0,0,0.08)',
    },
    text: {
      primary: '#1a1815',
      secondary: '#4a4540',
      tertiary: '#8a857d',
    },
    accent: {
      gold: '#8b7355',
      teal: '#2a9d8f',
      coral: '#b5636a',
    },
    heatmap: {
      low: '#be6d79',
      mid: '#d3a95e',
      high: '#7ea076',
    },
  },
} as const;

export const spacing = {
  xs: '4px',
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '24px',
  xxl: '32px',
} as const;

export const borderRadius = {
  sm: '4px',
  md: '6px',
  lg: '8px',
  xl: '12px',
} as const;

export type Theme = 'dark' | 'light';
export type ColorTokens = typeof colors.dark;
