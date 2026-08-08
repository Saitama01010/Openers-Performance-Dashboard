import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AreaTrend } from "@/components/ui/area-trend";

describe("AreaTrend", () => {
  it("renders the shared gradient area treatment with keyboard guidance", () => {
    const markup = renderToStaticMarkup(
      <AreaTrend
        ariaLabel="Transfers trend"
        color="#1f5eff"
        points={[
          { label: "Aug 7", value: 12 },
          { label: "Aug 8", value: 18 },
          { label: "Aug 9", value: 15 },
        ]}
      />,
    );

    expect(markup).toContain("linearGradient");
    expect(markup).toContain("stop-opacity=\"0.3\"");
    expect(markup).toContain("Use left and right arrow keys to inspect points");
    expect(markup).toContain("tabindex=\"0\"");
  });

  it("uses an honest empty state when fewer than two values are available", () => {
    const markup = renderToStaticMarkup(
      <AreaTrend
        ariaLabel="Unavailable trend"
        color="#1f5eff"
        emptyLabel="No dated history"
        points={[{ value: null }, { value: 2 }]}
      />,
    );

    expect(markup).toContain("No dated history");
    expect(markup).not.toContain("<svg");
  });

  it("can render as a non-interactive chart inside an existing disclosure control", () => {
    const markup = renderToStaticMarkup(
      <AreaTrend
        ariaLabel="Published imports trend"
        color="#0a8f64"
        interactive={false}
        points={[{ value: 4 }, { value: 7 }]}
      />,
    );

    expect(markup).toContain('aria-label="Published imports trend"');
    expect(markup).not.toContain("tabindex");
    expect(markup).not.toContain("Use left and right arrow keys");
  });
});
