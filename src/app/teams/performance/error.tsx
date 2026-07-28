"use client";

import { DashboardErrorState } from "@/components/dashboard/dashboard-error-state";

export default function TeamPerformanceError({
  reset,
}: {
  reset: () => void;
}) {
  return (
    <DashboardErrorState
      description="Team performance could not be loaded. Retry the request, or return later if the problem continues."
      reset={reset}
      title="Team performance unavailable"
    />
  );
}
