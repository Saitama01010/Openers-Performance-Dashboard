"use client";

import { DashboardErrorState } from "@/components/dashboard/dashboard-error-state";

export default function LeaderboardError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <DashboardErrorState
      description="The LeaderBoard could not be loaded. Retry the request, or return later if the problem continues."
      reset={reset}
      title="LeaderBoard unavailable"
    />
  );
}
