import Link from "next/link";

import { DashboardIcon } from "@/components/dashboard/dashboard-icons";
import type {
  OverviewDateFilterKey,
  OverviewDateRange,
} from "@/dashboard/date-range";

type PreservedDateFilterParams = Record<string, string | undefined>;

const filterOptions: {
  key: Exclude<OverviewDateFilterKey, "custom">;
  label: string;
}[] = [
  { key: "today", label: "Today" },
  { key: "this-month", label: "This Month" },
  { key: "last-month", label: "Last Month" },
];

function dateFilterHref(
  pathname: string,
  range: Exclude<OverviewDateFilterKey, "custom">,
  preservedParams: PreservedDateFilterParams,
) {
  const params = new URLSearchParams({ range });
  for (const [name, value] of Object.entries(preservedParams)) {
    if (value) params.set(name, value);
  }
  return `${pathname}?${params.toString()}`;
}

export function DashboardDateFilter({
  ariaLabel,
  pathname,
  preservedParams = {},
  range,
}: {
  ariaLabel: string;
  pathname: string;
  preservedParams?: PreservedDateFilterParams;
  range: OverviewDateRange;
}) {
  return (
    <div aria-label={ariaLabel} className="overview-date-filter">
      <span className="overview-date-filter__icon" aria-hidden="true">
        <DashboardIcon name="calendar" />
      </span>
      <div className="overview-date-filter__options">
        {filterOptions.map((option) => (
          <Link
            aria-current={range.key === option.key ? "page" : undefined}
            className="overview-date-filter__option"
            href={dateFilterHref(pathname, option.key, preservedParams)}
            key={option.key}
          >
            {option.label}
          </Link>
        ))}
        <details
          className="overview-date-filter__custom"
          data-selected={range.key === "custom" ? "" : undefined}
        >
          <summary className="overview-date-filter__option">
            Custom Date
          </summary>
          <form
            aria-label={`Custom ${ariaLabel.toLowerCase()} range`}
            className="overview-date-filter__popover"
            method="get"
          >
            <input defaultValue="custom" name="range" type="hidden" />
            {Object.entries(preservedParams).map(([name, value]) =>
              value ? (
              <input
                  defaultValue={value}
                  key={name}
                  name={name}
                type="hidden"
              />
              ) : null,
            )}
            <label>
              From
              <input
                defaultValue={range.from}
                name="from"
                required
                type="date"
              />
            </label>
            <label>
              To
              <input
                defaultValue={range.to}
                name="to"
                required
                type="date"
              />
            </label>
            <button className="ui-button ui-button--primary" type="submit">
              Apply dates
            </button>
          </form>
        </details>
      </div>
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
