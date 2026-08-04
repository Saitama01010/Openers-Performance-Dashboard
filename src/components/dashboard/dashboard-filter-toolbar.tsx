"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useId, useState, useTransition } from "react";

export type DashboardFilterOption = {
  label: string;
  value: string;
};

export type DashboardFilterDefinition = {
  kind?: "select" | "combobox";
  label: string;
  name: string;
  options: DashboardFilterOption[];
  value?: string;
};

function SearchableFilter({
  disabled,
  filter,
  onChange,
}: {
  disabled: boolean;
  filter: DashboardFilterDefinition;
  onChange: (value: string) => void;
}) {
  const listId = useId();
  const selected =
    filter.options.find((option) => option.value === (filter.value ?? "")) ??
    filter.options[0];
  const [text, setText] = useState(selected?.label ?? "");

  return (
    <label className="dashboard-filter-toolbar__control">
      <span>{filter.label}</span>
      <input
        aria-autocomplete="list"
        aria-controls={listId}
        aria-expanded={false}
        className="ui-input"
        disabled={disabled}
        list={listId}
        onBlur={() => {
          const match = filter.options.find(
            (option) => option.label.toLocaleLowerCase() === text.trim().toLocaleLowerCase(),
          );
          if (!match) setText(selected?.label ?? "");
        }}
        onChange={(event) => {
          const nextText = event.target.value;
          setText(nextText);
          const match = filter.options.find(
            (option) =>
              option.label.toLocaleLowerCase() ===
              nextText.trim().toLocaleLowerCase(),
          );
          if (match) onChange(match.value);
          if (!nextText) onChange("");
        }}
        role="combobox"
        type="search"
        value={text}
      />
      <datalist id={listId}>
        {filter.options.map((option) => (
          <option key={`${option.value}:${option.label}`} value={option.label} />
        ))}
      </datalist>
    </label>
  );
}

export function DashboardFilterToolbar({
  ariaLabel = "Dashboard filters",
  filters,
}: {
  ariaLabel?: string;
  filters: DashboardFilterDefinition[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function updateFilter(name: string, value: string) {
    const next = new URLSearchParams(searchParams.toString());
    if (value) next.set(name, value);
    else next.delete(name);
    next.delete("page");
    startTransition(() => {
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    });
  }

  return (
    <div
      aria-busy={isPending || undefined}
      aria-label={ariaLabel}
      className="dashboard-filter-toolbar"
      role="group"
    >
      {filters.map((filter) =>
        filter.kind === "combobox" ? (
          <SearchableFilter
            disabled={isPending}
            filter={filter}
            key={`${filter.name}:${filter.value ?? ""}`}
            onChange={(value) => updateFilter(filter.name, value)}
          />
        ) : (
          <label className="dashboard-filter-toolbar__control" key={filter.name}>
            <span>{filter.label}</span>
            <select
              className="ui-select"
              disabled={isPending}
              onChange={(event) => updateFilter(filter.name, event.target.value)}
              value={filter.value ?? ""}
            >
              {filter.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ),
      )}
      <span
        aria-live="polite"
        className="dashboard-filter-toolbar__pending"
        role="status"
      >
        {isPending ? "Updating…" : ""}
      </span>
    </div>
  );
}
