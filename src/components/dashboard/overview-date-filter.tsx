import Link from "next/link";

import { DashboardIcon } from "@/components/dashboard/dashboard-icons";
import type {
  OverviewDateFilterKey,
  OverviewDateRange,
} from "@/dashboard/date-range";

const filterOptions: {
  key: Exclude<OverviewDateFilterKey, "custom">;
  label: string;
}[] = [
  { key: "today", label: "Today" },
  { key: "this-month", label: "This Month" },
  { key: "last-month", label: "Last Month" },
];

function dashboardHref(
  range: Exclude<OverviewDateFilterKey, "custom">,
  showAgentsWithNoData: boolean,
) {
  const params = new URLSearchParams({ range });
  if (showAgentsWithNoData) params.set("showNoData", "1");
  return `/dashboard?${params.toString()}`;
}

export function OverviewDateFilter({
  range,
  showAgentsWithNoData,
}: {
  range: OverviewDateRange;
  showAgentsWithNoData: boolean;
}) {
  return (
    <div aria-label="Overview date filter" className="overview-date-filter">
      <span className="overview-date-filter__icon" aria-hidden="true">
        <DashboardIcon name="calendar" />
      </span>
      <div className="overview-date-filter__options">
        {filterOptions.map((option) => (
          <Link
            aria-current={range.key === option.key ? "page" : undefined}
            className="overview-date-filter__option"
            href={dashboardHref(option.key, showAgentsWithNoData)}
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
            aria-label="Custom overview date range"
            className="overview-date-filter__popover"
            method="get"
          >
            <input defaultValue="custom" name="range" type="hidden" />
            {showAgentsWithNoData ? (
              <input
                defaultValue="1"
                name="showNoData"
                type="hidden"
              />
            ) : null}
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
