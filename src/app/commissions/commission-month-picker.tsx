"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

export function commissionMonthHref(pathname: string, search: string, value: string) {
  const params = new URLSearchParams(search);
  params.set("commissionMonth", value);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function CommissionMonthPicker({ value }: { value: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  return (
    <label className="dashboard-filter-toolbar__control">
      <span>Commission month</span>
      <input
        aria-label="Commission month"
        className="ui-input"
        disabled={pending}
        onChange={(event) => {
          if (!event.target.value) return;
          startTransition(() => {
            router.replace(
              commissionMonthHref(pathname, searchParams.toString(), event.target.value),
              { scroll: false },
            );
          });
        }}
        type="month"
        value={value}
      />
    </label>
  );
}
