import { useRef, useCallback } from 'react';

interface NumericInputProps {
  value: number | null;
  onChange: (value: number | null) => void;
  target?: number;
  min?: number;
  max?: number;
  placeholder?: string;
  disabled?: boolean;
  'aria-label'?: string;
}

/**
 * Single-tap numeric input optimized for mobile.
 *
 * Uses inputMode="numeric" + pattern="[0-9]*" to force the numeric keypad
 * on both iOS and Android. Auto-selects text on focus so the user can
 * immediately start typing without clearing.
 *
 * This is the most critical UX component in the entire app.
 */
export default function NumericInput({
  value,
  onChange,
  target,
  min,
  max,
  placeholder = '0',
  disabled = false,
  'aria-label': ariaLabel,
}: NumericInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFocus = useCallback(() => {
    requestAnimationFrame(() => {
      inputRef.current?.select();
    });
  }, []);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value.replace(/[^0-9]/g, '');
      if (raw === '') {
        onChange(null);
        return;
      }
      let num = parseInt(raw, 10);
      if (min !== undefined && num < min) num = min;
      if (max !== undefined && num > max) num = max;
      onChange(num);
    },
    [onChange, min, max],
  );

  // Determine border color based on delta from target
  let borderClass = 'border-border-default focus:border-dcvfd-accent focus:ring-1 focus:ring-dcvfd-accent/30';
  if (value !== null && value !== undefined && target !== undefined) {
    if (value >= target) {
      borderClass = 'border-ems-green/60 focus:border-ems-green focus:ring-1 focus:ring-ems-green/30';
    } else {
      borderClass = 'border-ems-red/60 focus:border-ems-red focus:ring-1 focus:ring-ems-red/30';
    }
  }

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      value={value !== null && value !== undefined ? String(value) : ''}
      onChange={handleChange}
      onFocus={handleFocus}
      placeholder={placeholder}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`w-16 min-h-[44px] rounded-lg border-2 bg-surface-overlay px-2 text-center text-lg font-mono text-white outline-none transition-all ${borderClass} disabled:opacity-40`}
    />
  );
}
