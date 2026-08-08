import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { handleWebRequest } from "./server.js";

describe("web server hardening", () => {
  let cwd = "";
  let port = 0;
  let server: ReturnType<typeof createServer>;
  const prev = {
    token: process.env.GAUNTLET_WEB_TOKEN,
    anon: process.env.GAUNTLET_WEB_ALLOW_ANON,
    openrouter: process.env.OPENROUTER_API_KEY,
  };

  before(async () => {
    cwd = await mkdtemp(path.join(tmpdir(), "gauntlet-web-"));
    process.env.GAUNTLET_WEB_ALLOW_ANON = "1";
    delete process.env.GAUNTLET_WEB_TOKEN;
    delete process.env.OPENROUTER_API_KEY;
    server = createServer((req, res) => {
      void handleWebRequest(req, res, { cwd });
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const addr = server.address();
    assert.ok(addr && typeof addr === "object");
    port = addr.port;
  });

  after(async () => {
    await new Promise((r) => setTimeout(r, 250));
    server.close();
    await rm(cwd, { recursive: true, force: true }).catch(async () => {
      await new Promise((r) => setTimeout(r, 500));
      await rm(cwd, { recursive: true, force: true });
    });
    if (prev.token == null) delete process.env.GAUNTLET_WEB_TOKEN;
    else process.env.GAUNTLET_WEB_TOKEN = prev.token;
    if (prev.anon == null) delete process.env.GAUNTLET_WEB_ALLOW_ANON;
    else process.env.GAUNTLET_WEB_ALLOW_ANON = prev.anon;
    if (prev.openrouter == null) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = prev.openrouter;
  });

  async function call(
    method: string,
    pathname: string,
    opts: { body?: unknown; headers?: Record<string, string> } = {},
  ) {
    const res = await fetch(`http://127.0.0.1:${port}${pathname}`, {
      method,
      headers: {
        ...(opts.body ? { "content-type": "application/json" } : {}),
        ...opts.headers,
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    return { res, data };
  }

  it("rejects private bar URLs before fetch", async () => {
    const { res, data } = await call("POST", "/api/validate-bar", {
      body: {
        bar: {
          id: "x",
          name: "Local Metadata",
          url: "http://127.0.0.1/latest/meta-data",
        },
      },
    });
    assert.equal(res.status, 400);
    assert.match(String(data.error), /blocked|private|local/i);
  });

  it("does not use a scripted demo verdict path", async () => {
    const { readFile } = await import("node:fs/promises");
    const src = await readFile(new URL("./server.ts", import.meta.url), "utf8");
    assert.equal(src.includes("web-local-verdict"), false);
    assert.equal(/winner:\s*"ours".*demo/s.test(src), false);

    const { res, data } = await call("POST", "/api/runs", {
      body: {
        goal: "tiny page. pieces: hero",
        bar: {
          id: "a",
          name: "Example Domain",
          url: "https://example.com",
        },
        composeOnly: true,
        skipBarFetch: true,
      },
    });
    assert.equal(res.status, 201);
    assert.equal(data.composeOnly, true);
    assert.equal(String(data.note || "").includes("demo verdict"), false);
  });

  it("rejects path-traversal stop ids", async () => {
    const { res, data } = await call("POST", "/api/stop", {
      body: { runId: "../secret" },
    });
    assert.equal(res.status, 400);
    assert.match(String(data.error), /invalid run id/i);
  });

  it("fails closed without token when anon mode is disabled", async () => {
    delete process.env.GAUNTLET_WEB_ALLOW_ANON;
    delete process.env.GAUNTLET_WEB_TOKEN;
    const { res, data } = await call("GET", "/api/budget");
    assert.equal(res.status, 401);
    assert.match(String(data.error), /GAUNTLET_WEB_TOKEN/i);
    process.env.GAUNTLET_WEB_ALLOW_ANON = "1";
  });

  it("never sets wildcard CORS", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, {
      headers: { origin: "https://evil.example" },
    });
    assert.equal(res.headers.get("access-control-allow-origin"), null);
    assert.equal(res.status, 200);
  });
});
