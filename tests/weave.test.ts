import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { weave } from "../src/lib/feed/weave";

describe("weave", () => {
  it("returns an empty list when every bucket is empty", () => {
    assert.deepEqual(weave([[], []]), []);
  });

  it("round-robins buckets and keeps leftover items", () => {
    const woven = weave([
      [{ id: "a1", at: 30 }, { id: "a2", at: 10 }],
      [{ id: "b1", at: 20 }],
      [],
    ]);
    assert.deepEqual(
      woven.map((item) => item.id),
      ["a1", "b1", "a2"],
    );
  });

  it("does not sort by time", () => {
    const woven = weave([[{ id: "late", at: 1 }], [{ id: "early", at: 100 }]]);
    assert.deepEqual(
      woven.map((item) => item.id),
      ["late", "early"],
    );
  });

  it("passes a single bucket through in its original order", () => {
    assert.deepEqual(weave([["one", "two"]]), ["one", "two"]);
  });
});
