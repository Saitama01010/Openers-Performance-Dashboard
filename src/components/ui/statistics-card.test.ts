import { describe, expect, it } from "vitest";

import {
  METRIC_CARD_TONES,
  metricCardContrastRatio,
  metricCardForeground,
  metricCardStyle,
} from "@/components/ui/statistics-card";

describe("statistics card contrast", () => {
  it.each(Object.entries(METRIC_CARD_TONES))(
    "chooses a readable foreground for %s",
    (_tone, background) => {
      const foreground = metricCardForeground(background);
      expect(["#000000", "#ffffff"]).toContain(foreground);
      expect(metricCardContrastRatio(background, foreground)).toBeGreaterThanOrEqual(4.5);
      expect(metricCardStyle(background)).toEqual({
        "--metric-card-background": background,
        "--metric-card-foreground": foreground,
      });
    },
  );

  it("uses black on bright orange and white on saturated blue", () => {
    expect(metricCardForeground(METRIC_CARD_TONES.orange)).toBe("#000000");
    expect(metricCardForeground(METRIC_CARD_TONES.blue)).toBe("#ffffff");
  });
});
