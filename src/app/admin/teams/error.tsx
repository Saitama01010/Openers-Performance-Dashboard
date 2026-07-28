"use client";

import { DashboardErrorState } from "@/components/dashboard/dashboard-error-state";

export default function AdminTeamsError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <DashboardErrorState
      description="The teams workspace could not be loaded. No membership changes were made."
      reset={reset}
      title="Teams unavailable"
    />
  );
}
