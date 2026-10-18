import { usageSince } from "@/lib/db";
import type { AnalyticsReport, ChartDay, ChartSegment } from "@/lib/report";

export type { AnalyticsReport, ChartDay, ChartSegment };

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function dayStamp(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function windowDays(): { startMs: number; days: { date: string; label: string }[] } {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - 6);
  const days: { date: string; label: string }[] = [];
  const cursor = new Date(start);
  for (let index = 0; index < 7; index += 1) {
    days.push({
      date: dayStamp(cursor),
      label: new Intl.DateTimeFormat("en", { weekday: "short" }).format(cursor),
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return { startMs: start.getTime(), days };
}

export function buildAnalytics(): AnalyticsReport {
  const { startMs, days } = windowDays();
  const rows = usageSince(startMs);
  const byDay = new Map<string, ChartSegment[]>();
  for (const day of days) byDay.set(day.date, []);
  for (const row of rows) {
    const segments = byDay.get(row.day);
    if (!segments) continue;
    segments.push({
      key: row.sourceKey,
      label: row.sourceLabel,
      provider: row.provider,
      minutes: row.seconds / 60,
    });
  }
  const chartDays: ChartDay[] = days.map((day) => ({
    date: day.date,
    label: day.label,
    segments: byDay.get(day.date) ?? [],
  }));
  const weekMinutes = rows.reduce((sum, row) => sum + row.seconds / 60, 0);
  const today = chartDays[chartDays.length - 1];
  const todayMinutes = (today?.segments ?? []).reduce(
    (sum, segment) => sum + segment.minutes,
    0,
  );
  return {
    days: chartDays,
    todayMinutes,
    weekMinutes,
  };
}
