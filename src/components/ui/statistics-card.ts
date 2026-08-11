import type { CSSProperties } from "react";

export const METRIC_CARD_TONES = {
  blue: "#1767f2",
  cyan: "#0891b2",
  green: "#16a66a",
  orange: "#f28705",
  pink: "#e54879",
  purple: "#7c3aed",
  slate: "#334155",
} as const;

type MetricCardProperties = CSSProperties & {
  "--metric-card-background": string;
  "--metric-card-foreground": "#000000" | "#ffffff";
};

function parseHex(color: string) {
  const value = color.trim().replace(/^#/, "");
  const normalized = value.length === 3
    ? value.split("").map((character) => `${character}${character}`).join("")
    : value;
  if (!/^[\da-f]{6}$/i.test(normalized)) return null;
  return [0, 2, 4].map((offset) => Number.parseInt(normalized.slice(offset, offset + 2), 16));
}

function linearChannel(channel: number) {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

export function metricCardLuminance(color: string) {
  const channels = parseHex(color);
  if (!channels) return 0;
  const [red = 0, green = 0, blue = 0] = channels.map(linearChannel);
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

export function metricCardContrastRatio(first: string, second: string) {
  const lighter = Math.max(metricCardLuminance(first), metricCardLuminance(second));
  const darker = Math.min(metricCardLuminance(first), metricCardLuminance(second));
  return (lighter + 0.05) / (darker + 0.05);
}

export function metricCardForeground(background: string): "#000000" | "#ffffff" {
  const whiteContrast = metricCardContrastRatio(background, "#ffffff");
  const blackContrast = metricCardContrastRatio(background, "#000000");
  return whiteContrast >= blackContrast ? "#ffffff" : "#000000";
}

export function metricCardStyle(background: string): MetricCardProperties {
  return {
    "--metric-card-background": background,
    "--metric-card-foreground": metricCardForeground(background),
  };
}
