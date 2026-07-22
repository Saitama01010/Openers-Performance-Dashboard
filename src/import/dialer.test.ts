import { describe, expect, it } from "vitest";

import {
  getImportConfirmationBlockReason,
  getImportConfirmationBlockReasons,
  hourlyKey,
  metricRowHash,
  previewDialerCsv,
  sha256,
  type DurationTotals,
  type ExistingDialerMetric,
} from "@/import/dialer";
import { formatDurationSeconds, formatOptionalNumber } from "@/import/format";
import {
  canAccessProfile,
  canImportForProfile,
  type Actor,
} from "@/auth/authorization";

const header =
  "Agent,Date,Hour,Logged In (sec),Ready (sec),Talk (sec),Ringing (sec),Wrap (sec),Paused (sec),Idle (sec),Untracked (sec),Calls";

const avaRows = [
  "Ava Rivera,2026-07-20,0,10000,1000,2000,100,200,300,400,500,10",
  " ava   rivera ,2026-07-20,1,10000,1000,2000,100,200,300,400,500,10",
  "AVA RIVERA,2026-07-20,2,10000,1000,2000,100,200,300,400,500,10",
  "Ava Rivera,2026-07-20,3,10000,1000,2000,100,200,300,400,500,10",
  "Ava Rivera,2026-07-20,4,10000,1000,2000,100,200,300,400,500,10",
  "Ava Rivera,2026-07-20,5,10000,1000,2000,100,200,300,400,500,10",
  "Ava Rivera,2026-07-20,6,10000,1000,2000,100,200,300,400,500,10",
  "Ava Rivera,2026-07-20,7,10000,1000,2000,100,200,300,400,500,10",
  "Ava Rivera,2026-07-20,8,10000,1000,2000,100,200,300,400,500,10",
  "Ava Rivera,2026-07-20,9,10000,1000,2000,100,200,300,400,500,10",
];
const mixedRows = [
  ...avaRows,
  "Ava Rivera,2026-07-20,25,10000,1000,2000,100,200,300,400,500,10",
  "Jordan Smith,2026-07-20,0,3600,600,1200,60,60,300,300,0,5",
  "JORDAN   SMITH,2026-07-20,1,3600,600,1200,60,60,300,300,0,5",
  "Mia Patel,2026-07-20,0,1800,500,500,50,50,100,100,100,2",
];
const csv = `${header}\n${mixedRows.join("\n")}\n`;
const oneAgentCsv = `${header}\n${avaRows.join("\n")}\n`;

