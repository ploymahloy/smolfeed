import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { suggestions } from "../src/lib/suggestions";

describe("suggestions", () => {
  it("suggests a starting limit when none are configured", () => {
    const notes = suggestions({
      week: [],
      sessionLimitMinutes: null,
      sourceLimitMinutes: {},
      sessionPeaksMinutes: [],
    });
    assert.deepEqual(notes.map((note) => note.id), ["no-limits"]);
  });

  it("flags a source that is more than 40 percent of the week", () => {
    const notes = suggestions({
      week: [
        { sourceKey: "account:ig", label: "Instagram", minutes: 50 },
        { sourceKey: "category:news", label: "News", minutes: 10 },
      ],
      sessionLimitMinutes: 30,
      sourceLimitMinutes: { "account:ig": 15 },
      sessionPeaksMinutes: [10],
    });
    const heavy = notes.find((note) => note.id === "heavy-source");
    assert.ok(heavy);
    assert.match(heavy.detail, /Instagram accounts for 83%/);
    assert.equal(notes.some((note) => note.id === "no-limits"), false);
    assert.equal(notes.some((note) => note.id === "near-cap"), false);
  });

  it("stays quiet when the heaviest source is at most 40 percent", () => {
    const notes = suggestions({
      week: [
        { sourceKey: "a", label: "News", minutes: 40 },
        { sourceKey: "b", label: "Industry", minutes: 30 },
        { sourceKey: "c", label: "Reddit", minutes: 30 },
      ],
      sessionLimitMinutes: 30,
      sourceLimitMinutes: {},
      sessionPeaksMinutes: [],
    });
    assert.equal(notes.some((note) => note.id === "heavy-source"), false);
  });

  it("suggests a shorter session when peaks reach 90 percent of the cap", () => {
    const notes = suggestions({
      week: [{ sourceKey: "a", label: "News", minutes: 10 }],
      sessionLimitMinutes: 20,
      sourceLimitMinutes: { a: 10 },
      sessionPeaksMinutes: [18, 5],
    });
    const near = notes.find((note) => note.id === "near-cap");
    assert.ok(near);
    assert.match(near.detail, /1 session this week/);
    assert.match(near.detail, /15 minute session/);
  });

  it("does not recommend a longer session when the cap is already under five minutes", () => {
    const notes = suggestions({
      week: [],
      sessionLimitMinutes: 2,
      sourceLimitMinutes: { a: 1 },
      sessionPeaksMinutes: [2],
    });
    const near = notes.find((note) => note.id === "near-cap");
    assert.ok(near);
    assert.equal(near.detail.includes("minute session"), false);
  });
});
