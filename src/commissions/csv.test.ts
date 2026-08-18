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
  it("adds salary after commission without exporting total compensation", () => {
    const csv = commissionsCsv([row()]);
    expect(csv.split("\r\n")[0]).toBe(COMMISSION_CSV_HEADER);
    expect(csv).toContain("9800");
    expect(csv).toContain("14000");
    expect(csv).not.toContain("23800");
  });

  it("escapes commas, quotes, newlines, and spreadsheet formulas", () => {
    expect(commissionsCsv([row()])).toContain(
      '"Doe, Jane","\'=HYPERLINK(""bad"")","jane\n@example.com","East ""A""",14,9800,14000',
    );
  });

  it("keeps commission and salary aligned with each exported agent", () => {
    const lines = commissionsCsv([
      row({ id: "a", realName: "Agent A", commissionAmount: 2_000, baseSalary: 14_000 }),
      row({ id: "b", realName: "Agent B", commissionAmount: 4_400, baseSalary: 16_000 }),
    ]).split("\r\n");

    expect(lines[1]).toContain("Agent A");
    expect(lines[1]?.endsWith(",2000,14000")).toBe(true);
    expect(lines[2]).toContain("Agent B");
    expect(lines[2]?.endsWith(",4400,16000")).toBe(true);
  });

  it("allows a valid empty export only as a header", () => {
    expect(commissionsCsv([])).toBe(COMMISSION_CSV_HEADER);
  });

  it("sanitizes team names in deterministic filenames", () => {
    expect(safeCommissionFilename("2026-08", "East / Team\r\n")).toBe("commissions-2026-08-east-team.csv");
  });
});
