import {
  pauseMinutesPerNetHour,
  wrapMinutesPerTalkHour,
} from "@/coaching/domain";
import { addDateKeyDays, normalizeWeekStart } from "@/coaching/week";
import type { DashboardDateWindow } from "@/dashboard/date-range";

export const WRAP_MINUTES_PER_TALK_HOUR_LIMIT = 7;
export const PAUSE_MINUTES_PER_NET_HOUR_LIMIT = 8;

export type TransferFlagClassification = "strong" | "improvement" | "none";

export const TRANSFER_FLAG_LABELS: Record<
  TransferFlagClassification,
  string
> = {
  strong: "Strong Flag",
  improvement: "Flag for Improvement",
  none: "No flag",
};

export function classifyTransferFlag(closedDeals: number) {
  if (closedDeals <= 1) return "strong" as const;
  if (closedDeals === 2) return "improvement" as const;
  return "none" as const;
}

export function transferFlagFromSource(input: {
  sourceAvailable: boolean;
  matchedClosedDeals?: number;
}) {
  if (!input.sourceAvailable) {
    return { closedDeals: null, classification: null };
  }
  const closedDeals = Math.max(0, input.matchedClosedDeals ?? 0);
  return {
    closedDeals,
    classification: classifyTransferFlag(closedDeals),
  };
}

export function splitTransferFlagWeeks(input: {
  dateRange: DashboardDateWindow;
  availableDealDates: string[];
  today: string;
}) {
  const availableDates = [...input.availableDealDates].sort();
  const firstDate = input.dateRange.from ?? availableDates[0] ?? input.today;
  const lastDate = input.dateRange.to ?? input.today;
  const firstWeek = normalizeWeekStart(firstDate);
  const weeks: Array<{ start: string; end: string; through: string }> = [];
  if (!firstWeek || firstDate > lastDate) return weeks;

  for (let start = firstWeek; start <= lastDate; start = addDateKeyDays(start, 7)) {
    const end = addDateKeyDays(start, 6);
    weeks.push({ start, end, through: end < lastDate ? end : lastDate });
  }
  return weeks;
}

export function buildTransferFlagRows(input: {
  agents: Array<{ id: string; name: string; teamNames: string[] }>;
  deals: Array<{ agentId: string; date: string }>;
  weeks: Array<{ start: string; end: string; through: string }>;
}) {
  const counts = new Map<string, number>();
  for (const agent of input.agents) {
    for (const week of input.weeks) counts.set(`${agent.id}:${week.start}`, 0);
  }
  for (const deal of input.deals) {
    const week = input.weeks.find(
      (item) => deal.date >= item.start && deal.date <= item.through,
    );
    if (!week) continue;
    const key = `${deal.agentId}:${week.start}`;
    if (!counts.has(key)) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return input.agents.flatMap((agent) =>
    input.weeks.flatMap((week) => {
      const closedDeals = counts.get(`${agent.id}:${week.start}`) ?? 0;
      const classification = classifyTransferFlag(closedDeals);
      return classification === "none"
        ? []
        : [{
            agentId: agent.id,
            agentName: agent.name,
            teamNames: agent.teamNames,
            week: { start: week.start, end: week.through },
            closedDeals,
            classification,
          }];
    }),
  );
}

export function calculatePerformanceFlags(input: {
  talkSeconds: number;
  wrapSeconds: number;
  readySeconds: number;
  pausedSeconds: number;
}) {
  const netCountedSeconds =
    input.talkSeconds + input.wrapSeconds + input.readySeconds;
  const wrapRate = wrapMinutesPerTalkHour(input);
  const pauseRate = pauseMinutesPerNetHour(input);
  const wrapFlag =
    wrapRate !== null && wrapRate > WRAP_MINUTES_PER_TALK_HOUR_LIMIT;
  const pauseFlag =
    pauseRate !== null && pauseRate > PAUSE_MINUTES_PER_NET_HOUR_LIMIT;

  return {
    netCountedSeconds,
    wrapRate,
    pauseRate,
    wrapFlag,
    pauseFlag,
    triggeredFlags: [
      ...(wrapFlag ? ["Wrap Time Flag" as const] : []),
      ...(pauseFlag ? ["Pause Time Flag" as const] : []),
    ],
  };
}
