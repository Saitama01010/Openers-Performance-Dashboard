import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getCurrentUser } from "@/auth/session";
import {
  PageHeader,
  StatusBadge,
  StatusBanner,
} from "@/components/dashboard/dashboard-primitives";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import {
  ActivityStateGrid,
  formatCompactDuration,
  MetricPanel,
  ProductivityMix,
} from "@/components/dashboard/performance-visuals";
import { getDashboardData } from "@/dashboard/data";
import {
  formatDurationSeconds,
  formatNumber,
  formatOptionalNumber,
  formatPercentage,
} from "@/import/format";

export const dynamic = "force-dynamic";

export default async function AgentDetailPage({
  params,
}: {
  params: Promise<{ profileId: string }>;
}) {
  const user = await getCurrentUser();

  if (!user) redirect("/login");

  const { profileId } = await params;
  const dashboard = await getDashboardData(user, {
    showAgentsWithNoData: true,
  });
  const agent = dashboard.agentRows.find(
    (candidate) => candidate.profileId === profileId,
  );

  if (!agent) notFound();

  return (
    <DashboardShell user={user}>
      <section className="dashboard-page">
        <PageHeader
          actions={
            user.role === "agent" ? null : (
              <Link className="ui-button ui-button--secondary" href="/agents">
                Back to agents
              </Link>
            )
          }
          description={`${agent.teamName} · Performance from the active import inside your authorized scope.`}
          eyebrow="Agent performance"
          title={agent.agentName}
        />

        {!agent.hasMetrics ? (
          <StatusBanner tone="info">
            This active account has no rows in the current import. Historical
            uploads are not used as a fallback.
          </StatusBanner>
        ) : null}

        <div className="metric-panel-grid">
          <MetricPanel
            detail="Total calls in active data"
            icon="calls"
            label="Calls"
            value={formatNumber(agent.calls)}
          />
          <MetricPanel
            detail="Total active time in the system"
            icon="freshness"
            label="Logged-in time"
            tone="green"
            value={formatCompactDuration(agent.loggedInSeconds)}
          />
          <MetricPanel
            detail="Calls divided by logged-in hours"
            icon="performance"
            label="Calls per hour"
            tone="orange"
            value={formatOptionalNumber(agent.callsPerLoggedInHour)}
          />
          <MetricPanel
            detail="Talk time divided by logged-in time"
            icon="talk"
            label="Talk percentage"
            tone="violet"
            value={formatPercentage(agent.talkPercentage)}
          />
        </div>

        <div className="analysis-layout">
          <section className="ui-card analysis-layout__wide">
            <div className="ui-card__header">
              <div>
                <h2 className="ui-card__title">Activity states</h2>
                <p className="ui-card__subtitle">
                  Recorded time for this agent in the active data.
                </p>
              </div>
            </div>
            <ActivityStateGrid totals={agent} />
          </section>
          <section className="ui-card analysis-layout__narrow">
            <div className="ui-card__header">
              <div>
                <h2 className="ui-card__title">Productivity mix</h2>
                <p className="ui-card__subtitle">
                  Share of recorded activity time.
                </p>
              </div>
            </div>
            <ProductivityMix totals={agent} />
          </section>
        </div>

        <section className="ui-card mt-4">
          <div className="ui-card__header">
            <div>
              <h2 className="ui-card__title">Record context</h2>
              <p className="ui-card__subtitle">
                Account and source context for this active-version record.
              </p>
            </div>
            <StatusBadge
              tone={agent.accountStatus === "active" ? "success" : "neutral"}
            >
              {agent.accountStatus}
            </StatusBadge>
          </div>
          <dl className="description-grid">
            <div>
              <dt>Team</dt>
              <dd>{agent.teamName}</dd>
            </div>
            <div>
              <dt>Talk time</dt>
              <dd>{formatDurationSeconds(agent.talkSeconds).hms}</dd>
            </div>
            <div>
              <dt>Source rows</dt>
              <dd>{formatNumber(agent.rowCount)}</dd>
            </div>
            <div>
              <dt>Active data</dt>
              <dd>{agent.hasMetrics ? "Included" : "No rows"}</dd>
            </div>
          </dl>
        </section>
      </section>
    </DashboardShell>
  );
}
