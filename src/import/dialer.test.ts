import { describe, expect, it } from "vitest";

import {
  hourlyKey,
  metricRowHash,
  previewDialerCsv,
  type ExistingDialerMetric,
} from "@/import/dialer";
import { canAccessProfile, canImportForProfile, type Actor } from "@/auth/authorization";

const csv = `agent,date,hour,calls,login_time,ready_time,talk_time,ringing_time,wrap_time,paused_time,idle_time,untracked_time
Ava Rivera,2026-07-20,9,12,3600,1200,900,100,100,600,500,200
Noah Chen,2026-07-20,9,9,01:00:00,00:20:00,00:12:00,00:02:00,00:03:00,00:10:00,00:10:00,00:03:00
Mia Patel,2026-07-20,9,7,3600,1200,900,100,100,600,500,200
Unknown Agent,2026-07-20,9,7,3600,1200,900,100,100,600,500,200
Ava Rivera,2026-07-20,25,7,3600,1200,900,100,100,600,500,200
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

describe("dialer import preview", () => {
  it("blocks exact duplicate files", () => {
    const first = previewDialerCsv({
      source: "dialer",
      fileContent: csv,
      existingFileHashes: new Set(),
      mappings,
      existingMetrics: [],
      actor: manager,
    });
    const duplicate = previewDialerCsv({
      source: "dialer",
      fileContent: csv,
      existingFileHashes: new Set([first.fileHash]),
      mappings,
      existingMetrics: [],
      actor: manager,
    });

    expect(duplicate.duplicateFile).toBe(true);
  });

  it("classifies new, invalid, unknown, and out-of-scope rows", () => {
    const preview = previewDialerCsv({
      source: "dialer",
      fileContent: csv,
      existingFileHashes: new Set(),
      mappings,
      existingMetrics: [],
      actor: manager,
    });

    expect(preview.summary.new).toBe(2);
    expect(preview.summary.out_of_scope).toBe(1);
    expect(preview.summary.unknown).toBe(1);
    expect(preview.summary.invalid).toBe(1);
  });

  it("detects duplicate hourly rows as unchanged or changed by source, agent, date, and hour", () => {
    const first = previewDialerCsv({
      source: "dialer",
      fileContent: csv,
      existingFileHashes: new Set(),
      mappings,
      existingMetrics: [],
      actor: manager,
    });
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

    const unchanged = previewDialerCsv({
      source: "dialer",
      fileContent: csv,
      existingFileHashes: new Set(),
      mappings,
      existingMetrics: [existing],
      actor: manager,
    });

    expect(unchanged.summary.unchanged).toBe(1);

    const changed = previewDialerCsv({
      source: "dialer",
      fileContent: csv.replace("Ava Rivera,2026-07-20,9,12", "Ava Rivera,2026-07-20,9,13"),
      existingFileHashes: new Set(),
      mappings,
      existingMetrics: [existing],
      actor: manager,
    });

    expect(changed.summary.changed).toBe(1);
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
