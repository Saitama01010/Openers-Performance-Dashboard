import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/auth/session";
import { AgentPerformanceTable } from "@/components/dashboard/agent-performance-table";
import { AppShell } from "@/components/dashboard/app-shell";
import {
  DailyTrendChart,
  HourlyBreakdownChart,
  ProductivityBreakdown,
  TeamComparisonChart,
} from "@/components/dashboard/charts";
import {
  FilterBar,
  MetricCard,
  SectionHeading,
  StatusBadge,
} from "@/components/dashboard/dashboard-primitives";
import {
  DashboardHealthGrid,
  QuickActions,
} from "@/components/dashboard/health-cards";
import { Icon } from "@/components/dashboard/icon";
import {
  getScopedDashboardData,
  normalizeDashboardAccountFilter,
  normalizeDashboardRange,
  resolveDashboardPeriod,
} from "@/dashboard/data";
import { secondsToDuration, toPercentage } from "@/dashboard/format";

export const dynamic = "force-dynamic";

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function roleContent(role: "admin" | "manager" | "agent") {
  if (role === "admin") {
    return {
      eyebrow: "Company intelligence",
      title: "Performance overview",
      headline: "See the whole operation at a glance.",
      description:
        "Monitor productivity, compare teams, and keep imports healthy from one focused workspace.",
    };
  }

  if (role === "manager") {
    return {
      eyebrow: "Team intelligence",
      title: "Team performance",
      headline: "Keep your team moving with clarity.",
      description:
        "Follow activity patterns and agent output across the active teams assigned to you.",
    };
  }

  return {
    eyebrow: "Personal intelligence",
    title: "My performance",
    headline: "Your performance, clearly in focus.",
    description:
      "Track your calls, activity mix, and hourly rhythm without company-wide distractions.",
  };
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{
    range?: string | string[];
    from?: string | string[];
    to?: string | string[];
    users?: string | string[];
  }>;
}) {
  const user = await getCurrentUser();
  const params = await searchParams;

  if (!user) {
    redirect("/login");
  }

  const period = resolveDashboardPeriod(normalizeDashboardRange(params.range), {
    from: firstValue(params.from),
    to: firstValue(params.to),
  });
  const accountFilter = normalizeDashboardAccountFilter(params.users);
  const data = await getScopedDashboardData(
    user,
    period,
    user.role === "admin" ? accountFilter : "all",
  );
  const copy = roleContent(user.role);
  const callsPerHour =
    data.totals.loginSeconds > 0
      ? data.totals.calls / (data.totals.loginSeconds / 3600)
      : 0;
  const talkPercentage = toPercentage(
    data.totals.talkSeconds,
    data.totals.loginSeconds,
  );

  const activityMetrics = [
    {
      label: "Ready time",
      value: secondsToDuration(data.totals.readySeconds),
      helper: `${toPercentage(
        data.totals.readySeconds,
        data.totals.loginSeconds,
      ).toFixed(1)}% of logged-in time`,
      icon: "check" as const,
      tone: "cyan" as const,
    },
    {
      label: "Talk time",
      value: secondsToDuration(data.totals.talkSeconds),
      helper: `${talkPercentage.toFixed(1)}% of logged-in time`,
      icon: "activity" as const,
      tone: "blue" as const,
    },
    {
      label: "Ringing time",
      value: secondsToDuration(data.totals.ringingSeconds),
      helper: `${toPercentage(
        data.totals.ringingSeconds,
        data.totals.loginSeconds,
      ).toFixed(1)}% of logged-in time`,
      icon: "pulse" as const,
      tone: "neutral" as const,
    },
    {
      label: "Wrap time",
      value: secondsToDuration(data.totals.wrapSeconds),
      helper: `${toPercentage(
        data.totals.wrapSeconds,
        data.totals.loginSeconds,
      ).toFixed(1)}% of logged-in time`,
      icon: "clock" as const,
      tone: "teal" as const,
    },
    {
      label: "Paused time",
      value: secondsToDuration(data.totals.pausedSeconds),
      helper: `${toPercentage(
        data.totals.pausedSeconds,
        data.totals.loginSeconds,
      ).toFixed(1)}% of logged-in time`,
      icon: "clock" as const,
      tone: "neutral" as const,
    },
    {
      label: "Idle time",
      value: secondsToDuration(data.totals.idleSeconds),
      helper: `${toPercentage(
        data.totals.idleSeconds,
        data.totals.loginSeconds,
      ).toFixed(1)}% of logged-in time`,
      icon: "clock" as const,
      tone: "neutral" as const,
    },
    {
      label: "Untracked time",
      value: secondsToDuration(data.totals.untrackedSeconds),
      helper: `${toPercentage(
        data.totals.untrackedSeconds,
        data.totals.loginSeconds,
      ).toFixed(1)}% of logged-in time`,
      icon: "filter" as const,
      tone: "neutral" as const,
    },
  ];

  return (
    <AppShell
      eyebrow={copy.eyebrow}
      title={copy.title}
      user={user}
    >
      <main className="mx-auto max-w-[104rem] overflow-x-clip px-4 py-5 sm:px-6 sm:py-7 lg:px-8">
        <section className="reveal-section relative overflow-hidden rounded-[1.4rem] border border-primary/15 bg-gradient-to-br from-[#101f34] via-[#0b1727] to-[#08121f] px-5 py-6 shadow-[0_22px_70px_rgba(0,0,0,.25)] sm:px-7 sm:py-8">
          <div className="surface-grid pointer-events-none absolute inset-0 opacity-70" />
          <div className="pointer-events-none absolute -top-28 right-0 size-72 rounded-full bg-primary/15 blur-[90px]" />
          <div className="pointer-events-none absolute -right-12 -bottom-32 size-64 rounded-full bg-teal/10 blur-[80px]" />
          <div className="relative grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div>
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <StatusBadge
                  label={
                    user.role === "admin"
                      ? "Company scope"
                      : user.role === "manager"
                        ? "Assigned teams"
                        : "Personal scope"
                  }
                  tone="info"
                />
                <span className="inline-flex items-center gap-1.5 text-[11px] text-muted">
                  <Icon className="size-3.5 text-teal" name="calendar" />
                  {data.period.label}
                </span>
              </div>
              <h2 className="max-w-3xl text-2xl font-semibold tracking-[-0.04em] text-white sm:text-3xl lg:text-[2.15rem]">
                {copy.headline}
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-strong">
                {copy.description}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {user.role !== "agent" ? (
                <Link
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-gradient-to-r from-primary to-primary-strong px-4 text-xs font-semibold text-white shadow-[0_10px_28px_rgba(22,139,255,.22)] transition hover:-translate-y-0.5 hover:shadow-[0_14px_32px_rgba(22,139,255,.3)]"
                  href="/import"
                >
                  <Icon className="size-4" name="import" />
                  Import activity
                </Link>
              ) : null}
              <a
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.045] px-4 text-xs font-semibold text-white transition hover:border-cyan/25 hover:bg-white/[0.07]"
                href="#performance"
              >
                Explore performance
                <Icon className="size-4 text-cyan" name="arrow-up-right" />
              </a>
            </div>
          </div>
        </section>

        <div className="reveal-section mt-4 [animation-delay:60ms]">
          <FilterBar
            accountFilter={accountFilter}
            period={data.period}
            role={user.role}
          />
        </div>

        <section
          className="reveal-section mt-8 [animation-delay:100ms]"
          id="performance"
        >
          <SectionHeading
            description="The headline signals for the current reporting scope and date window."
            eyebrow="Core performance"
            title="KPI summary"
          />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              helper={`${data.agents.length} reporting ${
                data.agents.length === 1 ? "agent" : "agents"
              } in this scope`}
              icon="pulse"
              label="Calls"
              primary
              tone="blue"
              value={data.totals.calls.toLocaleString()}
            />
            <MetricCard
              helper="Total session time in the selected window"
              icon="clock"
              label="Logged-in time"
              primary
              tone="cyan"
              value={secondsToDuration(data.totals.loginSeconds)}
            />
            <MetricCard
              helper="Calls divided by logged-in hours"
              icon="chart"
              label="Calls per logged-in hour"
              primary
              tone="teal"
              value={callsPerHour.toFixed(1)}
            />
            <MetricCard
              helper="Talk time divided by logged-in time"
              icon="activity"
              label="Talk percentage"
              primary
              tone="blue"
              value={`${talkPercentage.toFixed(1)}%`}
            />
          </div>
        </section>

        <section className="reveal-section mt-8 [animation-delay:140ms]">
          <SectionHeading
            description="A compact breakdown of the activity states behind the headline totals."
            title="Activity states"
          />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7">
            {activityMetrics.map((metric) => (
              <MetricCard {...metric} key={metric.label} />
            ))}
          </div>
        </section>

        <section className="reveal-section mt-8 grid gap-4 [animation-delay:180ms] xl:grid-cols-[minmax(0,1.7fr)_minmax(20rem,.8fr)]">
          <DailyTrendChart
            canImport={user.role !== "agent"}
            points={data.trend}
          />
          <ProductivityBreakdown totals={data.totals} />
        </section>

        <section className="reveal-section mt-8 [animation-delay:220ms]">
          <SectionHeading
            description="See when activity happens and how scoped teams compare on normalized output."
            eyebrow="Operating rhythm"
            title="Activity intelligence"
          />
          <div
            className={`grid gap-4 ${
              user.role === "agent"
                ? ""
                : "xl:grid-cols-[minmax(0,1.35fr)_minmax(20rem,.65fr)]"
            }`}
          >
            <HourlyBreakdownChart points={data.hourly} />
            {user.role !== "agent" ? (
              <TeamComparisonChart rows={data.teams} />
            ) : null}
          </div>
        </section>

        <section className="reveal-section mt-8 [animation-delay:260ms]">
          <SectionHeading
            description={
              user.role === "agent"
                ? "Your detailed performance record for this reporting window."
                : "Search scoped agents and reveal additional activity columns when needed."
            }
            eyebrow="Detailed performance"
            title={user.role === "agent" ? "Personal breakdown" : "Agent view"}
          />
          <AgentPerformanceTable rows={data.agents} />
        </section>

        <section className="reveal-section mt-8 [animation-delay:300ms]">
          <SectionHeading
            description="Freshness, source health, and time-accounting signals for this dashboard view."
            eyebrow="Trust layer"
            title="Data health"
          />
          <DashboardHealthGrid
            health={data.health}
            role={user.role}
            totals={data.totals}
          />
        </section>

        {user.role !== "agent" ? (
          <section className="reveal-section mt-8 [animation-delay:340ms]">
            <SectionHeading
              description="Jump directly into the operational workflows available to your role."
              title="Quick actions"
            />
            <QuickActions role={user.role} />
          </section>
        ) : null}

        <footer className="mt-10 flex flex-col gap-2 border-t border-border py-5 text-[10px] text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>Openers Performance · Secure role-scoped reporting</p>
          <p>All metrics reflect {data.period.label}</p>
        </footer>
      </main>
    </AppShell>
  );
}
