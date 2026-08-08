import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertSafePublicUrl,
  assertSafeRunId,
  corsHeaders,
  isPrivateIp,
  readBodyLimited,
  resolveBindHost,
  userIdFromToken,
} from "./security.js";

describe("web security", () => {
  it("binds loopback by default", () => {
    assert.equal(resolveBindHost(undefined), "127.0.0.1");
    assert.equal(resolveBindHost(""), "127.0.0.1");
    assert.equal(resolveBindHost("0.0.0.0"), "0.0.0.0");
  });

  it("never echoes wildcard CORS", () => {
    const headers = corsHeaders(
      "https://evil.example",
      new Set(["http://127.0.0.1:8787"]),
    );
    assert.equal(headers["access-control-allow-origin"], undefined);
    assert.equal(
      corsHeaders("http://127.0.0.1:8787", new Set(["http://127.0.0.1:8787"]))[
        "access-control-allow-origin"
      ],
      "http://127.0.0.1:8787",
    );
  });

  it("blocks private, local, and credentialed bar URLs", () => {
    assert.equal(assertSafePublicUrl("http://127.0.0.1/secret").ok, false);
    assert.equal(assertSafePublicUrl("http://localhost/admin").ok, false);
    assert.equal(
      assertSafePublicUrl("http://169.254.169.254/latest").ok,
      false,
    );
    assert.equal(assertSafePublicUrl("http://10.0.0.8/internal").ok, false);
    assert.equal(assertSafePublicUrl("file:///etc/passwd").ok, false);
    assert.equal(
      assertSafePublicUrl("https://user:pass@example.com/x").ok,
      false,
    );
    assert.equal(assertSafePublicUrl("https://stripe.com/pricing").ok, true);
  });

  it("classifies private IPs", () => {
    assert.equal(isPrivateIp("192.168.1.1"), true);
    assert.equal(isPrivateIp("8.8.8.8"), false);
    assert.equal(isPrivateIp("::1"), true);
  });

  it("rejects path-traversal run ids", () => {
    assert.equal(assertSafeRunId("../etc", "/tmp/gauntlet").ok, false);
    assert.equal(assertSafeRunId("run-ok-1", "/tmp/gauntlet").ok, true);
  });

  it("caps request body size", async () => {
    async function* big() {
      yield Buffer.alloc(200_000, 97);
      yield Buffer.alloc(100_000, 98);
    }
    await assert.rejects(readBodyLimited(big(), 256_000), /exceeds/i);
  });

  it("derives stable user ids from tokens, not client headers", () => {
    const a = userIdFromToken("secret-a");
    const b = userIdFromToken("secret-a");
    const c = userIdFromToken("secret-b");
    assert.equal(a, b);
    assert.notEqual(a, c);
    assert.match(a, /^tok_[0-9a-f]{16}$/);
  });
});
