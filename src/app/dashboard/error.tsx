"use client";

import { DashboardErrorState } from "@/components/dashboard/dashboard-error-state";

export default function DashboardError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <DashboardErrorState
      description="The performance overview could not be loaded. Retry the request, or return later if the problem continues."
      reset={reset}
      title="Overview unavailable"
    />
  );
}
