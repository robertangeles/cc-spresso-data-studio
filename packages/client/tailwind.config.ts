import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Studio Dark — layered surface system
        surface: {
          0: 'var(--surface-0)',
          1: 'var(--surface-1)',
          2: 'var(--surface-2)',
          3: 'var(--surface-3)',
          4: 'var(--surface-4)',
        },
        border: {
          subtle: 'var(--border-subtle)',
          DEFAULT: 'var(--border-default)',
          focus: 'var(--border-focus)',
          hover: 'var(--border-hover)',
        },
        text: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          tertiary: 'var(--text-tertiary)',
          inverse: 'var(--text-inverse)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          hover: 'var(--accent-hover)',
          dim: 'var(--accent-dim)',
          yellow: '#FFD60A',
        },
        status: {
          success: 'var(--status-success)',
          'success-dim': 'var(--status-success-dim)',
          error: 'var(--status-error)',
          'error-dim': 'var(--status-error-dim)',
          warning: 'var(--status-warning)',
          'warning-dim': 'var(--status-warning-dim)',
          info: 'var(--status-info)',
          'info-dim': 'var(--status-info-dim)',
        },
        // Legacy brand scale — kept for gradual migration
        brand: {
          50: '#FFF9F0',
          100: '#FFF0DB',
          200: '#FFE0B8',
          300: '#FFCC8A',
          400: '#FFD60A',
          500: '#8B5E3C',
          600: '#6B4226',
          700: '#3C2415',
          800: '#2A1A0E',
          900: '#1A1008',
          950: '#0D0804',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      backdropBlur: {
        glass: '20px',
      },
      boxShadow: {
        glow: '0 0 20px rgba(255, 214, 10, 0.08)',
        'glow-accent': '0 0 20px rgba(255, 214, 10, 0.15)',
        'glow-strong': '0 0 30px rgba(255, 214, 10, 0.25), 0 0 60px rgba(255, 214, 10, 0.10)',
        'dark-sm': '0 1px 2px rgba(0, 0, 0, 0.5)',
        'dark-md': '0 4px 12px rgba(0, 0, 0, 0.4)',
        'dark-lg': '0 8px 32px rgba(0, 0, 0, 0.5)',
      },
      transitionTimingFunction: {
        spring: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      animation: {
        'fade-in': 'fade-in 200ms cubic-bezier(0.22, 1, 0.36, 1)',
        'slide-up': 'slide-up 250ms cubic-bezier(0.22, 1, 0.36, 1)',
        'slide-down': 'slide-down 250ms cubic-bezier(0.22, 1, 0.36, 1)',
        'scale-in': 'scale-in 200ms cubic-bezier(0.22, 1, 0.36, 1)',
        'slide-in-right': 'slide-in-right 250ms cubic-bezier(0.22, 1, 0.36, 1)',
        'glow-pulse': 'glow-pulse 3s ease infinite',
        'shimmer': 'shimmer 2s linear infinite',
        'float': 'float 3s ease-in-out infinite',
        'bounce-dots': 'bounce-dots 1.4s ease-in-out infinite',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-down': {
          from: { opacity: '0', transform: 'translateY(-8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.97)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        'slide-in-right': {
          from: { opacity: '0', transform: 'translateX(8px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        'glow-pulse': {
          '0%, 100%': { boxShadow: '0 0 20px rgba(255, 214, 10, 0.10)' },
          '50%': { boxShadow: '0 0 30px rgba(255, 214, 10, 0.25)' },
        },
        'shimmer': {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'float': {
          '0%, 100%': { transform: 'translateY(-2px)' },
          '50%': { transform: 'translateY(2px)' },
        },
        'bounce-dots': {
          '0%, 80%, 100%': { opacity: '0.3' },
          '40%': { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
