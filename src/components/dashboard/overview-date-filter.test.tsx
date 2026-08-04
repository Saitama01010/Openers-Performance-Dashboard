import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dateFilter = readFileSync(
  "src/components/dashboard/overview-date-filter.tsx",
  "utf8",
);
const filterToolbar = readFileSync(
  "src/components/dashboard/dashboard-filter-toolbar.tsx",
  "utf8",
);

describe("shared dashboard filters", () => {
  it("offers the exact date presets plus unrestricted custom dates", () => {
    for (const label of [
      "Today",
      "This Month",
      "Last Month",
      "All Time",
      "Custom Date",
    ]) {
      expect(dateFilter).toContain(label);
    }
    expect(dateFilter.match(/type="date"/g)).toHaveLength(2);
    expect(dateFilter).not.toContain("Apply dates");
    expect(dateFilter).not.toContain('min=');
    expect(dateFilter).not.toContain('max=');
  });

  it("preserves unrelated query parameters and applies changes immediately", () => {
    expect(dateFilter).toContain("new URLSearchParams(searchParams.toString())");
    expect(dateFilter).toContain("router.replace");
    expect(dateFilter).toContain('next.delete("from")');
    expect(dateFilter).toContain('next.delete("to")');
    expect(filterToolbar).toContain("new URLSearchParams(searchParams.toString())");
    expect(filterToolbar).toContain("router.replace");
    expect(filterToolbar).toContain('next.delete(name)');
    expect(filterToolbar).toContain('next.delete("page")');
  });

  it("uses scoped searchable comboboxes and exposes a pending state", () => {
    expect(filterToolbar).toContain('role="combobox"');
    expect(filterToolbar).toContain('aria-autocomplete="list"');
    expect(filterToolbar).toContain("useTransition");
    expect(filterToolbar).toContain("Updating…");
  });
});
