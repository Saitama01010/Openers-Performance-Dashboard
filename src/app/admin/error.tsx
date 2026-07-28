"use client";

import { DashboardErrorState } from "@/components/dashboard/dashboard-error-state";

export default function AdminError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <DashboardErrorState
      description="The administration workspace could not be loaded. Retry the request without changing any account or access data."
      reset={reset}
      title="Administration unavailable"
    />
  );
}
