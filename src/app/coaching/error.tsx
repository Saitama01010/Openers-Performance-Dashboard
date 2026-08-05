"use client";

import { DashboardErrorState } from "@/components/dashboard/dashboard-error-state";

export default function CoachingError({
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <DashboardErrorState
      description="Coaching Sessions could not be loaded. Retry the request or return later."
      reset={unstable_retry}
      title="Coaching Sessions unavailable"
    />
  );
}
