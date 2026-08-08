import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertWebAuth } from "./billing.js";

describe("web auth", () => {
  it("fails closed when token is unset and anon is not allowed", () => {
    const denied = assertWebAuth(undefined, {
      token: undefined,
      allowAnon: false,
    });
    assert.equal(denied.ok, false);
    if (!denied.ok) assert.equal(denied.status, 401);
  });

  it("accepts bearer token and returns server-derived user id", () => {
    const ok = assertWebAuth("Bearer s3cret", {
      token: "s3cret",
      allowAnon: false,
    });
    assert.equal(ok.ok, true);
    if (ok.ok) assert.match(ok.userId, /^tok_/);
  });

  it("rejects wrong bearer token", () => {
    const bad = assertWebAuth("Bearer nope", {
      token: "s3cret",
      allowAnon: false,
    });
    assert.equal(bad.ok, false);
  });

  it("allows explicit local anon mode as a single local identity", () => {
    const ok = assertWebAuth(undefined, {
      token: undefined,
      allowAnon: true,
    });
    assert.equal(ok.ok, true);
    if (ok.ok) assert.equal(ok.userId, "local");
  });
});
