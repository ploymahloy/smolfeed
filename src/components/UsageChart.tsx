import { formatMinutes, type ChartDay } from "@/lib/report";
import { sourceColors } from "@/lib/palette";

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
  const legend = new Map<string, { label: string; minutes: number }>();
  for (const day of days) {
    for (const segment of day.segments) {
      const entry = legend.get(segment.key);
      if (entry) {
        entry.minutes += segment.minutes;
        entry.label = segment.label;
      } else {
        legend.set(segment.key, { label: segment.label, minutes: segment.minutes });
      }
    }
  }
  const colors = sourceColors(legend.keys());
  const hatchId = (key: string) => `hatch-${[...colors.keys()].indexOf(key)}`;
  const fillFor = (key: string) => {
    const entry = colors.get(key);
    if (!entry) return "#6d655c";
    return entry.hatched ? `url(#${hatchId(key)})` : entry.color;
  };

  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Screen time for the last 7 days">
        <defs>
          {[...colors.entries()]
            .filter(([, entry]) => entry.hatched)
            .map(([key, entry]) => (
              <pattern
                key={key}
                id={hatchId(key)}
                width="6"
                height="6"
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(45)"
              >
                <rect width="6" height="6" fill={entry.color} />
                <rect width="2.5" height="6" fill="#fffdf8" fillOpacity="0.55" />
              </pattern>
            ))}
        </defs>
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
                    fill={fillFor(segment.key)}
                    stroke="#fffdf8"
                    strokeWidth={1.5}
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
              <span
                aria-hidden="true"
                style={
                  colors.get(key)?.hatched
                    ? {
                        background: `repeating-linear-gradient(45deg, ${colors.get(key)?.color} 0 3px, #fffdf8 3px 5px)`,
                      }
                    : { background: colors.get(key)?.color }
                }
              />
              {item.label} · {formatMinutes(item.minutes)} min
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
