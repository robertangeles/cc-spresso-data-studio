import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0f7ff',
          100: '#e0effe',
          200: '#bae0fd',
          300: '#7ccbfc',
          400: '#36b2f8',
          500: '#0c99e9',
          600: '#0079c7',
          700: '#0160a1',
          800: '#065285',
          900: '#0b446e',
          950: '#072b49',
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
