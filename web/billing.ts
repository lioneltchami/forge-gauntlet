import { createHmac, timingSafeEqual } from "node:crypto";

/** Simple bearer auth for the local web shell. */
export function assertWebAuth(
	header: string | string[] | undefined,
	token = process.env.GAUNTLET_WEB_TOKEN,
): { ok: true } | { ok: false; status: number; error: string } {
	if (!token) return { ok: true };
	const raw = Array.isArray(header) ? header[0] : header;
	if (!raw?.startsWith("Bearer ")) {
		return { ok: false, status: 401, error: "Missing Bearer token" };
	}
	const got = raw.slice("Bearer ".length).trim();
	const a = Buffer.from(got);
	const b = Buffer.from(token);
	if (a.length !== b.length || !timingSafeEqual(a, b)) {
		return { ok: false, status: 401, error: "Invalid token" };
	}
	return { ok: true };
}

export type CheckoutResult =
	| { ok: true; url: string; id: string; mode: "live" | "placeholder" }
	| { ok: false; error: string; mode: "placeholder" };

/**
 * Create a Stripe Checkout Session for Pro run budgets.
 * Uses Stripe REST when STRIPE_SECRET_KEY is set; otherwise returns a placeholder.
 */
export async function createCheckoutSession(opts: {
	successUrl: string;
	cancelUrl: string;
	customerEmail?: string;
}): Promise<CheckoutResult> {
	const secret = process.env.STRIPE_SECRET_KEY;
	const price =
		process.env.STRIPE_PRICE_PRO ?? "price_gauntlet_pro_placeholder";

	if (!secret) {
		return {
			ok: false,
			mode: "placeholder",
			error:
				"STRIPE_SECRET_KEY not set. Add key + STRIPE_PRICE_PRO to enable live Checkout.",
		};
	}

	const body = new URLSearchParams();
	body.set("mode", "subscription");
	body.set("success_url", opts.successUrl);
	body.set("cancel_url", opts.cancelUrl);
	body.set("line_items[0][price]", price);
	body.set("line_items[0][quantity]", "1");
	if (opts.customerEmail) body.set("customer_email", opts.customerEmail);

	const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
		method: "POST",
		headers: {
			authorization: `Bearer ${secret}`,
			"content-type": "application/x-www-form-urlencoded",
		},
		body,
	});
	if (!res.ok) {
		return {
			ok: false,
			mode: "placeholder",
			error: `Stripe error HTTP ${res.status}: ${await res.text()}`,
		};
	}
	const data = (await res.json()) as { id: string; url: string };
	return { ok: true, url: data.url, id: data.id, mode: "live" };
}

/** Verify Stripe-Signature header (t=…,v1=…). */
export function verifyStripeWebhook(
	payload: string,
	signatureHeader: string | undefined,
	secret = process.env.STRIPE_WEBHOOK_SECRET,
): boolean {
	if (!secret || !signatureHeader) return false;
	const parts = Object.fromEntries(
		signatureHeader.split(",").map((p) => {
			const [k, ...rest] = p.split("=");
			return [k, rest.join("=")];
		}),
	);
	const timestamp = parts.t;
	const sig = parts.v1;
	if (!timestamp || !sig) return false;
	const age = Math.abs(Date.now() / 1000 - Number(timestamp));
	if (Number.isNaN(age) || age > 300) return false;
	const signed = `${timestamp}.${payload}`;
	const digest = createHmac("sha256", secret).update(signed).digest("hex");
	try {
		return timingSafeEqual(Buffer.from(digest), Buffer.from(sig));
	} catch {
		return false;
	}
}

export function applyCheckoutCompleted(
	eventType: string,
): { plan: "pro" } | null {
	if (
		eventType === "checkout.session.completed" ||
		eventType === "customer.subscription.created"
	) {
		return { plan: "pro" };
	}
	return null;
}
