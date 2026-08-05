"use client";

import { DashboardErrorState } from "@/components/dashboard/dashboard-error-state";

export default function CommissionsError({
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <DashboardErrorState
      description="Commissions could not be loaded. Check the month and retry the request."
      reset={unstable_retry}
      title="Commissions unavailable"
    />
  );
}