const mappings = [
  {
    sourceAgentName: "Ava Rivera",
    profileId: "agent-ava",
    profileName: "Ava Rivera",
    teamIds: ["east"],
    teamNames: ["East Openers"],
  },
  {
    sourceAgentName: "Mia Patel",
    profileId: "agent-mia",
    profileName: "Mia Patel",
    teamIds: ["west"],
    teamNames: ["West Openers"],
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

function sumAgentHourlyDurations(durations: DurationTotals[]) {
  return durations.reduce(
    (total, row) => ({
      loggedInSeconds: total.loggedInSeconds + row.loggedInSeconds,
      readySeconds: total.readySeconds + row.readySeconds,
      talkSeconds: total.talkSeconds + row.talkSeconds,
      ringingSeconds: total.ringingSeconds + row.ringingSeconds,
      wrapSeconds: total.wrapSeconds + row.wrapSeconds,
      pausedSeconds: total.pausedSeconds + row.pausedSeconds,
      idleSeconds: total.idleSeconds + row.idleSeconds,
      untrackedSeconds: total.untrackedSeconds + row.untrackedSeconds,
    }),
    {
      loggedInSeconds: 0,
      readySeconds: 0,
      talkSeconds: 0,
      ringingSeconds: 0,
      wrapSeconds: 0,
      pausedSeconds: 0,
      idleSeconds: 0,
      untrackedSeconds: 0,
    },
  );
}

describe("dialer import preview", () => {
  it("maps the exact real dialer headers", () => {
    const result = preview();

    expect(result.missingHeaders).toEqual([]);
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
    expect(result.rows[0].durations?.loggedInSeconds).toBe(10000);
  });

  it("trims UTF-8 BOM and header whitespace case-insensitively", () => {
    const messyCsv = oneAgentCsv.replace(
      "Agent,Date,Hour",
      "\uFEFF agent , DATE , hour ",
    );
    const result = preview(messyCsv);

    expect(result.missingHeaders).toEqual([]);
    expect(result.fileSummary.totalCsvRows).toBe(10);
  });

  it("reports missing headers and blocks confirmation instead of all-zero success", () => {
    const missingCalls = csv.replace(",Calls\n", "\n");
    const result = preview(missingCalls);

    expect(result.missingHeaders).toEqual(["calls"]);
    expect(result.totalCsvRows).toBe(14);
    expect(result.fileSummary.totalCsvRows).toBe(14);
    expect(getImportConfirmationBlockReason(result)).toContain("calls");
  });

  it("counts 10 hourly rows for one agent as 10 rows and 1 unique agent", () => {
    const result = preview(oneAgentCsv);
    const ava = result.agents.find((agent) => agent.agentKey === "ava rivera");

    expect(result.fileSummary.totalCsvRows).toBe(10);
    expect(result.fileSummary.uniqueAgentsDetected).toBe(1);
    expect(ava?.csvRowCount).toBe(10);
  });

  it("does not create duplicate agents for name casing and extra spaces", () => {
    const result = preview(oneAgentCsv);

    expect(result.agents.map((agent) => agent.agentKey)).toEqual(["ava rivera"]);
  });

  it("sums duration seconds and calls across hourly rows", () => {
    const result = preview();
    const ava = result.agents.find((agent) => agent.agentKey === "ava rivera");

    expect(ava?.durations.loggedInSeconds).toBe(100000);
    expect(ava?.durations.talkSeconds).toBe(20000);
    expect(ava?.calls).toBe(100);
  });

  it("excludes invalid rows from totals", () => {
    const result = preview();
    const ava = result.agents.find((agent) => agent.agentKey === "ava rivera");

    expect(ava?.csvRowCount).toBe(11);
    expect(ava?.validRowCount).toBe(10);
    expect(ava?.invalidRowCount).toBe(1);
    expect(ava?.calls).toBe(100);
  });

  it("formats durations above 24 hours without Date objects", () => {
    expect(formatDurationSeconds(100000)).toEqual({
      hms: "27:46:40",
      decimalHours: 100000 / 3600,
      decimalHoursLabel: "27.78 hours",
    });
  });

  it("displays division by zero performance metrics as N/A", () => {
    const zeroLoggedInCsv = `${header}\nAva Rivera,2026-07-20,0,0,0,0,0,0,0,0,0,1\n`;
    const result = preview(zeroLoggedInCsv);
    const ava = result.agents[0];

    expect(ava.performance.callsPerLoggedInHour).toBeNull();
    expect(ava.performance.talkPercentage).toBeNull();
    expect(formatOptionalNumber(ava.performance.callsPerLoggedInHour)).toBe(
      "N/A",
    );
  });

  it("calculates calls per logged-in hour", () => {
    const result = preview();
    const ava = result.agents.find((agent) => agent.agentKey === "ava rivera");

    expect(ava?.performance.callsPerLoggedInHour).toBeCloseTo(3.6);
  });

  it("shows calculated preview totals for mapped and unmapped agents", () => {
    const result = preview();
    const ava = result.agents.find((agent) => agent.agentKey === "ava rivera");
    const jordan = result.agents.find(
      (agent) => agent.agentKey === "jordan smith",
    );

    expect(ava?.mappingStatus).toBe("mapped");
    expect(ava?.calls).toBe(100);
    expect(jordan?.mappingStatus).toBe("unmapped");
    expect(jordan?.calls).toBe(10);
    expect(jordan?.durations.loggedInSeconds).toBe(7200);
  });

  it("counts unknown rows and unique unmapped agents separately", () => {
    const result = preview();

    expect(result.fileSummary.unknownRows).toBe(2);
    expect(result.fileSummary.uniqueUnmappedAgents).toBe(1);
  });

  it("keeps company totals equal to the sum of agent totals", () => {
    const result = preview();
    const agentCalls = result.agents.reduce((total, agent) => total + agent.calls, 0);
    const agentLoggedIn = result.agents.reduce(
      (total, agent) => total + agent.durations.loggedInSeconds,
      0,
    );

    expect(result.fileSummary.totalCalls).toBe(agentCalls);
    expect(result.fileSummary.durationTotals.loggedInSeconds).toBe(agentLoggedIn);
    expect(result.fileSummary.totalCalls).toBe(112);
    expect(result.fileSummary.durationTotals.loggedInSeconds).toBe(109000);
  });

  it("keeps each agent total equal to the sum of hourly drill-down rows", () => {
    const result = preview();

    for (const agent of result.agents) {
      const hourlyDurations = agent.hourlyRows
        .map((row) => row.durations)
        .filter((durations): durations is DurationTotals => Boolean(durations));
      const summedDurations = sumAgentHourlyDurations(hourlyDurations);
      const summedCalls = agent.hourlyRows.reduce(
        (total, row) => total + (row.calls ?? 0),
        0,
      );

      expect(agent.durations).toEqual(summedDurations);
      expect(agent.calls).toBe(summedCalls);
    }
  });

  it("marks out-of-scope rows as not importable", () => {
    const result = preview();
    const mia = result.agents.find((agent) => agent.agentKey === "mia patel");
    const miaRow = result.rows.find((row) => row.agentKey === "mia patel");

    expect(mia?.mappingStatus).toBe("out_of_scope");
    expect(miaRow?.status).toBe("out_of_scope");
    expect(miaRow?.importable).toBe(false);
  });

  it("keeps confirm import disabled when agents are unmapped", () => {
    const result = preview();
    const reasons = getImportConfirmationBlockReasons(result);

    expect(reasons.some((reason) => reason.includes("unmapped"))).toBe(true);
  });

  it("blocks exact duplicate files even when renamed", () => {
    const hash = sha256(oneAgentCsv);
    const duplicate = previewDialerCsv({
      source: "dialer",
      fileContent: oneAgentCsv,
      existingFileHashes: new Set([hash]),
      mappings,
      existingMetrics: [],
      actor: manager,
    });

    expect(duplicate.duplicateFile).toBe(true);
    expect(getImportConfirmationBlockReason(duplicate)).toContain(
      "Duplicate file blocked.",
    );
  });

  it("detects corrected rows as changed by source, agent, date, and hour", () => {
    const first = preview(oneAgentCsv);
    const avaMetric = first.rows.find((row) => row.metric)?.metric;

    expect(avaMetric).toBeDefined();

    const existing: ExistingDialerMetric = {
      source: "dialer",
      agentProfileId: "agent-ava",
      metricDate: "2026-07-20",
      metricHour: 0,
      rowHash: metricRowHash(avaMetric!),
    };

    expect(hourlyKey(existing)).toBe("dialer:agent-ava:2026-07-20:0");

    const unchanged = preview(oneAgentCsv, [existing]);

    expect(unchanged.summary.unchanged).toBe(1);

    const changed = preview(
      oneAgentCsv.replace(
        "Ava Rivera,2026-07-20,0,10000,1000",
        "Ava Rivera,2026-07-20,0,10000,1100",
      ),
      [existing],
    );

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
