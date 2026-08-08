import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type ScreenshotResult = {
  path: string;
  hash: string;
  viewport: { width: number; height: number };
};

async function tryPlaywright() {
  try {
    return await import("playwright");
  } catch {
    return null;
  }
}

/** Screenshot a URL. Falls back to fetching HTML bytes if Playwright browsers missing. */
export async function screenshotUrl(
  url: string,
  outPath: string,
  viewport: { width: number; height: number } = { width: 1440, height: 900 },
): Promise<ScreenshotResult> {
  await mkdir(path.dirname(outPath), { recursive: true });
  const pw = await tryPlaywright();
  if (pw) {
    try {
      const browser = await pw.chromium.launch({ headless: true });
      try {
        const page = await browser.newPage({ viewport });
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
        await page.waitForTimeout(500);
        await page.screenshot({ path: outPath, fullPage: true });
      } finally {
        await browser.close();
      }
      const buf = await readFile(outPath);
      return {
        path: outPath,
        hash: createHash("sha256").update(buf).digest("hex"),
        viewport,
      };
    } catch {
      // fall through to HTML fetch placeholder
    }
  }

  // Fallback: store fetched HTML as .html so the run still has evidence
  const res = await fetch(url, {
    headers: { "user-agent": "gauntlet-evidence/0.1" },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Evidence fetch failed: HTTP ${res.status}`);
  const text = await res.text();
  const htmlPath = outPath.replace(/\.png$/i, ".html");
  await writeFile(htmlPath, text, "utf8");
  // Also write a tiny PNG-like marker file path for pipeline consistency
  await writeFile(
    outPath + ".fallback.txt",
    `Fell back to HTML at ${htmlPath}\n`,
    "utf8",
  );
  return {
    path: htmlPath,
    hash: createHash("sha256").update(text).digest("hex"),
    viewport,
  };
}

export async function fetchTextEvidence(
  url: string,
  outPath: string,
): Promise<{ path: string; hash: string; text: string }> {
  await mkdir(path.dirname(outPath), { recursive: true });
  const res = await fetch(url, {
    headers: { "user-agent": "gauntlet-evidence/0.1" },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Text fetch failed: HTTP ${res.status}`);
  let text = await res.text();
  // Strip obvious bylines / titles for a weaker blind read
  text = text
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\b(by|author|written by)\s+[A-Z][\w.\- ]{1,40}/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 12000);
  await writeFile(outPath, text, "utf8");
  return {
    path: outPath,
    hash: createHash("sha256").update(text).digest("hex"),
    text,
  };
}

export async function copyEvidence(src: string, dest: string) {
  await mkdir(path.dirname(dest), { recursive: true });
  await copyFile(src, dest);
  const buf = await readFile(dest);
  return { path: dest, hash: createHash("sha256").update(buf).digest("hex") };
}
