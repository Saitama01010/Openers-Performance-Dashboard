import {
  pauseMinutesPerNetHour,
  wrapMinutesPerTalkHour,
} from "@/coaching/domain";

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
