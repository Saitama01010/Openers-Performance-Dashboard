"use client";

import { DashboardErrorState } from "@/components/dashboard/dashboard-error-state";

export default function ImportError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <DashboardErrorState
      description="The import workflow could not be loaded. Your source file has not been changed."
      reset={reset}
      title="Import preview unavailable"
    />
  );
}
