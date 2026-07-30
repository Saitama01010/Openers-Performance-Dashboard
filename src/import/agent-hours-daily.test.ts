import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { Actor } from "@/auth/authorization";
import {
  AGENT_HOURS_DAILY_HEADERS,
  detectDialerGranularity,
  hourlyKey,
  inspectDialerCsvFormat,
  normalizeDialerHeader,
  parseAgentHoursFilenameRange,
  parseDialerDate,
  previewDialerCsv,
  validateDialerHeaders,
  type ExistingDialerMetric,
  type SourceMapping,
} from "@/import/dialer";
import { validateImport } from "@/import/validation";

const dailyHeader =
  "Agent,Logged In (sec),Ready (sec),Talk (sec),Wrap (sec),Paused (sec),System Pause (sec),Net (sec),Calls";
const hourlyHeader =
  "Agent,Date,Hour,Logged In (sec),Ready (sec),Talk (sec),Ringing (sec),Wrap (sec),Paused (sec),Idle (sec),Untracked (sec),Calls";
const selectedReportingDate = "2026-07-28";
const admin: Actor = { id: "admin", role: "admin", teamIds: [] };
const eastManager: Actor = {
  id: "manager-east",
  role: "manager",
  teamIds: ["east"],
};
const mappings: SourceMapping[] = [
  {
    sourceAgentName: "Agent Alpha",
    profileId: "agent-alpha",
    profileName: "Alpha User",
    teamIds: ["east"],
    teamNames: ["East"],
  },
  {
    sourceAgentName: "Agent Beta",
    profileId: "agent-beta",
    profileName: "Beta User",
    teamIds: ["west"],
    teamNames: ["West"],
  },
];

function dailyCsv(...rows: string[]) {
  return `${dailyHeader}\n${rows.join("\n")}\n`;
}

function preview(input: {
  fileContent?: string;
  fileName?: string;
  selectedDate?: string | null;
  actor?: Actor;
  sourceMappings?: SourceMapping[];
  existingMetrics?: ExistingDialerMetric[];
} = {}) {
  return previewDialerCsv({
    source: "dialer",
    fileName: input.fileName,
    fileContent:
      input.fileContent ??
      dailyCsv(
        "Agent Alpha,3600,1200,900,120,300,60,3300,12",
        "Agent Beta,1800,600,450,60,150,30,1650,6",
      ),
    selectedReportingDate:
      input.selectedDate === undefined
        ? selectedReportingDate
        : input.selectedDate,
    existingFileHashes: new Set(),
    mappings: input.sourceMappings ?? mappings,
    existingMetrics: input.existingMetrics ?? [],
    actor: input.actor ?? admin,
  });
}

function validationFor(
  result: ReturnType<typeof preview>,
  fileContent: string,
) {
  return validateImport({
    preview: result,
    fileContent,
    currentMetrics: [],
    selectedReportingDate: result.selectedReportingDate,
    duplicateImports: [],
  });
}

describe("Agent Hours format detection", () => {
  it("distinguishes the existing hourly format from the daily aggregate format", () => {
    expect(inspectDialerCsvFormat(`${hourlyHeader}\n`).granularity).toBe(
      "hourly",
    );
    const daily = inspectDialerCsvFormat(`${dailyHeader}\n`);
    expect(daily.granularity).toBe("daily");
    expect(daily.missingHeaders).toEqual([]);
  });

  it("normalizes BOM, capitalization, repeated whitespace, and spacing before sec", () => {
    const headers = [
      "\uFEFF Agent ",
      " logged  in (SEC) ",
      "READY  (sec)",
      "Talk  (sec)",
      "Wrap ( sec )",
      "Paused (sec)",
      "System  Pause (sec)",
      "Net (sec)",
      "Calls",
    ];
    const normalized = headers.map(normalizeDialerHeader);

    expect(detectDialerGranularity(normalized)).toBe("daily");
    expect(validateDialerHeaders(normalized, "daily")).toEqual([]);
    expect(normalized).toEqual([...AGENT_HOURS_DAILY_HEADERS]);
  });

  it.each([
    ["System Pause (sec)", "system_pause_seconds"],
    ["Net (sec)", "net_seconds"],
    ["Idle (sec)", "idle_seconds"],
    ["Untracked (sec)", "untracked_seconds"],
  ])("keeps %s as its own explicit metric", (header, normalized) => {
    expect(normalizeDialerHeader(header)).toBe(normalized);
  });

  it("reports only missing daily fields and never requires hourly-only fields", () => {
    const missingSystemPause = inspectDialerCsvFormat(
      `${dailyHeader.replace(",System Pause (sec)", "")}\n`,
    );
    const missingNet = inspectDialerCsvFormat(
      `${dailyHeader.replace(",Net (sec)", "")}\n`,
    );

    expect(missingSystemPause.granularity).toBe("daily");
    expect(missingSystemPause.missingHeaders).toEqual([
      "system_pause_seconds",
    ]);
    expect(missingNet.missingHeaders).toEqual(["net_seconds"]);
    for (const result of [missingSystemPause, missingNet]) {
      expect(result.missingHeaders).not.toEqual(
        expect.arrayContaining([
          "date",
          "hour",
          "ringing_seconds",
          "idle_seconds",
          "untracked_seconds",
        ]),
      );
    }
  });
});

