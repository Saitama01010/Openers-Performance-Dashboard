import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DonutChart } from "@/components/ui/donut-chart";

describe("DonutChart", () => {
  it("renders accessible segments and ignores non-positive values", () => {
    const markup = renderToStaticMarkup(
      <DonutChart
        ariaLabel="Outcome distribution"
        data={[
          { id: "ready", label: "Ready", value: 3, color: "#1767f2", accessibleLabel: "Ready: 3" },
          { id: "empty", label: "Empty", value: 0, color: "#8b98aa" },
          { id: "invalid", label: "Invalid", value: Number.NaN, color: "#b42318" },
        ]}
        interactiveSegments
      />,
    );

    expect(markup).toContain('aria-label="Outcome distribution"');
    expect(markup).toContain('aria-label="Ready: 3"');
    expect(markup).toContain('role="button"');
    expect(markup).toContain('stroke-dasharray="0 ');
    expect(markup).toContain("opacity:0");
    expect(markup).not.toContain("Empty</title>");
    expect(markup).not.toContain("Invalid</title>");
  });

  it("keeps the track and center content visible when the total is zero", () => {
    const markup = renderToStaticMarkup(
      <DonutChart
        ariaLabel="No data"
        centerContent={<strong>N/A</strong>}
        data={[]}
      />,
    );

    expect(markup).toContain('role="img"');
    expect(markup).toContain("N/A");
    expect(markup.match(/<circle/g)).toHaveLength(1);
  });
});
