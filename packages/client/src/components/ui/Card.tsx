import type { HTMLAttributes } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: 'sm' | 'md' | 'lg';
  glow?: boolean;
}

const paddings = {
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8',
};

export function Card({ padding = 'md', glow = false, className = '', children, ...props }: CardProps) {
  return (
    <div
      className={`rounded-xl border border-border-subtle bg-surface-2 transition-all duration-300 ease-spring hover:border-border-hover hover:shadow-glow ${glow ? 'shadow-glow-accent border-border-hover' : ''} ${paddings[padding]} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
