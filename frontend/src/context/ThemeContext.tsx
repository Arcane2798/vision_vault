import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

export type Theme = 'light' | 'dark' | 'simedarby';

export const THEMES: Array<{ id: Theme; label: string }> = [
  { id: 'simedarby', label: 'Sime Darby' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
];

const isTheme = (t: unknown): t is Theme => t === 'light' || t === 'dark' || t === 'simedarby';

/** Same key as the pre-paint script in index.html. */
const STORAGE_KEY = 'vv-theme';

function saved(): Theme | null {
  try {
    const t = localStorage.getItem(STORAGE_KEY);
    return isTheme(t) ? t : null;
  } catch {
    return null;
  }
}

const systemTheme = (): Theme => (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

interface ThemeValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
  /** next theme in THEMES order */
  toggle: () => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);

/** Theme switch (Sime Darby / light / dark). The saved choice wins; without one the OS preference is followed (also when it changes). */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const attr = document.documentElement.getAttribute('data-theme');
    return isTheme(attr) ? attr : saved() || systemTheme();
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('theme-switching');
    root.setAttribute('data-theme', theme);
    const t = window.setTimeout(() => root.classList.remove('theme-switching'), 300);
    return () => clearTimeout(t);
  }, [theme]);

  // follow the OS while the user has not chosen
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return;
    const h = () => !saved() && setThemeState(mq.matches ? 'dark' : 'light');
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, []);

  const setTheme = useCallback((t: Theme) => {
    try {
      localStorage.setItem(STORAGE_KEY, t);
    } catch {
      /* private mode: the choice lasts for this page only */
    }
    setThemeState(t);
  }, []);

  const toggle = useCallback(() => setTheme(THEMES[(THEMES.findIndex((t) => t.id === theme) + 1) % THEMES.length].id), [theme, setTheme]);

  return <ThemeContext.Provider value={{ theme, setTheme, toggle }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}

/** Concrete colours for SVG charts (Recharts takes plain colour strings). Mirrors index.css. */
export const CHART_COLORS: Record<Theme, { grid: string; axis: string; text: string; tooltipBg: string; tooltipBorder: string; cursor: string; line: string; area: string; dot: string }> = {
  light: { grid: '#e4e7ed', axis: '#646e82', text: '#0e1626', tooltipBg: '#ffffff', tooltipBorder: '#e4e7ed', cursor: '#ced3dc', line: '#1e4096', area: '#1e4096', dot: '#152a5c' },
  dark: { grid: '#1c2844', axis: '#828fac', text: '#e8ecf5', tooltipBg: '#111b33', tooltipBorder: '#2e3c60', cursor: '#2e3c60', line: '#96b4f5', area: '#96b4f5', dot: '#e8ecf5' },
  simedarby: { grid: '#e3e7de', axis: '#627188', text: '#0a1e3c', tooltipBg: '#ffffff', tooltipBorder: '#e3e7de', cursor: '#ccd3c6', line: '#072d63', area: '#60a030', dot: '#072d63' },
};
