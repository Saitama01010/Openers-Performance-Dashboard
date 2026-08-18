import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import {
  getImportConfirmationBlockReason,
  getImportConfirmationBlockReasons,
  hourlyKey,
  metricRowHash,
  parseDialerDate,
  parseDialerHour,
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
const realFormatFixture = readFileSync(
  "src/import/fixtures/agent-hours-real-format-anonymized.csv",
  "utf8",
);

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
const admin: Actor = { id: "admin", role: "admin", teamIds: [] };

function preview(fileContent = csv, existingMetrics: ExistingDialerMetric[] = []) {
  return previewDialerCsv({
    source: "dialer",
    fileContent,
    existingFileHashes: new Set(),
    mappings,
    existingMetrics,
    actor: admin,
  });
}

function sumAgentHourlyDurations(durations: DurationTotals[]) {
  return durations.reduce(
    (total, row) => ({
      loggedInSeconds: total.loggedInSeconds + row.loggedInSeconds,
      readySeconds: total.readySeconds + row.readySeconds,
      talkSeconds: total.talkSeconds + row.talkSeconds,
      ringingSeconds: (total.ringingSeconds ?? 0) + (row.ringingSeconds ?? 0),
      wrapSeconds: total.wrapSeconds + row.wrapSeconds,
      pausedSeconds: total.pausedSeconds + row.pausedSeconds,
      systemPauseSeconds: null,
      netSeconds: null,
      idleSeconds: (total.idleSeconds ?? 0) + (row.idleSeconds ?? 0),
      untrackedSeconds:
        (total.untrackedSeconds ?? 0) + (row.untrackedSeconds ?? 0),
    }),
    {
      loggedInSeconds: 0,
      readySeconds: 0,
      talkSeconds: 0,
      ringingSeconds: 0,
      wrapSeconds: 0,
      pausedSeconds: 0,
      systemPauseSeconds: null,
      netSeconds: null,
      idleSeconds: 0,
      untrackedSeconds: 0,
    },
  );
}

describe("dialer import preview", () => {
  it("parses canonical and slash-formatted dates explicitly", () => {
    expect(parseDialerDate("7/21/2026")).toBe("2026-07-21");
    expect(parseDialerDate("07/21/2026")).toBe("2026-07-21");
    expect(parseDialerDate("2026-07-21")).toBe("2026-07-21");
    expect(parseDialerDate("2024-02-29")).toBe("2024-02-29");
    expect(parseDialerDate("2/30/2026")).toBeNull();
    expect(parseDialerDate("13/1/2026")).toBeNull();
    expect(parseDialerDate("2026-02-29")).toBeNull();
    expect(parseDialerDate("July 21, 2026")).toBeNull();
    expect(parseDialerDate("")).toBeNull();
  });

  it("parses integer and whole-hour clock values explicitly", () => {
    expect(parseDialerHour("8")).toBe(8);
    expect(parseDialerHour("08")).toBe(8);
    expect(parseDialerHour("8:00")).toBe(8);
    expect(parseDialerHour("08:00")).toBe(8);
    expect(parseDialerHour("14:00")).toBe(14);
    expect(parseDialerHour("22:00")).toBe(22);
    expect(parseDialerHour("8:30")).toBeNull();
    expect(parseDialerHour("24:00")).toBeNull();
    expect(parseDialerHour("-1")).toBeNull();
    expect(parseDialerHour("")).toBeNull();
  });

  it("uses canonical date and hour values for hourly identity", () => {
    const canonicalMetric = {
      source: "dialer",
      agentProfileId: "agent-ava",
      metricDate: parseDialerDate("7/21/2026")!,
      metricHour: parseDialerHour("8:00")!,
    };
    const equivalentMetric = {
      source: "dialer",
      agentProfileId: "agent-ava",
      metricDate: parseDialerDate("2026-07-21")!,
      metricHour: parseDialerHour("8")!,
    };

    expect(hourlyKey(canonicalMetric)).toBe(hourlyKey(equivalentMetric));
  });

  it("parses the anonymized real dialer format as valid hourly rows", () => {
    const result = previewDialerCsv({
      source: "dialer",
      fileContent: realFormatFixture.replaceAll("\n", "\r\n"),
      existingFileHashes: new Set(),
      mappings: [
        {
          sourceAgentName: "Agent Alpha",
          profileId: "agent-alpha",
          profileName: "Agent Alpha",
          teamIds: ["east"],
          teamNames: ["East"],
          accountStatus: "invited",
        },
      ],
      existingMetrics: [],
      actor: { id: "admin", role: "admin", teamIds: [] },
    });

    expect(result.missingHeaders).toEqual([]);
    expect(result.fileSummary.totalCsvRows).toBe(4);
    expect(result.fileSummary.uniqueAgentsDetected).toBe(2);
    expect(result.fileSummary.uniqueMappedAgents).toBe(1);
    expect(result.fileSummary.uniqueUnmappedAgents).toBe(1);
    expect(result.fileSummary.invalidRows).toBe(0);
    expect(result.fileSummary.newRows).toBe(2);
    expect(result.fileSummary.unknownRows).toBe(2);
    expect(result.fileSummary.totalCalls).toBe(74);
    expect(result.fileSummary.durationTotals).toEqual({
      loggedInSeconds: 11100,
      readySeconds: 1850,
      talkSeconds: 5300,
      ringingSeconds: 370,
      wrapSeconds: 740,
      pausedSeconds: 2630,
      systemPauseSeconds: null,
      netSeconds: null,
      idleSeconds: 210,
      untrackedSeconds: 0,
    });

    const mapped = result.agents.find((agent) => agent.agentKey === "agent alpha");
    const unmapped = result.agents.find((agent) => agent.agentKey === "agent beta");

    expect(mapped?.mappingStatus).toBe("mapped");
    expect(mapped?.dateRange).toEqual({
      earliest: "2026-07-21",
      latest: "2026-07-21",
    });
    expect(mapped?.calculationDetails.earliestDateHour).toBe(
      "2026-07-21 08:00",
    );
    expect(mapped?.calculationDetails.latestDateHour).toBe(
      "2026-07-21 09:00",
    );
    expect(mapped?.calculationDetails.hourlyRowsIncluded).toBe(2);
    expect(mapped?.calculationDetails.invalidRowsExcluded).toBe(0);
    expect(unmapped?.mappingStatus).toBe("unmapped");
    expect(unmapped?.calls).toBe(38);
    expect(unmapped?.durations.loggedInSeconds).toBe(5700);
  });

  it("matches equivalent real-format rows to existing canonical hourly records", () => {
    const result = previewDialerCsv({
      source: "dialer",
      fileContent: `${header}\nAgent Alpha,7/21/2026,8:00,1800,300,900,60,120,390,30,0,12\n`,
      existingFileHashes: new Set(),
      mappings: [
        {
          sourceAgentName: "Agent Alpha",
          profileId: "agent-alpha",
          profileName: "Agent Alpha",
          teamIds: ["east"],
          teamNames: ["East"],
        },
      ],
      existingMetrics: [
        {
          source: "dialer",
          agentProfileId: "agent-alpha",
          granularity: "hourly",
          metricDate: "2026-07-21",
          metricHour: 8,
          metricKey: "hour:08",
          rowHash: metricRowHash({
            source: "dialer",
            sourceAgentName: "Agent Alpha",
            agentProfileId: "agent-alpha",
            granularity: "hourly",
            metricDate: "2026-07-21",
            metricHour: 8,
            metricKey: "hour:08",
            calls: 12,
            loggedInSeconds: 1800,
            readySeconds: 300,
            talkSeconds: 900,
            ringingSeconds: 60,
            wrapSeconds: 120,
            pausedSeconds: 390,
            systemPauseSeconds: null,
            netSeconds: null,
            idleSeconds: 30,
            untrackedSeconds: 0,
            teamIdSnapshot: "east",
            teamNameSnapshot: "East",
          }),
        },
      ],
      actor: { id: "admin", role: "admin", teamIds: [] },
    });

    expect(result.summary.unchanged).toBe(1);
    expect(result.summary.new).toBe(0);
  });

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

  it("marks every manager row as out of scope and not importable", () => {
    const result = previewDialerCsv({
      source: "dialer",
      fileContent: csv,
      existingFileHashes: new Set(),
      mappings,
      existingMetrics: [],
      actor: manager,
    });

    for (const agentKey of ["ava rivera", "mia patel"]) {
      const agent = result.agents.find((item) => item.agentKey === agentKey);
      const row = result.rows.find((item) => item.agentKey === agentKey);
      expect(agent?.mappingStatus).toBe("out_of_scope");
      expect(row?.status).toBe("out_of_scope");
      expect(row?.importable).toBe(false);
    }
  });

  it("allows partial confirmation when mapped rows can be imported", () => {
    const partialCsv = `${header}\nAva Rivera,2026-07-20,0,3600,600,1200,60,60,300,300,0,5\nJordan Smith,2026-07-20,0,3600,600,1200,60,60,300,300,0,5\n`;
    const result = preview(partialCsv);
    const reasons = getImportConfirmationBlockReasons(result);

    expect(reasons).toEqual([]);
    expect(result.fileSummary.eligibleMappedRows).toBe(1);
    expect(result.fileSummary.mappedRowsToImport).toBe(1);
    expect(result.fileSummary.unmappedRowsToSkip).toBe(1);
    expect(result.fileSummary.uniqueUnmappedAgents).toBe(1);
  });

  it("blocks invalid mapped rows without blocking invalid unmapped rows", () => {
    const invalidMapped = preview(
      `${header}\nAva Rivera,2026-07-20,25,3600,600,1200,60,60,300,300,0,5\nJordan Smith,2026-07-20,0,3600,600,1200,60,60,300,300,0,5\n`,
    );

    expect(invalidMapped.fileSummary.invalidMappedRows).toBe(1);
    expect(getImportConfirmationBlockReason(invalidMapped)).toContain(
      "invalid mapped row",
    );

    const invalidUnmapped = preview(
      `${header}\nAva Rivera,2026-07-20,0,3600,600,1200,60,60,300,300,0,5\nJordan Smith,2026-07-20,25,3600,600,1200,60,60,300,300,0,5\n`,
    );

    expect(invalidUnmapped.fileSummary.invalidRows).toBe(1);
    expect(invalidUnmapped.fileSummary.invalidMappedRows).toBe(0);
    expect(getImportConfirmationBlockReasons(invalidUnmapped)).toEqual([]);
  });

  it("blocks ambiguous mappings", () => {
    const result = previewDialerCsv({
      source: "dialer",
      fileContent: `${header}\nAva Rivera,2026-07-20,0,3600,600,1200,60,60,300,300,0,5\n`,
      existingFileHashes: new Set(),
      mappings: [
        ...mappings,
        {
          sourceAgentName: "Ava Rivera",
          profileId: "agent-duplicate",
          profileName: "Duplicate Agent",
          teamIds: ["east"],
          teamNames: ["East Openers"],
        },
      ],
      existingMetrics: [],
      actor: admin,
    });

    expect(result.fileSummary.uniqueInvalidMappingAgents).toBe(1);
    expect(getImportConfirmationBlockReason(result)).toContain(
      "invalid mappings",
    );
  });

  it("blocks fully confirmed exact duplicate files with no new or changed rows", () => {
    const hash = sha256(oneAgentCsv);
    const basePreview = preview(oneAgentCsv);
    const existingMetrics = basePreview.rows
      .map((row) =>
        row.metric && row.rowHash
          ? {
              source: row.metric.source,
              agentProfileId: row.metric.agentProfileId,
              granularity: row.metric.granularity,
              metricDate: row.metric.metricDate,
              metricHour: row.metric.metricHour,
              metricKey: row.metric.metricKey,
              rowHash: row.rowHash,
            }
          : null,
      )
      .filter((row): row is ExistingDialerMetric => Boolean(row));
    const duplicate = previewDialerCsv({
      source: "dialer",
      fileContent: oneAgentCsv,
      existingFileHashes: new Set([hash]),
      mappings,
      existingMetrics,
      actor: admin,
    });

    expect(duplicate.duplicateFile).toBe(true);
    expect(duplicate.fileSummary.mappedRowsToImport).toBe(0);
    expect(getImportConfirmationBlockReason(duplicate)).toContain(
      "Duplicate file blocked.",
    );
  });

  it("does not block a duplicate hash when mapped rows are still importable", () => {
    const hash = sha256(oneAgentCsv);
    const duplicateWithNewRows = previewDialerCsv({
      source: "dialer",
      fileContent: oneAgentCsv,
      existingFileHashes: new Set([hash]),
      mappings,
      existingMetrics: [],
      actor: admin,
    });

    expect(duplicateWithNewRows.duplicateFile).toBe(true);
    expect(duplicateWithNewRows.fileSummary.mappedRowsToImport).toBe(10);
    expect(getImportConfirmationBlockReasons(duplicateWithNewRows)).toEqual([]);
  });

  it("detects corrected rows as changed by source, agent, date, and hour", () => {
    const first = preview(oneAgentCsv);
    const avaMetric = first.rows.find((row) => row.metric)?.metric;

    expect(avaMetric).toBeDefined();

    const existing: ExistingDialerMetric = {
      source: "dialer",
      agentProfileId: "agent-ava",
      granularity: "hourly",
      metricDate: "2026-07-20",
      metricHour: 0,
      metricKey: "hour:00",
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
  it("prevents managers from importing even for an assigned team", () => {
    expect(
      canImportForProfile(manager, { id: "agent-ava", teamIds: ["east"] }),
    ).toBe(false);
  });

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
