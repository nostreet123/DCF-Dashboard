'use client';

import { useId } from 'react';
import styles from './Slider.module.css';

interface SliderProps {
  /** Current value */
  value: number;
  /** Minimum value */
  min: number;
  /** Maximum value */
  max: number;
  /** Step increment */
  step?: number;
  /** Change handler */
  onChange: (value: number) => void;
  /** Label text */
  label?: string;
  /** Format function for displaying value */
  formatValue?: (value: number) => string;
  /** Disabled state */
  disabled?: boolean;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Custom styled range slider with gradient track and gold thumb.
 * Used for adjusting DCF assumptions like growth rate and discount rate.
 */
export function Slider({
  value,
  min,
  max,
  step = 0.1,
  onChange,
  label,
  formatValue = (v) => v.toFixed(1),
  disabled = false,
  className,
}: SliderProps) {
  const id = useId();

  // Calculate fill percentage for gradient track
  const percentage = ((value - min) / (max - min)) * 100;

  return (
    <div className={`${styles.container} ${className || ''}`}>
      {label && (
        <div className={styles.header}>
          <label htmlFor={id} className={styles.label}>
            {label}
          </label>
          <span className={styles.value}>{formatValue(value)}</span>
        </div>
      )}
      <div className={styles.track}>
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          disabled={disabled}
          className={styles.input}
          style={{
            background: `linear-gradient(to right, var(--accent-gold) 0%, var(--accent-gold) ${percentage}%, var(--border) ${percentage}%, var(--border) 100%)`,
          }}
        />
      </div>
      <div className={styles.range}>
        <span>{formatValue(min)}</span>
        <span>{formatValue(max)}</span>
      </div>
    </div>
  );
}
