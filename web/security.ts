import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import path from "node:path";
import { runsRoot } from "../runtime/ledger.js";

const MAX_BODY_BYTES = 256 * 1024;

const BLOCKED_HOSTS = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
  "metadata",
  "0.0.0.0",
  "::1",
]);

export function resolveBindHost(
  host = process.env.HOST ?? process.env.GAUNTLET_WEB_HOST,
): string {
  const value = (host ?? "127.0.0.1").trim();
  if (!value) return "127.0.0.1";
  return value;
}

export function allowedOrigins(
  raw = process.env.GAUNTLET_WEB_ORIGINS,
  port = Number(process.env.PORT ?? 8787),
): Set<string> {
  if (raw?.trim()) {
    return new Set(
      raw
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean),
    );
  }
  return new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`]);
}

export function corsHeaders(
  origin: string | undefined,
  origins = allowedOrigins(),
): Record<string, string> {
  const headers: Record<string, string> = {
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,authorization",
    vary: "Origin",
  };
  if (origin && origins.has(origin)) {
    headers["access-control-allow-origin"] = origin;
  }
  return headers;
}

export function isPrivateIp(ip: string): boolean {
  const v4 = ip.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    return false;
  }
  const normalized = ip.toLowerCase();
  return (
    normalized === "::1" ||
    normalized === "::" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:")
  );
}

export function assertSafePublicUrl(raw: string):
  | {
      ok: true;
      url: URL;
    }
  | {
      ok: false;
      error: string;
    } {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, error: "Invalid URL." };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: "Only http(s) bar URLs are allowed." };
  }
  if (url.username || url.password) {
    return { ok: false, error: "URLs with credentials are blocked." };
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!host || BLOCKED_HOSTS.has(host) || host.endsWith(".localhost")) {
    return { ok: false, error: "Local and metadata hosts are blocked." };
  }
  if (isPrivateIp(host)) {
    return { ok: false, error: "Private IP targets are blocked." };
  }
  return { ok: true, url };
}

/** DNS-resolve and reject private answers (SSRF hardening). */
export async function assertSafeFetchUrl(raw: string): Promise<
  | {
      ok: true;
      url: URL;
    }
  | {
      ok: false;
      error: string;
    }
> {
  const base = assertSafePublicUrl(raw);
  if (!base.ok) return base;
  try {
    const records = await lookup(base.url.hostname, { all: true });
    if (!records.length) {
      return { ok: false, error: "Bar host did not resolve." };
    }
    for (const record of records) {
      if (isPrivateIp(record.address)) {
        return {
          ok: false,
          error: "Bar host resolves to a private or local address.",
        };
      }
    }
  } catch (err) {
    return {
      ok: false,
      error: `Bar host DNS lookup failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  return base;
}

export function assertSafeRunId(
  runId: string,
  cwd: string,
): { ok: true; dir: string } | { ok: false; error: string } {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(runId)) {
    return { ok: false, error: "Invalid run id." };
  }
  const root = path.resolve(runsRoot(cwd));
  const dir = path.resolve(root, runId);
  if (dir !== root && !dir.startsWith(root + path.sep)) {
    return { ok: false, error: "Invalid run id." };
  }
  return { ok: true, dir };
}

export async function readBodyLimited(
  req: AsyncIterable<Buffer | string>,
  maxBytes = MAX_BODY_BYTES,
): Promise<string> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.byteLength;
    if (total > maxBytes) {
      throw new Error(`Request body exceeds ${maxBytes} bytes.`);
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export function userIdFromToken(token: string): string {
  return `tok_${createHash("sha256").update(token).digest("hex").slice(0, 16)}`;
}
