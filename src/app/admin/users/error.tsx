"use client";

import { DashboardErrorState } from "@/components/dashboard/dashboard-error-state";

export default function AdminUsersError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <DashboardErrorState
      description="Users and access controls could not be loaded. No account changes were made."
      reset={reset}
      title="Users and access unavailable"
    />
  );
}
