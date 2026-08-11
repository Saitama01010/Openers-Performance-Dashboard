export const THEME_STORAGE_KEY = "openers.theme";
export const THEME_EVENT = "openers:theme-change";

export type Theme = "light" | "dark";

export function resolveThemePreference(stored: string | null, systemDark: boolean): Theme {
  if (stored === "dark" || stored === "light") return stored;
  return systemDark ? "dark" : "light";
}

export const themeInitializationScript = `(() => {
  try {
    const stored = window.localStorage.getItem("${THEME_STORAGE_KEY}");
    const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const theme = stored === "dark" || stored === "light" ? stored : systemDark ? "dark" : "light";
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  } catch {
    document.documentElement.dataset.theme = "light";
    document.documentElement.style.colorScheme = "light";
  }
})();`;
