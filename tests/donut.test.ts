import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { aggregate, buildSlices, formatPercent } from "../src/lib/donut";

const geometry = { cx: 160, cy: 160, radius: 100, thickness: 28, labelRadius: 118 };

const days = [
  {
    date: "2026-10-17",
    label: "Sat",
    segments: [
      { key: "feed:a", label: "Alpha", provider: "rss", minutes: 10 },
      { key: "feed:b", label: "Beta", provider: "rss", minutes: 5 },
    ],
  },
  {
    date: "2026-10-18",
    label: "Sun",
    segments: [
      { key: "feed:b", label: "Beta", provider: "rss", minutes: 20 },
      { key: "feed:c", label: "Gamma", provider: "rss", minutes: 5 },
    ],
  },
];

describe("aggregate", () => {
  it("sums the week per source, largest first", () => {
    const items = aggregate(days, "week");
    assert.deepEqual(
      items.map((item) => [item.key, item.minutes]),
      [
        ["feed:b", 25],
        ["feed:a", 10],
        ["feed:c", 5],
      ],
    );
  });

  it("uses only the last day for today", () => {
    const items = aggregate(days, "today");
    assert.deepEqual(
      items.map((item) => item.key),
      ["feed:b", "feed:c"],
    );
  });

  it("returns nothing when there is no usage", () => {
    assert.deepEqual(aggregate([], "week"), []);
    assert.deepEqual(aggregate([{ date: "d", label: "x", segments: [] }], "today"), []);
  });
});

describe("buildSlices", () => {
  it("gives percentages that sum to 100, in the order given", () => {
    const slices = buildSlices(aggregate(days, "week"), geometry);
    const sum = slices.reduce((total, slice) => total + slice.percent, 0);
    assert.ok(Math.abs(sum - 100) < 1e-9);
    assert.deepEqual(
      slices.map((slice) => slice.key),
      ["feed:b", "feed:a", "feed:c"],
    );
    assert.ok(slices[0] && slices[0].percent > (slices[1]?.percent ?? 0));
  });

  it("starts at 12 o'clock and puts the first label on its side of the ring", () => {
    const slices = buildSlices(
      [
        { key: "a", label: "A", minutes: 50 },
        { key: "b", label: "B", minutes: 50 },
      ],
      geometry,
    );
    // First half runs clockwise from the top, so its label is on the right.
    assert.ok((slices[0]?.labelX ?? 0) > geometry.cx);
    assert.ok((slices[1]?.labelX ?? 0) < geometry.cx);
    assert.ok(slices[0]?.path.startsWith("M 160 60"));
  });

  it("draws a lone source as a full ring", () => {
    const slices = buildSlices([{ key: "a", label: "A", minutes: 12 }], geometry);
    assert.equal(slices.length, 1);
    assert.equal(slices[0]?.percent, 100);
    assert.equal((slices[0]?.path.match(/M /g) ?? []).length, 2);
  });

  it("returns no slices for empty input", () => {
    assert.deepEqual(buildSlices([], geometry), []);
    assert.deepEqual(buildSlices([{ key: "a", label: "A", minutes: 0 }], geometry), []);
  });
});

describe("formatPercent", () => {
  it("rounds to whole numbers from 1% up", () => {
    assert.equal(formatPercent(30.4), "30%");
    assert.equal(formatPercent(1), "1%");
    assert.equal(formatPercent(14.6), "15%");
  });

  it("keeps one decimal below 1%", () => {
    assert.equal(formatPercent(0.8), "0.8%");
    assert.equal(formatPercent(0.04), "0%");
  });
});
