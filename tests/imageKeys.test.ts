import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { accountSourceKey, feedImageKey, IMAGE_KEY } from "../src/lib/types";

const ID = "123e4567-e89b-12d3-a456-426614174000";

describe("image keys", () => {
  it("accepts account and feed keys", () => {
    assert.ok(IMAGE_KEY.test(accountSourceKey(ID)));
    assert.ok(IMAGE_KEY.test(feedImageKey(ID)));
  });

  it("rejects category keys and malformed keys", () => {
    assert.equal(IMAGE_KEY.test(`category:${ID}`), false);
    assert.equal(IMAGE_KEY.test("feed:not-a-uuid"), false);
    assert.equal(IMAGE_KEY.test(""), false);
  });
});
