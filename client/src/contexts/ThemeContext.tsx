import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

/** What the viewer picked. "system" follows the OS and keeps following it. */
export type ThemePreference = "system" | "light" | "dark";
/** What is actually on screen. */
export type ResolvedTheme = "light" | "dark";

interface ThemeContextType {
  preference: ThemePreference;
  theme: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

/*
 * Keep in step with the inline script in client/index.html, which applies the
 * same rule before first paint so a dark-mode viewer never sees a white flash.
 */
const STORAGE_KEY = "theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

/*
 * Phone browser toolbar color for each theme: the page background
 * (--background in index.css). The theme-color tags and inline script in
 * client/index.html use the same values.
 */
const TOOLBAR_COLOR: Record<ResolvedTheme, string> = { light: "#f8f7f4", dark: "#11110f" };

function readPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") return stored;
  } catch {
    // Storage can be unavailable (private windows, blocked site data).
  }
  return "system";
}

function systemTheme(): ResolvedTheme {
  return window.matchMedia?.(DARK_QUERY).matches ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(readPreference);
  const [system, setSystem] = useState<ResolvedTheme>(systemTheme);

  // Follow OS changes live (e.g. macOS switching to dark at sunset).
  useEffect(() => {
    const mql = window.matchMedia?.(DARK_QUERY);
    if (!mql) return;
    const onChange = () => setSystem(mql.matches ? "dark" : "light");
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  const theme: ResolvedTheme = preference === "system" ? system : preference;

  useEffect(() => {
    // Switch in one frame. Without this, every element with a color transition
    // fades from the old theme to the new one, and the page smears for ~200ms.
    const freeze = document.createElement("style");
    freeze.textContent = "*,*::before,*::after{transition:none!important}";
    document.head.appendChild(freeze);
    document.documentElement.classList.toggle("dark", theme === "dark");
    // Force a restyle with transitions off, then restore them on the next tick.
    void window.getComputedStyle(document.body).color;
    const restore = window.setTimeout(() => freeze.remove(), 1);
    return () => {
      window.clearTimeout(restore);
      freeze.remove();
    };
  }, [theme]);

  // The theme-color tags in index.html carry OS media queries. Give both the
  // color of the theme in use, so the toolbar follows an in-app choice too.
  useEffect(() => {
    document
      .querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
      .forEach((meta) => meta.setAttribute("content", TOOLBAR_COLOR[theme]));
  }, [theme]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    try {
      // "system" is stored too, so a later OS change is still followed.
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Not persisted; the choice still applies for this visit.
    }
  }, []);

  return (
    <ThemeContext.Provider value={{ preference, theme, setPreference }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
