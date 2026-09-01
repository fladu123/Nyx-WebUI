import { createContext, useContext, useMemo, useState, useEffect } from 'react';

const ACCENT_THEMES = [
  { id: 'violet', label: 'Violet', accent: '#9d8cff', dim: '#6c5fd4', bg: 'rgba(157,140,255,0.08)', rgb: '157,140,255' },
  { id: 'blue', label: 'Blue', accent: '#7cb3ff', dim: '#4a86d6', bg: 'rgba(124,179,255,0.08)', rgb: '124,179,255' },
  { id: 'teal', label: 'Teal', accent: '#5fd6c4', dim: '#2fa895', bg: 'rgba(95,214,196,0.08)', rgb: '95,214,196' },
  { id: 'green', label: 'Green', accent: '#7bd88f', dim: '#4bab61', bg: 'rgba(123,216,143,0.08)', rgb: '123,216,143' },
  { id: 'amber', label: 'Amber', accent: '#fbbf24', dim: '#d99c0a', bg: 'rgba(251,191,36,0.08)', rgb: '251,191,36' },
  { id: 'coral', label: 'Coral', accent: '#ff8c7a', dim: '#dd5f4a', bg: 'rgba(255,140,122,0.08)', rgb: '255,140,122' },
  { id: 'pink', label: 'Pink', accent: '#ff8ec6', dim: '#dd5fa0', bg: 'rgba(255,142,198,0.08)', rgb: '255,142,198' },
  { id: 'red', label: 'Red', accent: '#f87171', dim: '#d94b4b', bg: 'rgba(248,113,113,0.08)', rgb: '248,113,113' },
];

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('nyx_dark_mode') !== 'false');
  const [accentTheme, setAccentTheme] = useState(() => localStorage.getItem('nyx_accent_theme') || 'violet');

  useEffect(() => {
    localStorage.setItem('nyx_dark_mode', String(darkMode));
  }, [darkMode]);

  useEffect(() => {
    localStorage.setItem('nyx_accent_theme', accentTheme);
  }, [accentTheme]);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--night-0', darkMode ? '#0a0a0f' : '#f5f5f7');
    root.style.setProperty('--night-1', darkMode ? '#111118' : '#ffffff');
    root.style.setProperty('--night-2', darkMode ? '#18181f' : '#f0f0f2');
    root.style.setProperty('--night-3', darkMode ? '#22222c' : '#e0e0e4');
    root.style.setProperty('--night-4', darkMode ? '#2e2e3a' : '#cccccc');
    root.style.setProperty('--night-5', darkMode ? '#3c3c4e' : '#aaaaaa');
    root.style.setProperty('--text-0', darkMode ? '#f0eff8' : '#111111');
    root.style.setProperty('--text-1', darkMode ? '#b8b7c8' : '#444444');
    root.style.setProperty('--text-2', darkMode ? '#7a7990' : '#777777');
    root.style.setProperty('--text-3', darkMode ? '#4e4d62' : '#aaaaaa');
  }, [darkMode]);

  useEffect(() => {
    const theme = ACCENT_THEMES.find((item) => item.id === accentTheme) || ACCENT_THEMES[0];
    const root = document.documentElement;
    root.style.setProperty('--accent', theme.accent);
    root.style.setProperty('--accent-dim', theme.dim);
    root.style.setProperty('--accent-bg', theme.bg);
    root.style.setProperty('--accent-rgb', theme.rgb);
  }, [accentTheme]);

  const value = useMemo(() => ({
    darkMode,
    setDarkMode,
    accentTheme,
    setAccentTheme,
    accentThemes: ACCENT_THEMES,
  }), [darkMode, accentTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
}

export default ThemeContext;
