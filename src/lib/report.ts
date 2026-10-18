export type ChartSegment = {
  key: string;
  label: string;
  provider: string;
  minutes: number;
};

export type ChartDay = {
  date: string;
  label: string;
  segments: ChartSegment[];
};

export type AnalyticsReport = {
  days: ChartDay[];
  todayMinutes: number;
  weekMinutes: number;
};

export function formatMinutes(value: number): string {
  if (value <= 0) return "0";
  if (value < 10) {
    const rounded = Math.round(value * 10) / 10;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  }
  return String(Math.round(value));
}
