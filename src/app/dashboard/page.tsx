import { redirect } from "next/navigation";

import { getCurrentUser } from "@/auth/session";
import {
  EmptyTableRow,
  PageHeader,
  StatusBanner,
  TableScroll,
} from "@/components/dashboard/dashboard-primitives";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { getScopedAgents, getScopedDashboardMetrics } from "@/dashboard/data";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const [metrics, agents] = await Promise.all([
    getScopedDashboardMetrics(user),
    getScopedAgents(user),
  ]);

  return (
    <DashboardShell user={user}>
      <section className="dashboard-page">
        <PageHeader
          description="Role-scoped operational totals and the agents available within your current access level."
          eyebrow="Performance"
          title="Overview"
        />
        {metrics.status === "NO_ACTIVE_IMPORT" ? (
          <StatusBanner tone="warning">
            No approved import is currently active for this reporting scope.
            Historical, superseded, and deactivated uploads are not used as a
            fallback.
          </StatusBanner>
        ) : (
          <div className="metric-grid">
            {metrics.data.map((metric) => (
              <article className="metric-card" key={metric.label}>
                <p className="metric-card__label">{metric.label}</p>
                <p className="metric-card__value">{metric.value}</p>
              </article>
            ))}
          </div>
        )}
        <section className="ui-card mt-5">
          <div className="ui-card__header">
            <div>
              <h2 className="ui-card__title">Scoped agents</h2>
              <p className="ui-card__subtitle">
                Accounts included in your current reporting scope
              </p>
            </div>
            <span className="status-badge status-badge--neutral">
              {agents.length} {agents.length === 1 ? "agent" : "agents"}
            </span>
          </div>
          <TableScroll label="Scoped agents">
            <table className="ui-table">
              <caption>Agents in the current user&apos;s reporting scope</caption>
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Email</th>
                </tr>
              </thead>
              <tbody>
                {agents.length === 0 ? (
                  <EmptyTableRow
                    colSpan={2}
                    description="No agent accounts are currently available in this reporting scope."
                    title="No scoped agents"
                  />
                ) : (
                  agents.map((agent) => (
                    <tr key={agent.id}>
                      <td className="font-medium">{agent.name}</td>
                      <td>{agent.email}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </TableScroll>
        </section>
      </section>
    </DashboardShell>
  );
}
