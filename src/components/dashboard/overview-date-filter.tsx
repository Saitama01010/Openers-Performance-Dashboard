"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import { DashboardIcon } from "@/components/dashboard/dashboard-icons";
import type {
  OverviewDateFilterKey,
  OverviewDateRange,
} from "@/dashboard/date-range";

type PreservedDateFilterParams = Record<string, string | undefined>;

const filterOptions: Array<{
  key: Exclude<OverviewDateFilterKey, "custom">;
  label: string;
}> = [
  { key: "today", label: "Today" },
  { key: "this-month", label: "This Month" },
  { key: "last-month", label: "Last Month" },
  { key: "all-time", label: "All Time" },
];

export function DashboardDateFilter({
  ariaLabel,
  pathname: requestedPathname,
  preservedParams = {},
  range,
}: {
  ariaLabel: string;
  pathname?: string;
  preservedParams?: PreservedDateFilterParams;
  range: OverviewDateRange;
}) {
  const currentPathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [from, setFrom] = useState(range.key === "custom" ? range.from ?? "" : "");
  const [to, setTo] = useState(range.key === "custom" ? range.to ?? "" : "");
  const [error, setError] = useState("");
  const pathname = requestedPathname ?? currentPathname;

  function navigate(next: URLSearchParams) {
    for (const [name, value] of Object.entries(preservedParams)) {
      if (value) next.set(name, value);
    }
    next.delete("page");
    startTransition(() => {
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    });
  }

  function selectPreset(key: Exclude<OverviewDateFilterKey, "custom">) {
    const next = new URLSearchParams(searchParams.toString());
    next.set("range", key);
    next.delete("from");
    next.delete("to");
    setError("");
    navigate(next);
  }

  function selectCustom(nextFrom: string, nextTo: string) {
    if (!nextFrom || !nextTo) {
      setError("");
      return;
    }
    if (nextTo < nextFrom) {
      setError("The end date cannot be before the start date.");
      return;
    }
    const next = new URLSearchParams(searchParams.toString());
    next.set("range", "custom");
    next.set("from", nextFrom);
    next.set("to", nextTo);
    setError("");
    navigate(next);
  }

  return (
    <div
      aria-busy={isPending || undefined}
      aria-label={ariaLabel}
      className="overview-date-filter"
    >
      <span className="overview-date-filter__icon" aria-hidden="true">
        <DashboardIcon name="calendar" />
      </span>
      <div className="overview-date-filter__options">
        {filterOptions.map((option) => (
          <button
            aria-current={range.key === option.key ? "page" : undefined}
            className="overview-date-filter__option"
            disabled={isPending}
            key={option.key}
            onClick={() => selectPreset(option.key)}
            type="button"
          >
            {option.label}
          </button>
        ))}
        <details
          className="overview-date-filter__custom"
          data-selected={range.key === "custom" ? "" : undefined}
        >
          <summary className="overview-date-filter__option">Custom Date</summary>
          <div
            aria-label={`Custom ${ariaLabel.toLowerCase()} range`}
            className="overview-date-filter__popover"
          >
            <label>
              From
              <input
                aria-invalid={Boolean(error) || undefined}
                onChange={(event) => {
                  const value = event.target.value;
                  setFrom(value);
                  selectCustom(value, to);
                }}
                type="date"
                value={from}
              />
            </label>
            <label>
              To
              <input
                aria-invalid={Boolean(error) || undefined}
                onChange={(event) => {
                  const value = event.target.value;
                  setTo(value);
                  selectCustom(from, value);
                }}
                type="date"
                value={to}
              />
            </label>
            {error ? (
              <p className="overview-date-filter__error" role="alert">
                {error}
              </p>
            ) : (
              <p className="overview-date-filter__hint">
                Dates update automatically when both values are valid.
              </p>
            )}
          </div>
        </details>
      </div>
      {isPending ? (
        <span className="overview-date-filter__pending" role="status">
          Updating…
        </span>
      ) : null}
    </div>
  );
}

export function OverviewDateFilter({
  range,
  showAgentsWithNoData,
}: {
  range: OverviewDateRange;
  showAgentsWithNoData: boolean;
}) {
  return (
    <DashboardDateFilter
      ariaLabel="Overview date filter"
      pathname="/dashboard"
      preservedParams={{
        showNoData: showAgentsWithNoData ? "1" : undefined,
      }}
      range={range}
    />
  );
}
