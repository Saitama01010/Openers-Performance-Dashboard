import { AdminOverviewClient } from "@/components/dashboard/admin-overview/admin-overview-client";
import type { AdminDashboardData } from "@/dashboard/role-data";

export function AdminOverview({ data }: { data: AdminDashboardData }) {
  return <AdminOverviewClient data={data} />;
}
