import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

export type Theme = 'dark' | 'light';

/** Same key as the pre-paint script in index.html. */
const STORAGE_KEY = 'vv-theme';

function saved(): Theme | null {
  try {
    const t = localStorage.getItem(STORAGE_KEY);
    return t === 'light' || t === 'dark' ? t : null;
  } catch {
    return null;
  }
}

const systemTheme = (): Theme => (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

interface ThemeValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);

/** Dark / light switch. The saved choice wins; without one the OS preference is followed (also when it changes). */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => (document.documentElement.getAttribute('data-theme') as Theme) || saved() || systemTheme());

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

  const toggle = useCallback(() => setTheme(theme === 'dark' ? 'light' : 'dark'), [theme, setTheme]);

  return <ThemeContext.Provider value={{ theme, setTheme, toggle }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}

/** Concrete colours for SVG charts (Recharts takes plain colour strings). Mirrors index.css. */
export const CHART_COLORS: Record<Theme, { grid: string; axis: string; text: string; tooltipBg: string; tooltipBorder: string; cursor: string; line: string; area: string; dot: string }> = {
  light: { grid: '#e1e7f1', axis: '#5c6884', text: '#101b3d', tooltipBg: '#ffffff', tooltipBorder: '#e1e7f1', cursor: '#cbd5e5', line: '#2f54aa', area: '#2f54aa', dot: '#1e3470' },
  dark: { grid: '#22304f', axis: '#8692b0', text: '#eef2fa', tooltipBg: '#151f3b', tooltipBorder: '#34426a', cursor: '#34426a', line: '#a0b8f5', area: '#809eec', dot: '#eef2fa' },
};
