import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  formatCompactDuration,
  HourlyActivityChart,
} from "@/components/dashboard/performance-visuals";

describe("performance visuals", () => {
  it("formats compact durations without negative values", () => {
    expect(formatCompactDuration(10_860)).toBe("3h 1m");
    expect(formatCompactDuration(-90)).toBe("0h 0m");
  });

  it("keeps an all-zero hourly series visually and narratively truthful", () => {
    const markup = renderToStaticMarkup(
      <HourlyActivityChart
        rows={[
          {
            calls: 0,
            hour: 8,
            loggedInSeconds: 0,
            rowCount: 1,
            talkSeconds: 0,
          },
        ]}
      />,
    );

    expect(markup).toContain("highest hourly total is 0 calls");
    expect(markup).toContain("height:0%");
    expect(markup).not.toContain("height:4%");
  });
});
