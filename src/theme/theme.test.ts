import { describe, expect, it } from "vitest";

import {
  THEME_STORAGE_KEY,
  resolveThemePreference,
  themeInitializationScript,
} from "@/theme/theme";

describe("theme preference", () => {
  it("honors an explicit stored preference before the system preference", () => {
    expect(resolveThemePreference("dark", false)).toBe("dark");
    expect(resolveThemePreference("light", true)).toBe("light");
  });

  it("falls back to the system preference when storage is absent or invalid", () => {
    expect(resolveThemePreference(null, true)).toBe("dark");
    expect(resolveThemePreference("invalid", false)).toBe("light");
  });

  it("initializes the document theme before hydration", () => {
    expect(themeInitializationScript).toContain(THEME_STORAGE_KEY);
    expect(themeInitializationScript).toContain("prefers-color-scheme: dark");
    expect(themeInitializationScript).toContain("document.documentElement.dataset.theme");
    expect(themeInitializationScript).toContain("document.documentElement.style.colorScheme");
  });
});
