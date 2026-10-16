import { formatMinutes, type ChartDay } from "@/lib/report";
import { providerColor } from "@/lib/palette";

export function UsageChart({ days }: { days: ChartDay[] }) {
  const width = 640;
  const height = 240;
  const pad = { top: 16, right: 8, bottom: 32, left: 36 };
  const innerWidth = width - pad.left - pad.right;
  const innerHeight = height - pad.top - pad.bottom;
  const peak = Math.max(
    1,
    ...days.map((day) => day.segments.reduce((sum, segment) => sum + segment.minutes, 0)),
  );
  const slot = innerWidth / Math.max(days.length, 1);
  const barWidth = slot * 0.58;
  const legend = new Map<string, { label: string; color: string }>();
  for (const day of days) {
    for (const segment of day.segments) {
      if (!legend.has(segment.key)) {
        legend.set(segment.key, {
          label: segment.label,
          color: providerColor(segment.provider),
        });
      }
    }
  }

  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Screen time for the last 7 days">
        <line
          x1={pad.left}
          y1={pad.top + innerHeight}
          x2={width - pad.right}
          y2={pad.top + innerHeight}
          className="axis"
        />
        <text x={4} y={pad.top + 8} className="axis-label">
          {formatMinutes(peak)}m
        </text>
        {days.map((day, index) => {
          const x = pad.left + index * slot + (slot - barWidth) / 2;
          let cursor = pad.top + innerHeight;
          const total = day.segments.reduce((sum, segment) => sum + segment.minutes, 0);
          return (
            <g key={day.date}>
              {day.segments.map((segment) => {
                const barHeight = (segment.minutes / peak) * innerHeight;
                cursor -= barHeight;
                return (
                  <rect
                    key={segment.key}
                    x={x}
                    y={cursor}
                    width={barWidth}
                    height={Math.max(barHeight, 0)}
                    rx={3}
                    fill={providerColor(segment.provider)}
                  >
                    <title>{`${segment.label}: ${formatMinutes(segment.minutes)} min`}</title>
                  </rect>
                );
              })}
              <text x={x + barWidth / 2} y={height - 10} textAnchor="middle" className="axis-label">
                {day.label}
              </text>
              {total <= 0 ? (
                <text x={x + barWidth / 2} y={pad.top + innerHeight - 8} textAnchor="middle" className="axis-label">
                  0
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      {legend.size > 0 ? (
        <ul className="legend">
          {[...legend.entries()].map(([key, item]) => (
            <li key={key}>
              <span style={{ background: item.color }} />
              {item.label}
            </li>
          ))}
        </ul>
      ) : null}
      <table className="sr-only">
        <caption>Minutes by source for the last 7 days</caption>
        <thead>
          <tr>
            <th>Day</th>
            <th>Source</th>
            <th>Minutes</th>
          </tr>
        </thead>
        <tbody>
          {days.flatMap((day) =>
            day.segments.length === 0
              ? [
                  <tr key={`${day.date}-empty`}>
                    <td>{day.label}</td>
                    <td>None</td>
                    <td>0</td>
                  </tr>,
                ]
              : day.segments.map((segment) => (
                  <tr key={`${day.date}-${segment.key}`}>
                    <td>{day.label}</td>
                    <td>{segment.label}</td>
                    <td>{formatMinutes(segment.minutes)}</td>
                  </tr>
                )),
          )}
        </tbody>
      </table>
    </figure>
  );
}