describe("Agent Hours filename range information", () => {
  it.each([
    [
      "agent-hours_2026-07-22_2026-07-28.csv",
      { startDate: "2026-07-22", endDate: "2026-07-28", multiDay: true },
    ],
    [
      "agent-hours_2026-07-22_2026-07-28 (1).csv",
      { startDate: "2026-07-22", endDate: "2026-07-28", multiDay: true },
    ],
    [
      "agent-hours_2026-07-22_2026-07-28 (12).csv",
      { startDate: "2026-07-22", endDate: "2026-07-28", multiDay: true },
    ],
  ])("recognizes %s strictly", (fileName, expected) => {
    expect(parseAgentHoursFilenameRange(fileName)).toEqual(expected);
  });

  it.each([
    "agent-hours_2026-07-22.csv",
    "unrelated_2026-07-22_2026-07-28.csv",
    "agent-hours_2026-02-30_2026-03-01.csv",
    "agent-hours_2026-07-29_2026-07-28.csv",
    "agent-hours_2026-07-22_2026-07-28 (0).csv",
  ])("ignores incomplete, unrelated, or invalid filename %s", (fileName) => {
    expect(parseAgentHoursFilenameRange(fileName)).toBeNull();
  });

  it("adds informational range text and a non-blocking multi-day warning", () => {
    const fileContent = dailyCsv(
      "Agent Alpha,3600,1200,900,120,300,60,3300,12",
    );
    const result = preview({
      fileContent,
      fileName: "agent-hours_2026-07-22_2026-07-28 (12).csv",
    });
    const validation = validationFor(result, fileContent);

    expect(validation.notices).toContain(
      "Filename suggests a reporting period from 2026-07-22 to 2026-07-28.",
    );
    expect(validation.warnings).toContain(
      "The filename suggests this file may contain totals for multiple days. All rows will be assigned to the selected reporting date 2026-07-28.",
    );
    expect(validation.errors).toEqual([]);
  });
});

