"use client";

import { useCallback, useSyncExternalStore } from "react";

import {
  THEME_EVENT,
  THEME_STORAGE_KEY,
  resolveThemePreference,
  type Theme,
} from "@/theme/theme";

function currentTheme(): Theme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

function storedTheme() {
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    return null;
  }
}

function systemTheme() {
  return resolveThemePreference(
    storedTheme(),
    window.matchMedia("(prefers-color-scheme: dark)").matches,
  );
}

function subscribe(callback: () => void) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const onThemeChange = () => callback();
  const onSystemChange = () => {
    if (storedTheme() === null) applyTheme(systemTheme());
    callback();
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key !== THEME_STORAGE_KEY) return;
    applyTheme(systemTheme());
    callback();
  };
  window.addEventListener(THEME_EVENT, onThemeChange);
  window.addEventListener("storage", onStorage);
  media.addEventListener("change", onSystemChange);
  return () => {
    window.removeEventListener(THEME_EVENT, onThemeChange);
    window.removeEventListener("storage", onStorage);
    media.removeEventListener("change", onSystemChange);
  };
}

function getServerTheme() {
  return "light" as Theme;
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  const theme = useSyncExternalStore(subscribe, currentTheme, getServerTheme);
  const dark = theme === "dark";
  const label = dark ? "Switch to light mode" : "Switch to dark mode";

  const toggle = useCallback((checked: boolean) => {
    const nextTheme: Theme = checked ? "dark" : "light";
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    } catch {
      // The visible preference still applies when storage is unavailable.
    }
    applyTheme(nextTheme);
    window.dispatchEvent(new Event(THEME_EVENT));
  }, []);

  return (
    <label className={`theme-switch ${className}`.trim()} title={label}>
      <span className="sr-only">{label}</span>
      <input aria-label={label} checked={dark} onChange={(event) => toggle(event.currentTarget.checked)} type="checkbox" />
      <span aria-hidden="true" className="theme-switch__slider">
        <span className="theme-switch__sun-moon">
          <i className="theme-switch__moon-dot theme-switch__moon-dot--one" />
          <i className="theme-switch__moon-dot theme-switch__moon-dot--two" />
          <i className="theme-switch__moon-dot theme-switch__moon-dot--three" />
          <i className="theme-switch__ray theme-switch__ray--one" />
          <i className="theme-switch__ray theme-switch__ray--two" />
          <i className="theme-switch__ray theme-switch__ray--three" />
        </span>
        <span className="theme-switch__cloud theme-switch__cloud--one" />
        <span className="theme-switch__cloud theme-switch__cloud--two" />
        <span className="theme-switch__cloud theme-switch__cloud--three" />
        <span className="theme-switch__stars">
          <i className="theme-switch__star theme-switch__star--one" />
          <i className="theme-switch__star theme-switch__star--two" />
          <i className="theme-switch__star theme-switch__star--three" />
          <i className="theme-switch__star theme-switch__star--four" />
        </span>
      </span>
    </label>
  );
}
