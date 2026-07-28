"use client";

import { DashboardErrorState } from "@/components/dashboard/dashboard-error-state";

export default function PerformanceError({ reset }: { reset: () => void }) {
  return (
    <DashboardErrorState
      description="Performance analysis could not be loaded. Retry the request, or return later if the problem continues."
      reset={reset}
      title="Performance unavailable"
    />
  );
}
