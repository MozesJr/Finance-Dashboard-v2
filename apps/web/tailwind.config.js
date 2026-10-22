const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  darkMode: 'selector',
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: token('primary'), fg: token('primary-fg') },
        app: token('bg'),
        surface: { DEFAULT: token('surface'), 2: token('surface-2') },
        line: token('line'),
        fg: token('fg'),
        muted: token('muted'),
        income: token('income'),
        expense: token('expense'),
        warning: token('warning'),
        accent: {
          perpuluhan: token('accent-perpuluhan'),
          kebutuhan: token('accent-kebutuhan'),
          darurat: token('accent-darurat'),
          investasi: token('accent-investasi'),
          'gaya-hidup': token('accent-gaya-hidup'),
        },
      },
    },
  },
  plugins: [],
};
