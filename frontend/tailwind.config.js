/** @type {import('tailwindcss').Config} */

// Colours are CSS variables (RGB channels) set per theme in src/index.css, so every utility
// (including opacity modifiers like bg-danger/10) follows the dark / light switch.
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;
const tone = (name) => ({ DEFAULT: v(name), fg: v(`${name}-fg`) });

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: { 0: v('surface-0'), 1: v('surface-1'), 2: v('surface-2'), 3: v('surface-3'), 4: v('surface-4'), nav: v('surface-nav') },
        line: { DEFAULT: v('line'), strong: v('line-strong') },
        ink: { 1: v('ink-1'), 2: v('ink-2'), 3: v('ink-3') },
        brand: { DEFAULT: v('brand'), soft: v('brand-soft'), fg: v('brand-fg'), on: v('brand-on') },
        ok: tone('ok'),
        warn: tone('warn'),
        danger: tone('danger'),
        /** visitor inside their window (cyan boxes in the live frame) */
        visitor: tone('visitor'),
        /** visitor outside their window (orange boxes) */
        caution: tone('caution'),
        /** guard house channel */
        guard: tone('guard'),
      },
      fontFamily: { sans: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'], mono: ['JetBrains Mono', 'Cascadia Mono', 'Consolas', 'ui-monospace', 'monospace'] },
      boxShadow: {
        panel: 'var(--shadow-panel)',
        pop: 'var(--shadow-pop)',
      },
      keyframes: {
        scan: { '0%': { transform: 'translateY(-100%)' }, '100%': { transform: 'translateY(300%)' } },
        'fade-in': { from: { opacity: '0', transform: 'translateY(4px)' }, to: { opacity: '1', transform: 'none' } },
      },
      animation: {
        scan: 'scan 1.8s cubic-bezier(.45,0,.55,1) infinite alternate',
        'fade-in': 'fade-in .25s ease-out both',
      },
    },
  },
  plugins: [],
};
