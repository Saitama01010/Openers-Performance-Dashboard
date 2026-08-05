import { describe, expect, it } from "vitest";

import { commissionsCsv, COMMISSION_CSV_HEADER, safeCommissionFilename } from "@/commissions/csv";
import { calculateCommission } from "@/commissions/domain";
import type { CommissionRow } from "@/commissions/report";

function row(overrides: Partial<CommissionRow> = {}): CommissionRow {
  return {
    id: "agent-1",
    realName: "Doe, Jane",
    americanName: '=HYPERLINK("bad")',
    email: "jane\n@example.com",
    active: true,
    team: { id: "team-1", name: "East \"A\"" },
    ...calculateCommission(14),
    ...overrides,
  };
}

describe("commission CSV", () => {
  it("uses exactly six columns and exports commission without compensation", () => {
    const csv = commissionsCsv([row()]);
    expect(csv.split("\r\n")[0]).toBe(COMMISSION_CSV_HEADER);
    expect(csv).toContain("9800");
    expect(csv).not.toContain("23800");
  });

  it("escapes commas, quotes, newlines, and spreadsheet formulas", () => {
    expect(commissionsCsv([row()])).toContain(
      '"Doe, Jane","\'=HYPERLINK(""bad"")","jane\n@example.com","East ""A""",14,9800',
    );
  });

  it("allows a valid empty export only as a header", () => {
    expect(commissionsCsv([])).toBe(COMMISSION_CSV_HEADER);
  });

  it("sanitizes team names in deterministic filenames", () => {
    expect(safeCommissionFilename("2026-08", "East / Team\r\n")).toBe("commissions-2026-08-east-team.csv");
  });
});
