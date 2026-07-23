import Link from "next/link";

import type { Role } from "@/auth/authorization";
import { Icon, type IconName } from "@/components/dashboard/icon";
import type {
  DashboardPeriod,
  DashboardRange,
} from "@/dashboard/data";

export function SectionHeading({
  action,
  description,
  eyebrow,
  title,
}: {
  action?: React.ReactNode;
  description?: string;
  eyebrow?: string;
  title: string;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        {eyebrow ? (
          <p className="mb-1.5 text-[10px] font-semibold tracking-[0.18em] text-cyan/75 uppercase">
            {eyebrow}
          </p>
        ) : null}
        <h2 className="text-lg font-semibold tracking-[-0.025em] text-white sm:text-xl">
          {title}
        </h2>
        {description ? (
          <p className="mt-1 max-w-2xl text-sm leading-5 text-muted">
            {description}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

const toneStyles = {
  blue: {
    icon: "bg-primary/12 text-primary",
    strip: "from-primary via-cyan to-transparent",
    glow: "bg-primary/10",
  },
  cyan: {
    icon: "bg-cyan/10 text-cyan",
    strip: "from-cyan via-primary to-transparent",
    glow: "bg-cyan/8",
  },
  teal: {
    icon: "bg-teal/10 text-teal",
    strip: "from-teal via-cyan to-transparent",
    glow: "bg-teal/8",
  },
  neutral: {
    icon: "bg-white/[0.055] text-muted-strong",
    strip: "from-muted via-border-strong to-transparent",
    glow: "bg-white/[0.035]",
  },
} as const;

export function MetricCard({
  helper,
  icon,
  label,
  primary = false,
  tone = "neutral",
  value,
}: {
  helper: string;
  icon: IconName;
  label: string;
  primary?: boolean;
  tone?: keyof typeof toneStyles;
  value: string;
}) {
  const style = toneStyles[tone];

  return (
    <article
      className={`dashboard-card dashboard-card-interactive group relative min-h-36 overflow-hidden p-4 sm:p-5 ${
        primary ? "sm:min-h-40" : ""
      }`}
    >
      <div
        className={`pointer-events-none absolute -top-12 -right-12 size-32 rounded-full blur-3xl transition group-hover:opacity-100 ${style.glow}`}
      />
      <div
        className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r ${style.strip}`}
      />
      <div className="relative flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-muted-strong">{label}</p>
          <p
            className={`metric-value mt-3 font-mono font-semibold text-white ${
              primary ? "text-[2rem] sm:text-[2.25rem]" : "text-[1.75rem]"
            }`}
          >
            {value}
          </p>
        </div>
        <span
          className={`grid size-9 shrink-0 place-items-center rounded-xl ${style.icon}`}
        >
          <Icon className="size-[18px]" name={icon} />
        </span>
      </div>
      <p className="relative mt-3 text-[11px] leading-4 text-muted">{helper}</p>
    </article>
  );
}

export function StatusBadge({
  label,
  tone,
}: {
  label: string;
  tone: "success" | "warning" | "danger" | "neutral" | "info";
}) {
  const styles = {
    success: "border-success/20 bg-success/10 text-success",
    warning: "border-warning/20 bg-warning/10 text-warning",
    danger: "border-danger/20 bg-danger/10 text-danger",
    neutral: "border-border bg-white/[0.04] text-muted-strong",
    info: "border-primary/20 bg-primary/10 text-cyan",
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold tracking-wide uppercase ${styles[tone]}`}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}

export function EmptyState({
  action,
  description,
  icon = "chart",
  title,
}: {
  action?: React.ReactNode;
  description: string;
  icon?: IconName;
  title: string;
}) {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center px-6 py-10 text-center">
      <span className="grid size-11 place-items-center rounded-2xl border border-cyan/10 bg-primary/[0.08] text-cyan">
        <Icon className="size-5" name={icon} />
      </span>
      <h3 className="mt-4 text-sm font-semibold text-white">{title}</h3>
      <p className="mt-1.5 max-w-sm text-xs leading-5 text-muted">
        {description}
      </p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

const rangeOptions: { key: DashboardRange; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "month-to-date", label: "Month to date" },
  { key: "previous-month", label: "Previous month" },
  { key: "custom", label: "Custom" },
];

export function FilterBar({
  period,
  role,
}: {
  period: DashboardPeriod;
  role: Role;
}) {
  const scopeLabel =
    role === "admin"
      ? "Company-wide"
      : role === "manager"
        ? "Assigned teams"
        : "Personal view";

  return (
    <section
      aria-label="Dashboard filters"
      className="dashboard-card surface-grid overflow-hidden p-3.5 sm:p-4"
    >
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-cyan">
            <Icon className="size-[18px]" name="calendar" />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold tracking-[0.14em] text-muted uppercase">
              Reporting window
            </p>
            <p className="truncate text-sm font-semibold text-white">
              {period.label}
            </p>
          </div>
          <span className="ml-1 hidden rounded-full border border-border bg-white/[0.035] px-2.5 py-1 text-[10px] font-medium text-muted-strong sm:inline-flex">
            {scopeLabel}
          </span>
        </div>
        <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 xl:pb-0">
          {rangeOptions.map((option) => {
            const active = period.key === option.key;
            const href =
              option.key === "custom"
                ? `/dashboard?range=custom&from=${period.start}&to=${period.end}`
                : `/dashboard?range=${option.key}`;
            return (
              <Link
                aria-current={active ? "page" : undefined}
                className={`shrink-0 rounded-lg px-3 py-2 text-xs font-semibold transition ${
                  active
                    ? "bg-gradient-to-r from-primary to-primary-strong text-white shadow-[0_8px_20px_rgba(22,139,255,.22)]"
                    : "text-muted-strong hover:bg-white/[0.05] hover:text-white"
                }`}
                href={href}
                key={option.key}
              >
                {option.label}
              </Link>
            );
          })}
        </div>
      </div>
      {period.key === "custom" ? (
        <form
          action="/dashboard"
          className="mt-3 flex flex-wrap items-end gap-2 border-t border-border pt-3"
          method="get"
        >
          <input name="range" type="hidden" value="custom" />
          <label className="text-[10px] font-semibold tracking-wide text-muted uppercase">
            From
            <input
              className="mt-1 block rounded-lg border border-border bg-background/70 px-3 py-2 text-xs text-white transition focus:border-cyan"
              defaultValue={period.start}
              name="from"
              required
              type="date"
            />
          </label>
          <label className="text-[10px] font-semibold tracking-wide text-muted uppercase">
            To
            <input
              className="mt-1 block rounded-lg border border-border bg-background/70 px-3 py-2 text-xs text-white transition focus:border-cyan"
              defaultValue={period.end}
              name="to"
              required
              type="date"
            />
          </label>
          <button
            className="rounded-lg bg-white/[0.07] px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-white/[0.11]"
            type="submit"
          >
            Apply range
          </button>
        </form>
      ) : null}
    </section>
  );
}
