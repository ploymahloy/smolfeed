import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_DETER_RAMP_MS, grayscaleAmount } from "../src/lib/deter";

describe("grayscale ramp", () => {
  it("stays in color while Deter is off", () => {
    assert.equal(grayscaleAmount(10 * 60 * 1000, 20, false), 0);
  });

  it("starts at full color", () => {
    assert.equal(grayscaleAmount(0, 20, true), 0);
  });

  it("reaches half gray at half the session limit", () => {
    assert.equal(grayscaleAmount(10 * 60 * 1000, 20, true), 0.5);
  });

  it("caps at full grayscale past the limit", () => {
    assert.equal(grayscaleAmount(40 * 60 * 1000, 20, true), 1);
  });

  it("uses a 20 minute ramp when no session limit is set", () => {
    assert.equal(grayscaleAmount(DEFAULT_DETER_RAMP_MS / 2, null, true), 0.5);
    assert.equal(grayscaleAmount(DEFAULT_DETER_RAMP_MS, 0, true), 1);
  });
});
