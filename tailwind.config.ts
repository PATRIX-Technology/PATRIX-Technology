import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          50: '#f7f5f2',
          100: '#eee9e2',
          200: '#dcd2c3',
          300: '#c2b198',
          400: '#a4906f',
          500: '#8a7454',
          600: '#6f5b42',
          700: '#584636',
          800: '#3c3025',
          900: '#241c16',
        },
        lagoon: {
          50: '#eefbfb',
          100: '#d3f2f3',
          200: '#a8e4e7',
          300: '#72cfd4',
          400: '#3fb2ba',
          500: '#20949c',
          600: '#187780',
          700: '#155f67',
          800: '#144d53',
          900: '#0f3a3f',
        },
        saffron: {
          50: '#fff8ec',
          100: '#feecc8',
          200: '#fcd68b',
          300: '#fabb4d',
          400: '#f7a020',
          500: '#e5850c',
          600: '#bd6608',
          700: '#94500c',
          800: '#78420f',
          900: '#5f3510',
        },
        coral: {
          50: '#fff1ee',
          100: '#ffe0d8',
          200: '#ffc0b0',
          300: '#ff9a80',
          400: '#fb7050',
          500: '#ef4c2a',
          600: '#cf361a',
          700: '#aa2c17',
          800: '#87261a',
          900: '#6f2419',
        },
      },
      fontFamily: {
        display: ['var(--font-display)', 'serif'],
        body: ['var(--font-body)', 'sans-serif'],
        arabic: ['var(--font-arabic)', 'sans-serif'],
      },
      borderRadius: {
        xl2: '1.25rem',
      },
      boxShadow: {
        card: '0 8px 30px -12px rgba(36, 28, 22, 0.25)',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
