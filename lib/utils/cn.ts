import clsx, { ClassValue } from 'clsx';

/**
 * Utility for constructing className strings conditionally.
 * Wrapper around clsx for consistent usage across components.
 */
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}
