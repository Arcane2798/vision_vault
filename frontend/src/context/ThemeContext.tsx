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

const systemTheme = (): Theme => (window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark');

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
    const mq = window.matchMedia?.('(prefers-color-scheme: light)');
    if (!mq) return;
    const h = () => !saved() && setThemeState(mq.matches ? 'light' : 'dark');
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
export const CHART_COLORS: Record<Theme, { grid: string; axis: string; text: string; tooltipBg: string; tooltipBorder: string; cursor: string; danger: string; caution: string; brand: string; muted: string }> = {
  dark: { grid: '#272c33', axis: '#7e8792', text: '#f1f4f7', tooltipBg: '#191d22', tooltipBorder: '#383f48', cursor: 'rgba(255,255,255,0.04)', danger: '#ef4444', caution: '#fb923c', brand: '#2db8a6', muted: '#383f48' },
  light: { grid: '#e3e7ec', axis: '#637083', text: '#171f29', tooltipBg: '#ffffff', tooltipBorder: '#dfe4ea', cursor: 'rgba(16,24,40,0.04)', danger: '#dc2626', caution: '#ea580c', brand: '#0d7c70', muted: '#c8d0d9' },
};
