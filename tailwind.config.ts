import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Khayali is dark-first by design (see docs/DECISIONS.md "Dark-
        // first design system"), so unlike a conventional Tailwind ramp
        // (50 = lightest, 900 = darkest), `ink` runs the other way: 900
        // is the brightest text tone (near-white, for headings) and 50
        // is only ever used as a subtle lighten-tint on the dark surface
        // (hover/active/disabled backgrounds). Every step was picked
        // against its actual call sites, not abstractly — see the class
        // audit in the commit that introduced this palette.
        ink: {
          50: '#23264a',
          100: '#2c2f58',
          200: '#363a66',
          300: '#414577',
          400: '#6e6a98',
          500: '#8d89b5',
          600: '#ada9ce',
          700: '#c9c6e0',
          800: '#e4e1f0',
          900: '#f4f1e8',
        },
        // Brand teal — primary accent (links, primary buttons).
        lagoon: {
          50: '#eafbf7',
          100: '#cdf5ea',
          200: '#9de8d7',
          300: '#6fdac0',
          400: '#45cbaa',
          500: '#34c4ac',
          600: '#2fbfa6',
          700: '#23a38c',
          800: '#1a8170',
          900: '#135f54',
        },
        // Brand gold — secondary accent (sparkle mark, highlights).
        saffron: {
          50: '#fdf6e8',
          100: '#faebc4',
          200: '#f3d68a',
          300: '#edc15a',
          400: '#e8b23d',
          500: '#e3ac3d',
          600: '#d89a25',
          700: '#b27e1d',
          800: '#8a6117',
          900: '#5f430f',
        },
        // Brand rose — tertiary accent / danger.
        coral: {
          50: '#fdeef1',
          100: '#fad7dd',
          200: '#f5b0bd',
          300: '#ef8a9c',
          400: '#ea6a80',
          500: '#e2708a',
          600: '#e5646b',
          700: '#c94850',
          800: '#a3373e',
          900: '#7a282d',
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
        card: '0 20px 50px -20px rgba(4, 4, 16, 0.55)',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        floatSlow: {
          '0%,100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
      },
      animation: {
        fadeIn: 'fadeIn 0.7s ease-out both',
        fadeInDelay1: 'fadeIn 0.7s ease-out 0.12s both',
        fadeInDelay2: 'fadeIn 0.7s ease-out 0.24s both',
        floatSlow: 'floatSlow 6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
