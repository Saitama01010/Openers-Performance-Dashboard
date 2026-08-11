import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import RootLoading from "@/app/loading";
import PerformanceLoading from "@/app/performance/loading";
import { DashboardPageSkeleton } from "@/components/dashboard/dashboard-primitives";
import { GhostPageLoader } from "@/components/ui/ghost-page-loader";

describe("GhostPageLoader", () => {
  it("renders the pixel ghost with an accessible loading status", () => {
    const markup = renderToStaticMarkup(<GhostPageLoader label="Loading reports" />);

    expect(markup).toContain('data-slot="ghost-page-loader"');
    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('aria-label="Loading reports"');
    expect(markup).toContain('data-part="top0"');
    expect(markup).toContain('data-part="an18"');
  });

  it("is shared by root, dashboard, and performance route loading boundaries", () => {
    expect(renderToStaticMarkup(<RootLoading />)).toContain('data-slot="ghost-page-loader"');
    expect(renderToStaticMarkup(<DashboardPageSkeleton />)).toContain('data-slot="ghost-page-loader"');
    expect(renderToStaticMarkup(<PerformanceLoading />)).toContain('data-slot="ghost-page-loader"');
  });
});
