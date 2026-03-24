import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#FFF9F0',
          100: '#FFF0DB',
          200: '#FFE0B8',
          300: '#FFCC8A',
          400: '#FFD60A', // electric yellow accent
          500: '#8B5E3C', // warm espresso mid
          600: '#6B4226', // espresso primary
          700: '#3C2415', // deep espresso
          800: '#2A1A0E',
          900: '#1A1008',
          950: '#0D0804',
        },
        accent: {
          yellow: '#FFD60A',
          cream: '#FFF8E7',
          warm: '#F5E6D3',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config;
