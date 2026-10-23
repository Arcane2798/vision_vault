/** Colours are CSS variables (src/index.css): the light Sime Darby Property theme. */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: { 0: v('surface-0'), 1: v('surface-1'), 2: v('surface-2'), 3: v('surface-3') },
        line: v('line'),
        ink: { 1: v('ink-1'), 2: v('ink-2'), 3: v('ink-3') },
        brand: { DEFAULT: v('brand'), soft: v('brand-soft'), dark: v('brand-dark') },
        accent: v('accent'), // #f38121, a secondary touch (never for actions)
        ok: v('ok'),
        warn: v('warn'),
        danger: v('danger'),
      },
      boxShadow: { card: '0 4px 24px rgba(17, 24, 39, 0.06)' },
      fontFamily: { sans: ['Poppins', 'Inter', 'Segoe UI', 'system-ui', 'sans-serif'] },
    },
  },
  plugins: [],
};
