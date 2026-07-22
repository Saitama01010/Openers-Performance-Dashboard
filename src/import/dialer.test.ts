import { describe, expect, it } from "vitest";

import {
  getImportConfirmationBlockReason,
  hourlyKey,
  metricRowHash,
  previewDialerCsv,
  sha256,
  type ExistingDialerMetric,
} from "@/import/dialer";
import {
  canAccessProfile,
  canImportForProfile,
  type Actor,
} from "@/auth/authorization";

const csv = `Agent,Date,Hour,Logged In (sec),Ready (sec),Talk (sec),Ringing (sec),Wrap (sec),Paused (sec),Idle (sec),Untracked (sec),Calls
Ava Rivera,2026-07-20,9,3600,1200,900,100,100,600,500,200,12
Noah Chen,2026-07-20,9,3600,1200,720,120,180,600,600,180,9
Mia Patel,2026-07-20,9,3600,1200,900,100,100,600,500,200,7
Unknown Agent,2026-07-20,9,3600,1200,900,100,100,600,500,200,7
Ava Rivera,2026-07-20,25,3600,1200,900,100,100,600,500,200,7
`;

const mappings = [
  {
    sourceAgentName: "Ava Rivera",
    profileId: "agent-ava",
    teamIds: ["east"],
  },
  {
    sourceAgentName: "Noah Chen",
    profileId: "agent-noah",
    teamIds: ["east"],
  },
  {
    sourceAgentName: "Mia Patel",
    profileId: "agent-mia",
    teamIds: ["west"],
  },
];

const manager: Actor = {
  id: "manager-east",
  role: "manager",
  teamIds: ["east"],
};

function preview(fileContent = csv, existingMetrics: ExistingDialerMetric[] = []) {
  return previewDialerCsv({
    source: "dialer",
    fileContent,
    existingFileHashes: new Set(),
    mappings,
    existingMetrics,
    actor: manager,
  });
}

describe("dialer import preview", () => {
  it("maps the exact real dialer headers", () => {
    const result = preview();

    expect(result.missingHeaders).toEqual([]);
    expect(result.totalCsvRows).toBe(5);
    expect(result.headers).toEqual([
      "Agent",
      "Date",
      "Hour",
      "Logged In (sec)",
      "Ready (sec)",
      "Talk (sec)",
      "Ringing (sec)",
      "Wrap (sec)",
      "Paused (sec)",
      "Idle (sec)",
      "Untracked (sec)",
      "Calls",
    ]);
    expect(result.rows[0].metric?.loggedInSeconds).toBe(3600);
    expect(result.rows[1].metric?.talkSeconds).toBe(720);
  });

  it("trims UTF-8 BOM and header whitespace case-insensitively", () => {
    const messyCsv = csv.replace(
      "Agent,Date,Hour",
      "\uFEFF agent , DATE , hour ",
    );
    const result = preview(messyCsv);

    expect(result.missingHeaders).toEqual([]);
    expect(result.summary.new).toBe(2);
  });

  it("reports missing headers and blocks confirmation instead of all-zero success", () => {
    const missingCalls = csv.replace(",Calls\n", "\n");
    const result = preview(missingCalls);

    expect(result.missingHeaders).toEqual(["calls"]);
    expect(result.totalCsvRows).toBe(5);
    expect(result.summary).toEqual({
      new: 0,
      changed: 0,
      unchanged: 0,
      invalid: 0,
      unknown: 0,
      out_of_scope: 0,
    });
    expect(getImportConfirmationBlockReason(result)).toContain("calls");
  });

  it("blocks exact duplicate files even when renamed", () => {
    const hash = sha256(csv);
    const duplicate = previewDialerCsv({
      source: "dialer",
      fileContent: csv,
      existingFileHashes: new Set([hash]),
      mappings,
      existingMetrics: [],
      actor: manager,
    });

    expect(duplicate.duplicateFile).toBe(true);
    expect(getImportConfirmationBlockReason(duplicate)).toBe(
      "Duplicate file blocked.",
    );
  });

  it("classifies new, invalid, unknown, and out-of-scope rows", () => {
    const result = preview();

    expect(result.summary.new).toBe(2);
    expect(result.summary.out_of_scope).toBe(1);
    expect(result.summary.unknown).toBe(1);
    expect(result.summary.invalid).toBe(1);
    expect(result.mappedAgents).toEqual(["Ava Rivera", "Noah Chen"]);
  });

  it("detects corrected rows as changed by source, agent, date, and hour", () => {
    const first = preview();
    const avaMetric = first.rows.find((row) => row.metric?.agentProfileId === "agent-ava")?.metric;

    expect(avaMetric).toBeDefined();

    const existing: ExistingDialerMetric = {
      source: "dialer",
      agentProfileId: "agent-ava",
      metricDate: "2026-07-20",
      metricHour: 9,
      rowHash: metricRowHash(avaMetric!),
    };

    expect(hourlyKey(existing)).toBe("dialer:agent-ava:2026-07-20:9");

    const unchanged = preview(csv, [existing]);

    expect(unchanged.summary.unchanged).toBe(1);

    const changed = preview(
      csv.replace(
        "Ava Rivera,2026-07-20,9,3600,1200",
        "Ava Rivera,2026-07-20,9,3600,1300",
      ),
      [existing],
    );

    expect(changed.summary.changed).toBe(1);
  });

  it("allows successful confirmation when new or changed rows exist", () => {
    const result = preview();

    expect(getImportConfirmationBlockReason(result)).toBeNull();
  });

  it("blocks confirmation tampering that removes all mutating rows", () => {
    const result = preview(csv.replaceAll("2026-07-20,9", "2026-07-20,10"));
    const existingMetrics = result.rows
      .filter((row) => row.metric && row.rowHash)
      .map((row) => ({
        source: row.metric!.source,
        agentProfileId: row.metric!.agentProfileId,
        metricDate: row.metric!.metricDate,
        metricHour: row.metric!.metricHour,
        rowHash: row.rowHash!,
      }));
    const tampered = preview(csv.replaceAll("2026-07-20,9", "2026-07-20,10"), existingMetrics);

    expect(tampered.summary.unchanged).toBe(2);
    expect(getImportConfirmationBlockReason(tampered)).toBe(
      "No valid new or changed rows exist.",
    );
  });
});

describe("server-side authorization policy", () => {
  it("prevents managers from accessing or importing another team", () => {
    expect(
      canAccessProfile(manager, { id: "agent-mia", teamIds: ["west"] }),
    ).toBe(false);
    expect(
      canImportForProfile(manager, { id: "agent-mia", teamIds: ["west"] }),
    ).toBe(false);
  });

  it("prevents agents from accessing another agent", () => {
    const agent: Actor = { id: "agent-ava", role: "agent", teamIds: ["east"] };

    expect(
      canAccessProfile(agent, { id: "agent-noah", teamIds: ["east"] }),
    ).toBe(false);
  });

  it("allows admins to access all data", () => {
    const admin: Actor = { id: "admin", role: "admin", teamIds: [] };

    expect(canAccessProfile(admin, { id: "agent-mia", teamIds: ["west"] })).toBe(
      true,
    );
    expect(canImportForProfile(admin, { id: "agent-mia", teamIds: ["west"] })).toBe(
      true,
    );
  });
});
