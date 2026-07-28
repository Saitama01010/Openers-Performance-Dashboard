"use client";

import { DashboardErrorState } from "@/components/dashboard/dashboard-error-state";

export default function AgentsError({ reset }: { reset: () => void }) {
  return (
    <DashboardErrorState
      description="Agent performance could not be loaded. Retry the request, or return later if the problem continues."
      reset={reset}
      title="Agent performance unavailable"
    />
  );
}
