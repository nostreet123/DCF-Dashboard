/**
 * Responsive breakpoints and media query helpers
 */

export const breakpoints = {
  mobile: 600,
  tablet: 900,
  desktop: 1200,
  wide: 1440,
} as const;

/**
 * Media query strings for use in CSS-in-JS
 */
export const mediaQueries = {
  mobile: `@media (max-width: ${breakpoints.mobile}px)`,
  tablet: `@media (max-width: ${breakpoints.tablet}px)`,
  desktop: `@media (max-width: ${breakpoints.desktop}px)`,
  wide: `@media (min-width: ${breakpoints.wide}px)`,

  // Range queries
  tabletOnly: `@media (min-width: ${breakpoints.mobile + 1}px) and (max-width: ${breakpoints.tablet}px)`,
  desktopOnly: `@media (min-width: ${breakpoints.tablet + 1}px) and (max-width: ${breakpoints.desktop}px)`,
} as const;

/**
 * Check if window width is below a breakpoint
 * Use only in client components with useEffect
 */
export function isBelow(breakpoint: keyof typeof breakpoints): boolean {
  if (typeof window === 'undefined') return false;
  return window.innerWidth <= breakpoints[breakpoint];
}

/**
 * Check if window width is above a breakpoint
 * Use only in client components with useEffect
 */
export function isAbove(breakpoint: keyof typeof breakpoints): boolean {
  if (typeof window === 'undefined') return true;
  return window.innerWidth > breakpoints[breakpoint];
}
