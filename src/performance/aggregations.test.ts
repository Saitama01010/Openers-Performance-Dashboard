import { describe, expect, it } from "vitest";

import {
  actorCanViewOutcome,
  aggregatePerformanceSeries,
  bucketDate,
  calculateClosedDealRate,
  calculatePerformanceDelta,
  productivityStatePercentage,
  scopeOutcomeEvents,
  serializePerformanceTimestamp,
  selectPerformanceGranularity,
  sumSeriesTotals,
  type DialerDailyAggregate,
  type ScopedOutcomeEvent,
} from "@/performance/aggregations";
import { dateKeyInTimeZone } from "@/sheets/timestamp";

const actorBase = { id: "admin", organizationId: "org" };
const event = (date: string, profileId: string, teamId: string | null): ScopedOutcomeEvent => ({ date, profileId, teamId });
const dialer = (date: string, overrides: Partial<DialerDailyAggregate> = {}): DialerDailyAggregate => ({
  date,
  loggedInSeconds: 3600,
  readySeconds: 600,
  talkSeconds: 900,
  ringingSeconds: 60,
  wrapSeconds: 120,
  pausedSeconds: 30,
  systemPauseSeconds: 20,
  idleSeconds: 10,
  untrackedSeconds: 5,
  netSeconds: 3500,
  sourceRows: 1,
  ...overrides,
});

describe("performance aggregation", () => {
  it("calculates closed deal rate without dividing by zero or unavailable data", () => {
    expect(calculateClosedDealRate(3, 12)).toBe(25);
    expect(calculateClosedDealRate(0, 12)).toBe(0);
    expect(calculateClosedDealRate(1, 0)).toBeNull();
    expect(calculateClosedDealRate(null, 12)).toBeNull();
    expect(calculateClosedDealRate(1, null)).toBeNull();
  });

  it("calculates comparison deltas without manufacturing a percentage from zero", () => {
    expect(calculatePerformanceDelta(12, 8)).toEqual({ absolute: 4, percentage: 50 });
    expect(calculatePerformanceDelta(2, 0)).toEqual({ absolute: 2, percentage: null });
    expect(calculatePerformanceDelta(null, 3)).toEqual({ absolute: null, percentage: null });
  });

  it("selects readable granularity for daily, large, and all-time ranges", () => {
    expect(selectPerformanceGranularity({ from: "2026-05-01", to: "2026-05-31" })).toBe("day");
    expect(selectPerformanceGranularity({ from: "2026-01-01", to: "2026-05-31" })).toBe("week");
    expect(selectPerformanceGranularity({ from: "2024-01-01", to: "2026-05-31" })).toBe("month");
    expect(selectPerformanceGranularity({})).toBe("month");
    expect(bucketDate("2026-05-06", "week")).toEqual({
      key: "2026-05-04",
      rangeStart: "2026-05-04",
      rangeEnd: "2026-05-10",
    });
  });

  it("enforces administrator, manager, agent, and empty-manager outcome scope", () => {
    const identity = { profileId: "agent-1", teamId: "team-1" };
    expect(actorCanViewOutcome({ ...actorBase, role: "admin", teamIds: [] }, identity)).toBe(true);
    expect(actorCanViewOutcome({ ...actorBase, id: "manager", role: "manager", teamIds: ["team-1"] }, identity)).toBe(true);
    expect(actorCanViewOutcome({ ...actorBase, id: "manager", role: "manager", teamIds: [] }, identity)).toBe(false);
    expect(actorCanViewOutcome({ ...actorBase, id: "agent-1", role: "agent", teamIds: ["team-1"] }, identity)).toBe(true);
    expect(actorCanViewOutcome({ ...actorBase, id: "agent-2", role: "agent", teamIds: ["team-1"] }, identity)).toBe(false);
  });

  it("applies application-date windows after role scope", () => {
    const events = [
      event("2026-05-01", "agent-1", "team-1"),
      event("2026-05-02", "agent-2", "team-2"),
      event("2026-06-01", "agent-1", "team-1"),
    ];
    expect(scopeOutcomeEvents(events, { ...actorBase, id: "manager", role: "manager", teamIds: ["team-1"] }, { from: "2026-05-01", to: "2026-05-31" })).toEqual([events[0]]);
  });

  it("uses the configured application timezone at calendar boundaries", () => {
    expect(dateKeyInTimeZone(new Date("2026-05-01T21:30:00.000Z"), "Africa/Cairo")).toBe("2026-05-02");
    expect(dateKeyInTimeZone(new Date("2026-05-01T20:30:00.000Z"), "Africa/Cairo")).toBe("2026-05-01");
  });

  it("aggregates daily outcome and dialer data once and keeps unavailable series null", () => {
    const rows = aggregatePerformanceSeries({
      granularity: "day",
      transfers: [event("2026-05-01", "a", "t"), event("2026-05-01", "a", "t")],
      closedDeals: [event("2026-05-01", "a", "t")],
      dialer: [dialer("2026-05-01", { sourceRows: 2 })],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ transfers: 2, closedDeals: 1, closedDealRate: 50, loggedInSeconds: 3600, sourceRows: 5 });
    expect(sumSeriesTotals(rows)).toEqual({ transfers: 2, closedDeals: 1, loggedInSeconds: 3600, sourceRows: 5 });

    const unavailable = aggregatePerformanceSeries({
      granularity: "day",
      transfers: null,
      closedDeals: [event("2026-05-01", "a", "t")],
      dialer: null,
    });
    expect(unavailable[0]).toMatchObject({ transfers: null, closedDeals: 1, closedDealRate: null, loggedInSeconds: null });
  });

  it("combines daily imports into weekly buckets without fabricating optional state values", () => {
    const rows = aggregatePerformanceSeries({
      granularity: "week",
      transfers: [event("2026-05-04", "a", "t"), event("2026-05-05", "a", "t")],
      closedDeals: [],
      dialer: [dialer("2026-05-04"), dialer("2026-05-05", { ringingSeconds: null })],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ transfers: 2, closedDeals: 0, loggedInSeconds: 7200, ringingSeconds: null, sourceRows: 4 });
  });

  it("represents productivity percentages honestly", () => {
    expect(productivityStatePercentage(30, 120)).toBe(25);
    expect(productivityStatePercentage(null, 120)).toBeNull();
    expect(productivityStatePercentage(0, 0)).toBeNull();
  });

  it("normalizes database timestamp strings for client-safe freshness data", () => {
    expect(serializePerformanceTimestamp("2026-05-01 10:15:30")).toBe("2026-05-01T10:15:30.000Z");
    expect(serializePerformanceTimestamp(new Date("2026-05-01T10:15:30.000Z"))).toBe("2026-05-01T10:15:30.000Z");
    expect(serializePerformanceTimestamp("not-a-date")).toBeNull();
  });
});
