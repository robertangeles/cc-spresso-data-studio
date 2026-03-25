import { forwardRef } from 'react';
import type { InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, id, className = '', ...props }, ref) => {
    const inputId = id || label.toLowerCase().replace(/\s+/g, '-');

    return (
      <div className="space-y-1">
        <label htmlFor={inputId} className="block text-sm font-medium text-text-secondary">
          {label}
        </label>
        <input
          ref={ref}
          id={inputId}
          className={`block w-full rounded-lg border bg-surface-3 px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary transition-all duration-200 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30 ${
            error ? 'border-status-error/50 focus:border-status-error focus:ring-status-error/30' : 'border-border-default'
          } ${className}`}
          {...props}
        />
        {error && <p className="text-sm text-status-error">{error}</p>}
      </div>
    );
  },
);

Input.displayName = 'Input';
