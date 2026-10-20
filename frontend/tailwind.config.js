/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: { 0: '#0b0f14', 1: '#111821', 2: '#18212c', 3: '#222d3a' },
        line: '#2a3644',
        ink: { 1: '#e8edf2', 2: '#a9b4c0', 3: '#7d8896' },
        brand: { DEFAULT: '#3b82f6', soft: '#1e3a5f' },
        ok: '#22c55e',
        warn: '#f59e0b',
        danger: '#ef4444',
      },
      fontFamily: { sans: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'] },
    },
  },
  plugins: [],
};
