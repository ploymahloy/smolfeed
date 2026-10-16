import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  cappedSourceKeys,
  formatSessionClock,
  isSessionCapped,
  parseLimitMinutes,
} from "../src/lib/limits";

describe("limits", () => {
  it("leaves the session open when no cap is set", () => {
    assert.equal(isSessionCapped(60 * 60 * 1000, null), false);
    assert.equal(isSessionCapped(60 * 60 * 1000, 0), false);
  });

  it("caps the session at the exact minute boundary", () => {
    assert.equal(isSessionCapped(59_999, 1), false);
    assert.equal(isSessionCapped(60_000, 1), true);
  });

  it("returns sources that have reached their own cap", () => {
    assert.deepEqual(
      cappedSourceKeys(
        { "account:a": 10 * 60 * 1000, "category:b": 1000 },
        { "account:a": 10, "category:b": 5, "account:c": 0 },
      ),
      ["account:a"],
    );
  });

  it("accepts minute counts from 1 to 1440 and rejects the rest", () => {
    assert.equal(parseLimitMinutes(""), null);
    assert.equal(parseLimitMinutes(20), 20);
    assert.equal(parseLimitMinutes(0), null);
    assert.equal(parseLimitMinutes(1441), null);
    assert.equal(parseLimitMinutes(1.5), null);
  });

  it("formats the navbar clock", () => {
    assert.equal(formatSessionClock(12 * 60 * 1000, 30), "12 / 30 min");
    assert.equal(formatSessionClock(12 * 60 * 1000, null), "12 min");
  });
});