describe("daily Agent Hours parsing and validation", () => {
  it("parses the anonymized attached-file structure as one daily row per agent", () => {
    const fixture = readFileSync(
      "src/import/fixtures/agent-hours-daily-anonymized.csv",
      "utf8",
    );
    const result = preview({ fileContent: fixture });

    expect(result.granularity).toBe("daily");
    expect(result.totalCsvRows).toBe(2);
    expect(result.missingHeaders).toEqual([]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows.every((row) => row.date === selectedReportingDate)).toBe(
      true,
    );
    expect(result.rows.every((row) => row.hour === null)).toBe(true);
    expect(result.rows.every((row) => row.metric?.metricKey === "daily")).toBe(
      true,
    );
    expect(result.agents.every((agent) => agent.hourlyRows.length === 0)).toBe(
      true,
    );
  });

  it("preserves supplied metrics and keeps unavailable metrics nullable", () => {
    const result = preview({
      fileContent: dailyCsv(
        "Agent Alpha,3600,1200,900,120,300,61,3299,12",
      ),
    });
    const metric = result.rows[0]?.metric;

    expect(metric).toMatchObject({
      granularity: "daily",
      metricDate: selectedReportingDate,
      metricHour: null,
      calls: 12,
      loggedInSeconds: 3600,
      readySeconds: 1200,
      talkSeconds: 900,
      wrapSeconds: 120,
      pausedSeconds: 300,
      systemPauseSeconds: 61,
      netSeconds: 3299,
      ringingSeconds: null,
      idleSeconds: null,
      untrackedSeconds: null,
    });
  });

  it("requires a valid selected date without using the filename as data", () => {
    const missing = preview({
      selectedDate: null,
      fileName: "agent-hours_2026-07-22_2026-07-28.csv",
    });

    expect(missing.selectedReportingDate).toBeNull();
    expect(missing.rows.every((row) => row.status === "invalid")).toBe(true);
    expect(missing.rows[0]?.validationMessage).toBe(
      "Choose the reporting date represented by this Agent Hours file.",
    );
    expect(parseDialerDate("2026-02-30")).toBeNull();
  });

  it.each([
    ["missing agent", ",3600,1200,900,120,300,60,3300,12", "Missing agent"],
    [
      "empty calls",
      "Agent Alpha,3600,1200,900,120,300,60,3300,",
      "Invalid calls",
    ],
    [
      "negative calls",
      "Agent Alpha,3600,1200,900,120,300,60,3300,-1",
      "Invalid calls",
    ],
    [
      "decimal calls",
      "Agent Alpha,3600,1200,900,120,300,60,3300,1.5",
      "Invalid calls",
    ],
    [
      "empty duration",
      "Agent Alpha,,1200,900,120,300,60,3300,12",
      "Invalid loggedInSeconds",
    ],
    [
      "negative duration",
      "Agent Alpha,3600,-1,900,120,300,60,3300,12",
      "Invalid readySeconds",
    ],
    [
      "NaN duration",
      "Agent Alpha,3600,1200,NaN,120,300,60,3300,12",
      "Invalid talkSeconds",
    ],
    [
      "Infinity duration",
      "Agent Alpha,3600,1200,900,120,300,60,Infinity,12",
      "Invalid netSeconds",
    ],
  ])("rejects %s", (_label, row, expectedMessage) => {
    const result = preview({ fileContent: dailyCsv(row) });

    expect(result.rows[0]?.status).toBe("invalid");
    expect(result.rows[0]?.validationMessage).toContain(expectedMessage);
    expect(result.rows[0]?.rawRow).toBeDefined();
  });

  it("keeps unknown and unauthorized identities excluded without guessing", () => {
    const unknown = preview({
      fileContent: dailyCsv(
        "Agent Gamma,3600,1200,900,120,300,60,3300,12",
      ),
    });
    const unauthorized = preview({
      fileContent: dailyCsv(
        "Agent Beta,3600,1200,900,120,300,60,3300,12",
      ),
      actor: eastManager,
    });

    expect(unknown.rows[0]?.status).toBe("unknown");
    expect(unknown.rows[0]?.metric).toBeUndefined();
    expect(unauthorized.rows[0]?.status).toBe("out_of_scope");
    expect(unauthorized.rows[0]?.metric).toBeUndefined();
  });

  it("blocks duplicate agent/reporting-date rows", () => {
    const fileContent = dailyCsv(
      "Agent Alpha,3600,1200,900,120,300,60,3300,12",
      "Agent Alpha,3600,1200,900,120,300,60,3300,12",
    );
    const result = preview({ fileContent });
    const validation = validationFor(result, fileContent);

    expect(validation.errors.join(" ")).toContain(
      "Duplicate agent/reporting-date rows",
    );
  });

  it("uses daily identity independently from hourly identity and detects unchanged rows", () => {
    const first = preview({
      fileContent: dailyCsv(
        "Agent Alpha,3600,1200,900,120,300,60,3300,12",
      ),
    });
    const metric = first.rows[0]?.metric;
    const rowHash = first.rows[0]?.rowHash;

    expect(metric).toBeDefined();
    expect(rowHash).toBeDefined();
    expect(hourlyKey(metric!)).toBe(
      "dialer:agent-alpha:2026-07-28:daily",
    );
    expect(
      hourlyKey({
        source: "dialer",
        agentProfileId: "agent-alpha",
        metricDate: selectedReportingDate,
        metricHour: 0,
        granularity: "hourly",
        metricKey: "hour:00",
      }),
    ).not.toBe(hourlyKey(metric!));

    const unchanged = preview({
      fileContent: dailyCsv(
        "Agent Alpha,3600,1200,900,120,300,60,3300,12",
      ),
      existingMetrics: [
        {
          source: metric!.source,
          agentProfileId: metric!.agentProfileId,
          granularity: metric!.granularity,
          metricDate: metric!.metricDate,
          metricHour: metric!.metricHour,
          metricKey: metric!.metricKey,
          rowHash: rowHash!,
        },
      ],
    });

    expect(unchanged.rows[0]?.status).toBe("unchanged");
  });
});
