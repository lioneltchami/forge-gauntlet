/**
 * Local product shell over the same Gauntlet runtime.
 * UX pace inspired by trygauntlet.com — product is a quality loop, not multi-model chat.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 8787);
const CWD = process.env.GAUNTLET_CWD ?? process.cwd();
const BUDGET_FILE = path.join(CWD, "web", ".data", "budgets.json");

export type Plan = "free" | "pro";
export type RunBudget = {
	plan: Plan;
	runsUsedToday: number;
	dailyLimit: number;
	day: string;
};

async function loadBudgets(): Promise<Record<string, RunBudget>> {
	try {
		return JSON.parse(await readFile(BUDGET_FILE, "utf8"));
	} catch {
		return {};
	}
}

async function saveBudgets(data: Record<string, RunBudget>) {
	await mkdir(path.dirname(BUDGET_FILE), { recursive: true });
	await writeFile(BUDGET_FILE, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function today() {
	return new Date().toISOString().slice(0, 10);
}

async function getBudget(userId: string): Promise<RunBudget> {
	const all = await loadBudgets();
	const day = today();
	let b = all[userId];
	if (!b || b.day !== day) {
		b = { plan: "free", runsUsedToday: 0, dailyLimit: 3, day };
		all[userId] = b;
		await saveBudgets(all);
	}
	return b;
}

async function bumpBudget(userId: string) {
	const all = await loadBudgets();
	const b = await getBudget(userId);
	b.runsUsedToday += 1;
	all[userId] = b;
	await saveBudgets(all);
	return b;
}

export const stripePlaceholders = {
	priceProMonthly:
		process.env.STRIPE_PRICE_PRO ?? "price_gauntlet_pro_placeholder",
	checkoutUrl: "/api/billing/checkout",
};

function json(
	res: import("node:http").ServerResponse,
	status: number,
	body: unknown,
) {
	res.writeHead(status, {
		"content-type": "application/json",
		"access-control-allow-origin": "*",
	});
	res.end(JSON.stringify(body, null, 2));
}

async function readBody(
	req: import("node:http").IncomingMessage,
): Promise<string> {
	const chunks: Buffer[] = [];
	for await (const c of req) chunks.push(c as Buffer);
	return Buffer.concat(chunks).toString("utf8");
}

const server = createServer(async (req, res) => {
	const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
	const userId = req.headers["x-user-id"]?.toString() ?? "anonymous";

	if (req.method === "OPTIONS") {
		res.writeHead(204, {
			"access-control-allow-origin": "*",
			"access-control-allow-methods": "GET,POST,OPTIONS",
			"access-control-allow-headers": "content-type,x-user-id",
		});
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


		// Auth for mutating/sensitive API (optional via GAUNTLET_WEB_TOKEN)
		const needsAuth =
			url.pathname.startsWith("/api/") &&
			url.pathname !== "/api/health" &&
			url.pathname !== "/api/billing/webhook";
		if (needsAuth && req.method !== "OPTIONS") {
			const auth = assertWebAuth(req.headers.authorization);
			if (!auth.ok) return json(res, auth.status, { error: auth.error });
		}

		if (req.method === "GET" && url.pathname === "/api/health") {
			json(res, 200, {
				ok: true,
				version: "0.2.0",
				positioning:
					"Not another multi-model chat. A quality loop that won’t stop until it beats a real bar.",
				attribution: "Technique by Matt Shumer. Runtime enforces the bar.",
			});
			return;
		}

		if (req.method === "GET" && url.pathname === "/api/budget") {
			json(res, 200, await getBudget(userId));
			return;
		}

		if (req.method === "POST" && url.pathname === "/api/propose") {
			const body = JSON.parse(await readBody(req)) as { goal?: string };
			if (!body.goal) return json(res, 400, { error: "goal required" });
			json(res, 200, await propose(body.goal));
			return;
		}

		if (req.method === "POST" && url.pathname === "/api/validate-bar") {
			const body = JSON.parse(await readBody(req)) as { bar: BarCandidate };
			const tmp = path.join(CWD, "runs", "_web-bar-check");
			const validation = await validateBar(body.bar, { runDir: tmp });
			json(res, validation.ok ? 200 : 400, { validation });
			return;
		}

		if (req.method === "POST" && url.pathname === "/api/compose") {
			const body = JSON.parse(await readBody(req)) as {
				goal: string;
				bar: BarCandidate;
				mode?: "standard" | "apex";
				agent?: "cursor" | "claude-code" | "codex" | "generic";
			};
			const text = composeSystemPrompt({
				goal: body.goal,
				barName: body.bar.name,
				barUrl: body.bar.url,
				agentEnv: body.agent ?? detectAgentEnv(),
				mode: body.mode ?? "standard",
				derived: true,
			});
			json(res, 200, { systemPrompt: text });
			return;
		}

		if (req.method === "POST" && url.pathname === "/api/runs") {
			const budget = await getBudget(userId);
			if (budget.plan === "free" && budget.runsUsedToday >= budget.dailyLimit) {
				return json(res, 402, {
					error: "Daily free run budget exhausted. Pro unlocks more runs.",
					checkout: stripePlaceholders.checkoutUrl,
				});
			}
			const body = JSON.parse(await readBody(req)) as {
				goal: string;
				bar: BarCandidate;
				mode?: "standard" | "apex";
				agent?: "cursor" | "claude-code" | "codex" | "generic";
				maxUsd?: number;
				composeOnly?: boolean;
				skipBarFetch?: boolean;
			};

			const created = await createRun({
				goal: body.goal,
				bar: body.bar,
				cwd: CWD,
				mode: body.mode ?? "standard",
				agentEnv: body.agent ?? detectAgentEnv(),
				maxUsd: body.maxUsd,
				climbUntilHumanStop: body.mode === "apex",
				skipBarFetch: body.skipBarFetch,
			});

			if (!created.meta.barValidation?.ok) {
				return json(res, 400, {
					error: "Bar health check failed",
					validation: created.meta.barValidation,
				});
			}

			const b = await bumpBudget(userId);

			if (body.composeOnly) {
				return json(res, 201, {
					runId: created.runId,
					composeOnly: true,
					aimPrompt: created.aimPrompt,
					systemPrompt: created.systemPrompt,
					budget: b,
				});
			}

			void runLoop(
				created.runId,
				{
					maxRoundsPerPiece: body.mode === "apex" ? undefined : 4,
					verdictFn: async ({ round }) =>
						round <= 1
							? {
									winner: "bar",
									gap: "Close the largest gap vs the fetched bar.",
									confidence: 0.7,
									note: "web-local-verdict",
								}
							: {
									winner: "ours",
									gap: "No remaining gap.",
									confidence: 0.8,
									note: "web-local-verdict",
								},
				},
				CWD,
			);

			json(res, 201, {
				runId: created.runId,
				aimPrompt: created.aimPrompt,
				systemPrompt: created.systemPrompt,
				budget: b,
				note: "Local web uses a demo verdict path. CLI --vision-critic / paste ORCHESTRATOR for real agents.",
			});
			return;
		}

		if (req.method === "GET" && url.pathname.startsWith("/api/runs/")) {
			const id = url.pathname.split("/")[3];
			const dir = runDir(id, CWD);
			const meta = await readMeta(dir);
			const pieces = await readPieces(dir);
			json(res, 200, {
				meta,
				pieces,
				progress: renderProgress(meta, pieces),
			});
			return;
		}

		if (req.method === "POST" && url.pathname === "/api/stop") {
			const body = JSON.parse(await readBody(req)) as { runId?: string };
			json(res, 200, await stopRun(body.runId, CWD));
			return;
		}

		if (req.method === "POST" && url.pathname === "/api/billing/checkout") {
			const body = JSON.parse((await readBody(req)) || "{}") as {
				email?: string;
			};
			const origin = `http://localhost:${PORT}`;
			const session = await createCheckoutSession({
				successUrl: `${origin}/?checkout=success`,
				cancelUrl: `${origin}/?checkout=cancel`,
				customerEmail: body.email,
			});
			if (!session.ok) {
				return json(res, 200, {
					mode: "placeholder",
					error: session.error,
					price: stripePlaceholders.priceProMonthly,
					message:
						"Set STRIPE_SECRET_KEY + STRIPE_PRICE_PRO for live Checkout. Selling run budgets, not token markup.",
				});
			}
			json(res, 200, session);
			return;
		}

		if (req.method === "POST" && url.pathname === "/api/billing/webhook") {
			const raw = await readBody(req);
			const sig = req.headers["stripe-signature"]?.toString();
			if (!verifyStripeWebhook(raw, sig)) {
				return json(res, 400, { error: "Invalid Stripe signature" });
			}
			const event = JSON.parse(raw) as { type: string; data?: { object?: { client_reference_id?: string; customer_email?: string } } };
			const upgrade = applyCheckoutCompleted(event.type);
			if (upgrade) {
				const uid =
					event.data?.object?.client_reference_id ||
					event.data?.object?.customer_email ||
					"anonymous";
				const all = await loadBudgets();
				const b = await getBudget(uid);
				b.plan = upgrade.plan;
				b.dailyLimit = 100;
				all[uid] = b;
				await saveBudgets(all);
			}
			json(res, 200, { received: true });
			return;
		}

		if (req.method === "GET" && url.pathname === "/api/status") {
			const id = await findActiveRunId(CWD);
			if (!id) return json(res, 404, { error: "no active run" });
			const dir = runDir(id, CWD);
			json(res, 200, {
				meta: await readMeta(dir),
				pieces: await readPieces(dir),
			});
			return;
		}

		json(res, 404, { error: "not found" });
	} catch (err) {
		json(res, 500, {
			error: err instanceof Error ? err.message : String(err),
		});
	}
});

server.listen(PORT, () => {
	console.log(`Gauntlet web http://localhost:${PORT}`);
	console.log("Quality loop UI — not a multi-model chat.");
});
