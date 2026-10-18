"use client";

import { useEffect, useState } from "react";
import { formatMinutes, type AnalyticsReport } from "@/lib/report";
import { UsageChart } from "@/components/UsageChart";

export function AnalyticsScreen() {
  const [report, setReport] = useState<AnalyticsReport | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/analytics");
        if (!response.ok) throw new Error("Analytics could not be loaded");
        setReport((await response.json()) as AnalyticsReport);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Analytics could not be loaded");
      }
    })();
  }, []);

  return (
    <div className="column">
      <header className="page-head">
        <div>
          <h1>Analytics</h1>
          <p>Smolfeed screen time for the last 7 days.</p>
        </div>
      </header>
      {error ? <p className="banner error">{error}</p> : null}
      {!report && !error ? <p className="status">Loading analytics…</p> : null}
      {report ? (
        <>
          <div className="stats">
            <article>
              <p>Today</p>
              <strong>{formatMinutes(report.todayMinutes)} min</strong>
            </article>
            <article>
              <p>This week</p>
              <strong>{formatMinutes(report.weekMinutes)} min</strong>
            </article>
          </div>
          <UsageChart days={report.days} />
        </>
      ) : null}
    </div>
  );
}
