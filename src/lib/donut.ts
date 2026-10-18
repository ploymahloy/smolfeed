import type { ChartDay } from "./report";

export type DonutRange = "today" | "week";

export type DonutItem = {
  key: string;
  label: string;
  minutes: number;
};

export type DonutSlice = DonutItem & {
  percent: number;
  path: string;
  labelX: number;
  labelY: number;
};

export type DonutGeometry = {
  cx: number;
  cy: number;
  radius: number;
  thickness: number;
  labelRadius: number;
};

// Sums minutes per source for the range, largest first. "today" is the last
// day of the report; "week" is every day in it.
export const aggregate = (days: ChartDay[], range: DonutRange): DonutItem[] => {
  const scope = range === "today" ? days.slice(-1) : days;
  const totals = new Map<string, DonutItem>();
  for (const day of scope) {
    for (const segment of day.segments) {
      if (segment.minutes <= 0) continue;
      const entry = totals.get(segment.key);
      if (entry) {
        entry.minutes += segment.minutes;
        entry.label = segment.label;
      } else {
        totals.set(segment.key, {
          key: segment.key,
          label: segment.label,
          minutes: segment.minutes,
        });
      }
    }
  }
  return [...totals.values()].sort((left, right) => right.minutes - left.minutes);
};

const point = (cx: number, cy: number, radius: number, angle: number) => ({
  x: cx + radius * Math.sin(angle),
  y: cy - radius * Math.cos(angle),
});

const round = (value: number) => Math.round(value * 100) / 100;

// One annular arc from angle `from` to `to` (radians, clockwise from 12 o'clock).
const arc = (g: DonutGeometry, from: number, to: number): string => {
  const inner = g.radius - g.thickness;
  const large = to - from > Math.PI ? 1 : 0;
  const outerStart = point(g.cx, g.cy, g.radius, from);
  const outerEnd = point(g.cx, g.cy, g.radius, to);
  const innerEnd = point(g.cx, g.cy, inner, to);
  const innerStart = point(g.cx, g.cy, inner, from);
  return [
    `M ${round(outerStart.x)} ${round(outerStart.y)}`,
    `A ${g.radius} ${g.radius} 0 ${large} 1 ${round(outerEnd.x)} ${round(outerEnd.y)}`,
    `L ${round(innerEnd.x)} ${round(innerEnd.y)}`,
    `A ${inner} ${inner} 0 ${large} 0 ${round(innerStart.x)} ${round(innerStart.y)}`,
    "Z",
  ].join(" ");
};

export const buildSlices = (items: DonutItem[], geometry: DonutGeometry): DonutSlice[] => {
  const total = items.reduce((sum, item) => sum + item.minutes, 0);
  if (total <= 0) return [];
  const full = Math.PI * 2;
  let cursor = 0;
  return items
    .filter((item) => item.minutes > 0)
    .map((item) => {
      const share = item.minutes / total;
      const from = cursor;
      const to = cursor + share * full;
      cursor = to;
      const mid = (from + to) / 2;
      const label = point(geometry.cx, geometry.cy, geometry.labelRadius, mid);
      // A lone source covers the whole ring, which a single arc cannot draw.
      const path =
        share >= 0.9999
          ? `${arc(geometry, 0, Math.PI)} ${arc(geometry, Math.PI, full)}`
          : arc(geometry, from, to);
      return {
        ...item,
        percent: share * 100,
        path,
        labelX: round(label.x),
        labelY: round(label.y),
      };
    });
};

// Whole numbers from 1% up; one decimal below that ("0.8%").
export const formatPercent = (percent: number): string => {
  if (percent <= 0) return "0%";
  if (percent >= 1) return `${Math.round(percent)}%`;
  return `${Math.round(percent * 10) / 10}%`;
};
