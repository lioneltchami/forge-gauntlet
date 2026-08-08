/**
 * Local product shell over the same Gauntlet runtime.
 * UX pace inspired by trygauntlet.com — product is a quality loop, not multi-model chat.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openRouterCriticWithUsage } from "../adapters/openrouter.js";
import { detectAgentEnv } from "../runtime/aim-prompt.js";
import { validateBar } from "../runtime/bar.js";
import { composeSystemPrompt } from "../runtime/compose.js";
import {
  findActiveRunId,
  readMeta,
  readPieces,
  renderProgress,
  runDir,
} from "../runtime/ledger.js";
import { createRun, propose, runLoop } from "../runtime/runner.js";
import { stopRun } from "../runtime/stop.js";
import type { BarCandidate } from "../runtime/types.js";
import {
  applyCheckoutCompleted,
  assertWebAuth,
  createCheckoutSession,
  verifyStripeWebhook,
} from "./billing.js";
import {
  assertSafeFetchUrl,
  assertSafeRunId,
  corsHeaders,
  readBodyLimited,
  resolveBindHost,
} from "./security.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 8787);
const HOST = resolveBindHost();
const CWD = process.env.GAUNTLET_CWD ?? process.cwd();

export type Plan = "free" | "pro";
export type RunBudget = {
  plan: Plan;
  runsUsedToday: number;
  dailyLimit: number;
  day: string;
};

function budgetFile(cwd: string) {
  return path.join(cwd, "web", ".data", "budgets.json");
}

async function loadBudgets(cwd: string): Promise<Record<string, RunBudget>> {
  try {
    return JSON.parse(await readFile(budgetFile(cwd), "utf8"));
  } catch {
    return {};
  }
}

async function saveBudgets(cwd: string, data: Record<string, RunBudget>) {
  const file = budgetFile(cwd);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

async function getBudget(cwd: string, userId: string): Promise<RunBudget> {
  const all = await loadBudgets(cwd);
  const day = today();
  let b = all[userId];
  if (!b || b.day !== day) {
    b = { plan: "free", runsUsedToday: 0, dailyLimit: 3, day };
    all[userId] = b;
    await saveBudgets(cwd, all);
  }
  return b;
}

async function bumpBudget(cwd: string, userId: string) {
  const all = await loadBudgets(cwd);
  const b = await getBudget(cwd, userId);
  b.runsUsedToday += 1;
  all[userId] = b;
  await saveBudgets(cwd, all);
  return b;
}

export const stripePlaceholders = {
  priceProMonthly:
    process.env.STRIPE_PRICE_PRO ?? "price_gauntlet_pro_placeholder",
  checkoutUrl: "/api/billing/checkout",
};

function json(
  req: IncomingMessage,
  res: ServerResponse,
  status: number,
  body: unknown,
) {
  const origin = req.headers.origin?.toString();
  res.writeHead(status, {
    "content-type": "application/json",
    ...corsHeaders(origin),
  });
  res.end(JSON.stringify(body, null, 2));
}

async function assertBarUrlSafe(
  bar: BarCandidate | undefined,
): Promise<string | null> {
  if (!bar?.url) return "Bar URL required.";
  const check = await assertSafeFetchUrl(bar.url);
  return check.ok ? null : check.error;
}

export async function handleWebRequest(
  req: IncomingMessage,
  res: ServerResponse,
  opts: { cwd?: string } = {},
): Promise<void> {
  const cwd = opts.cwd ?? CWD;
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);
  const origin = req.headers.origin?.toString();

  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders(origin));
    res.end();
    return;
  }

  try {
    if (req.method === "GET" && url.pathname === "/") {
      const html = await readFile(
        path.join(__dirname, "public", "index.html"),
        "utf8",
      );
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }

    const needsAuth =
      url.pathname.startsWith("/api/") &&
      url.pathname !== "/api/health" &&
      url.pathname !== "/api/billing/webhook";
    let userId = "local";
    if (needsAuth && req.method !== "OPTIONS") {
      const auth = assertWebAuth(req.headers.authorization);
      if (!auth.ok) return json(req, res, auth.status, { error: auth.error });
      userId = auth.userId;
    }

    if (req.method === "GET" && url.pathname === "/api/health") {
      json(req, res, 200, {
        ok: true,
        version: "0.2.0",
        host: HOST,
        positioning:
          "Not another multi-model chat. A quality loop that won’t stop until it beats a real bar.",
        attribution: "Technique by Matt Shumer. Runtime enforces the bar.",
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/budget") {
      json(req, res, 200, await getBudget(cwd, userId));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/propose") {
      const body = JSON.parse(await readBodyLimited(req)) as { goal?: string };
      if (!body.goal) return json(req, res, 400, { error: "goal required" });
      json(req, res, 200, await propose(body.goal));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/validate-bar") {
      const body = JSON.parse(await readBodyLimited(req)) as {
        bar: BarCandidate;
      };
      const unsafe = await assertBarUrlSafe(body.bar);
      if (unsafe) return json(req, res, 400, { error: unsafe });
      const tmp = path.join(cwd, "runs", "_web-bar-check");
      const validation = await validateBar(body.bar, { runDir: tmp });
      json(req, res, validation.ok ? 200 : 400, { validation });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/compose") {
      const body = JSON.parse(await readBodyLimited(req)) as {
        goal: string;
        bar: BarCandidate;
        mode?: "standard" | "apex";
        agent?: "cursor" | "claude-code" | "codex" | "generic";
      };
      const unsafe = await assertBarUrlSafe(body.bar);
      if (unsafe) return json(req, res, 400, { error: unsafe });
      const text = composeSystemPrompt({
        goal: body.goal,
        barName: body.bar.name,
        barUrl: body.bar.url,
        agentEnv: body.agent ?? detectAgentEnv(),
        mode: body.mode ?? "standard",
        derived: true,
      });
      json(req, res, 200, { systemPrompt: text });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/runs") {
      const budget = await getBudget(cwd, userId);
      if (budget.plan === "free" && budget.runsUsedToday >= budget.dailyLimit) {
        return json(req, res, 402, {
          error: "Daily free run budget exhausted. Pro unlocks more runs.",
          checkout: stripePlaceholders.checkoutUrl,
        });
      }
      const body = JSON.parse(await readBodyLimited(req)) as {
        goal: string;
        bar: BarCandidate;
        mode?: "standard" | "apex";
        agent?: "cursor" | "claude-code" | "codex" | "generic";
        maxUsd?: number;
        composeOnly?: boolean;
        skipBarFetch?: boolean;
        visionCritic?: boolean;
      };

      const unsafe = await assertBarUrlSafe(body.bar);
      if (unsafe) return json(req, res, 400, { error: unsafe });

      const created = await createRun({
        goal: body.goal,
        bar: body.bar,
        cwd,
        mode: body.mode ?? "standard",
        agentEnv: body.agent ?? detectAgentEnv(),
        maxUsd: body.maxUsd,
        climbUntilHumanStop: body.mode === "apex",
        skipBarFetch: body.skipBarFetch,
      });

      if (!created.meta.barValidation?.ok) {
        return json(req, res, 400, {
          error: "Bar health check failed",
          validation: created.meta.barValidation,
        });
      }

      const b = await bumpBudget(cwd, userId);

      if (body.composeOnly) {
        return json(req, res, 201, {
          runId: created.runId,
          composeOnly: true,
          aimPrompt: created.aimPrompt,
          systemPrompt: created.systemPrompt,
          budget: b,
        });
      }

      const useOpenRouter = Boolean(process.env.OPENROUTER_API_KEY);
      void runLoop(
        created.runId,
        {
          maxRoundsPerPiece: body.mode === "apex" ? undefined : 4,
          visionCritic: body.visionCritic === true,
          criticFn: useOpenRouter
            ? async (prompt, limits) =>
                openRouterCriticWithUsage(prompt, {
                  maxTokens: limits.maxTokens,
                })
            : undefined,
        },
        cwd,
      ).catch((err) => {
        console.error(
          `[gauntlet-web] run ${created.runId} failed:`,
          err instanceof Error ? err.message : err,
        );
      });

      json(req, res, 201, {
        runId: created.runId,
        aimPrompt: created.aimPrompt,
        systemPrompt: created.systemPrompt,
        budget: b,
        critic: useOpenRouter
          ? "openrouter"
          : body.visionCritic
            ? "vision"
            : "heuristic",
        note: useOpenRouter
          ? "Using OpenRouter critic. Set GAUNTLET_CRITIC_MODEL to choose the judge."
          : "No OPENROUTER_API_KEY — using measurable/heuristic critic (not a scripted win).",
      });
      return;
    }

    if (req.method === "GET" && url.pathname.startsWith("/api/runs/")) {
      const id = url.pathname.split("/")[3] ?? "";
      const safe = assertSafeRunId(id, cwd);
      if (!safe.ok) return json(req, res, 400, { error: safe.error });
      const meta = await readMeta(safe.dir);
      const pieces = await readPieces(safe.dir);
      json(req, res, 200, {
        meta,
        pieces,
        progress: renderProgress(meta, pieces),
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/stop") {
      const body = JSON.parse((await readBodyLimited(req)) || "{}") as {
        runId?: string;
      };
      if (body.runId) {
        const safe = assertSafeRunId(body.runId, cwd);
        if (!safe.ok) return json(req, res, 400, { error: safe.error });
      }
      json(req, res, 200, await stopRun(body.runId, cwd));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/billing/checkout") {
      const body = JSON.parse((await readBodyLimited(req)) || "{}") as {
        email?: string;
      };
      const originBase = `http://127.0.0.1:${PORT}`;
      const session = await createCheckoutSession({
        successUrl: `${originBase}/?checkout=success`,
        cancelUrl: `${originBase}/?checkout=cancel`,
        customerEmail: body.email,
        clientReferenceId: userId,
      });
      if (!session.ok) {
        return json(req, res, 200, {
          mode: "placeholder",
          error: session.error,
          price: stripePlaceholders.priceProMonthly,
          userId,
          message:
            "Set STRIPE_SECRET_KEY + STRIPE_PRICE_PRO for live Checkout. Selling run budgets, not token markup.",
        });
      }
      json(req, res, 200, { ...session, userId });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/billing/webhook") {
      const raw = await readBodyLimited(req);
      const sig = req.headers["stripe-signature"]?.toString();
      if (!verifyStripeWebhook(raw, sig)) {
        return json(req, res, 400, { error: "Invalid Stripe signature" });
      }
      const event = JSON.parse(raw) as {
        type: string;
        data?: { object?: { client_reference_id?: string } };
      };
      const upgrade = applyCheckoutCompleted(event.type);
      if (upgrade) {
        const uid = event.data?.object?.client_reference_id;
        if (!uid || uid === "anonymous") {
          return json(req, res, 400, {
            error: "Webhook missing authenticated client_reference_id",
          });
        }
        const all = await loadBudgets(cwd);
        const b = await getBudget(cwd, uid);
        b.plan = upgrade.plan;
        b.dailyLimit = 100;
        all[uid] = b;
        await saveBudgets(cwd, all);
      }
      json(req, res, 200, { received: true });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/status") {
      const id = await findActiveRunId(cwd);
      if (!id) return json(req, res, 404, { error: "no active run" });
      const dir = runDir(id, cwd);
      json(req, res, 200, {
        meta: await readMeta(dir),
        pieces: await readPieces(dir),
      });
      return;
    }

    json(req, res, 404, { error: "not found" });
  } catch (err) {
    json(req, res, 500, {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export function startWebServer() {
  const server = createServer((req, res) => {
    void handleWebRequest(req, res);
  });
  server.listen(PORT, HOST, () => {
    console.log(`Gauntlet web http://${HOST}:${PORT}`);
    console.log("Quality loop UI — not a multi-model chat.");
    if (
      !process.env.GAUNTLET_WEB_TOKEN &&
      process.env.GAUNTLET_WEB_ALLOW_ANON !== "1"
    ) {
      console.warn(
        "Auth fail-closed: set GAUNTLET_WEB_TOKEN or GAUNTLET_WEB_ALLOW_ANON=1",
      );
    }
  });
  return server;
}

const isMain =
  process.argv[1] != null &&
  path.resolve(fileURLToPath(import.meta.url)) ===
    path.resolve(process.argv[1]);

if (isMain) {
  startWebServer();
}
