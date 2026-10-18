"use client";

import { useId, useState } from "react";
import { aggregate, buildSlices, formatPercent, type DonutRange } from "@/lib/donut";
import { sourceColors } from "@/lib/palette";
import { formatMinutes, type ChartDay } from "@/lib/report";

const GEOMETRY = { cx: 160, cy: 160, radius: 100, thickness: 28, labelRadius: 117 };
const SIZE = 320;
const LEGEND_PREVIEW = 6;
// Labels on thinner slices would collide with their neighbours.
const MIN_LABEL_PERCENT = 2;
const SEPARATOR = "#fffdf8";

const RANGES: { id: DonutRange; label: string; summary: string }[] = [
  { id: "today", label: "Today", summary: "today" },
  { id: "week", label: "This week", summary: "the last 7 days" },
];

export const UsageChart = ({ days }: { days: ChartDay[] }) => {
  const uid = useId();
  const [range, setRange] = useState<DonutRange>("week");
  const [expanded, setExpanded] = useState(false);

  // Colors come from the whole week so a source keeps its color across ranges.
  const colors = sourceColors(aggregate(days, "week").map((item) => item.key));
  const items = aggregate(days, range);
  const slices = buildSlices(items, GEOMETRY);
  const total = items.reduce((sum, item) => sum + item.minutes, 0);
  const summary = RANGES.find((entry) => entry.id === range)?.summary ?? "";

  const hatchId = (key: string) => `${uid}-hatch-${[...colors.keys()].indexOf(key)}`;
  const fillFor = (key: string) => {
    const entry = colors.get(key);
    if (!entry) return "#6d655c";
    return entry.hatched ? `url(#${hatchId(key)})` : entry.color;
  };
  const swatchFor = (key: string) => {
    const entry = colors.get(key);
    if (!entry) return { background: "#6d655c" };
    return entry.hatched
      ? {
          background: `repeating-linear-gradient(45deg, ${entry.color} 0 3px, ${SEPARATOR} 3px 5px)`,
        }
      : { background: entry.color };
  };

  const legendId = `${uid}-legend`;
  const canCollapse = items.length > LEGEND_PREVIEW;
  const shown = canCollapse && !expanded ? items.slice(0, LEGEND_PREVIEW) : items;
  const percentOf = (minutes: number) => (total > 0 ? (minutes / total) * 100 : 0);

  return (
    <figure className="chart panel">
      <div className="chart-head">
        <h2>Screen time by source</h2>
        <div className="segmented" role="group" aria-label="Time range">
          {RANGES.map((entry) => (
            <button
              key={entry.id}
              type="button"
              aria-pressed={range === entry.id}
              onClick={() => {
                setRange(entry.id);
                setExpanded(false);
              }}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </div>

      <p className="sr-only" aria-live="polite">
        {`${formatMinutes(total)} minutes across ${items.length} ${items.length === 1 ? "source" : "sources"} for ${summary}`}
      </p>

      <svg
        className="donut"
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-label={`Screen time by source for ${summary}: ${formatMinutes(total)} minutes`}
      >
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
                <rect width="2.5" height="6" fill={SEPARATOR} fillOpacity="0.55" />
              </pattern>
            ))}
        </defs>
        {slices.length === 0 ? (
          <circle
            cx={GEOMETRY.cx}
            cy={GEOMETRY.cy}
            r={GEOMETRY.radius - GEOMETRY.thickness / 2}
            fill="none"
            stroke="var(--line)"
            strokeWidth={GEOMETRY.thickness}
          />
        ) : (
          slices.map((slice) => (
            <path
              key={slice.key}
              d={slice.path}
              fill={fillFor(slice.key)}
              stroke={SEPARATOR}
              strokeWidth={1.5}
              strokeLinejoin="round"
              fillRule="evenodd"
            >
              <title>{`${slice.label}: ${formatMinutes(slice.minutes)} min (${formatPercent(slice.percent)})`}</title>
            </path>
          ))
        )}
        {slices
          .filter((slice) => slice.percent >= MIN_LABEL_PERCENT)
          .map((slice) => (
            <text
              key={slice.key}
              x={slice.labelX}
              y={slice.labelY}
              textAnchor="middle"
              dominantBaseline="central"
              className="axis-label"
              aria-hidden="true"
            >
              {formatPercent(slice.percent)}
            </text>
          ))}
        <text
          x={GEOMETRY.cx}
          y={GEOMETRY.cy - 4}
          textAnchor="middle"
          className="donut-total"
          aria-hidden="true"
        >
          {formatMinutes(total)}
        </text>
        <text
          x={GEOMETRY.cx}
          y={GEOMETRY.cy + 22}
          textAnchor="middle"
          className="axis-label"
          aria-hidden="true"
        >
          minutes
        </text>
      </svg>

      {items.length > 0 ? (
        <>
          <ul className="legend" id={legendId}>
            {shown.map((item) => (
              <li key={item.key}>
                <span aria-hidden="true" style={swatchFor(item.key)} />
                <span className="legend-label">{item.label}</span>
                <span className="legend-value">{formatMinutes(item.minutes)} min</span>
              </li>
            ))}
          </ul>
          {canCollapse ? (
            <button
              type="button"
              className="link-button"
              aria-expanded={expanded}
              aria-controls={legendId}
              onClick={() => setExpanded((open) => !open)}
            >
              {expanded ? "View less" : `View more (${items.length - LEGEND_PREVIEW})`}
            </button>
          ) : null}
        </>
      ) : (
        <p className="status">No screen time recorded for {summary}.</p>
      )}

      <table className="sr-only">
        <caption>Minutes by source for {summary}</caption>
        <thead>
          <tr>
            <th>Source</th>
            <th>Minutes</th>
            <th>Share</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td>None</td>
              <td>0</td>
              <td>0%</td>
            </tr>
          ) : (
            items.map((item) => (
              <tr key={item.key}>
                <td>{item.label}</td>
                <td>{formatMinutes(item.minutes)}</td>
                <td>{formatPercent(percentOf(item.minutes))}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </figure>
  );
};
