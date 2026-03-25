import type { ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}

const variants = {
  primary: 'bg-accent text-text-inverse hover:bg-accent-hover hover:shadow-glow-accent focus:ring-border-focus',
  secondary: 'bg-surface-2 text-text-primary border border-border-default hover:bg-surface-3 hover:border-border-hover focus:ring-border-focus',
  danger: 'bg-status-error text-white hover:brightness-110 focus:ring-status-error/40',
  ghost: 'text-text-secondary hover:bg-surface-3 hover:text-text-primary focus:ring-border-focus',
};

const sizes = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-base',
};

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center rounded-lg font-medium transition-all duration-200 ease-spring hover:scale-[1.02] active:scale-[0.98] focus:outline-none focus:ring-1 focus:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
