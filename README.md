# Gauntlet Runtime

**Not another multi-model chat. A quality loop that won’t stop until it beats a real bar.**

Skill + harness for [Matt Shumer’s](https://github.com/mshumer) gauntlet loop ([Claude of Duty](https://github.com/mshumer/Claude-of-Duty)): named fetchable bar → fan-out builders → separate harsh critic → blind A/B → loop until win or you stop.

This is **not** [trygauntlet.com](https://www.trygauntlet.com/) (multi-LLM aggregator). We sell enforced standards + evidence.

> Continuity for agents: [`docs/HANDOFF.md`](docs/HANDOFF.md) · Technique: [`docs/TECHNIQUE.md`](docs/TECHNIQUE.md)

## Quick start

```bash
npm install
npx playwright install chromium   # optional real screenshots
npm run gauntlet -- propose "a dark athletic landing page for a running brand"
npm run gauntlet -- compose --bar a --goal "…" --agent claude-code
npm run gauntlet -- run --bar a --goal "…"
npm run gauntlet -- status
npm run gauntlet -- stop
npm run demo
npm run web    # http://localhost:8787 — 4-step local UI
```

## CLI

| Command                        | Purpose                                                     |
| ------------------------------ | ----------------------------------------------------------- |
| `propose "<goal>"`             | Offer 2–3 named bars, then stop                             |
| `compose --bar … --goal …`     | Spisak-shaped orchestrator prompt (paste into Claude/Codex) |
| `compose --plan file.md        | html`                                                       | Extract criteria/gates; emit prompt + ≤3 gap bullets |
| `run --bar … --goal …`         | Validate bar, ledger, builder↔critic loop                   |
| `status` / `stop` / `resume`   | Live progress, human brake, continue                        |
| `shot --url …` / `compare a b` | Apex-style named captures + smoke compare                   |
| `validate-bar` / `demo`        | Health check / end-to-end demo                              |

Useful `run` flags: `--mode apex`, `--climb`, `--vision-critic`, `--llm-critic`, `--dispatch-only`, `--max-usd`, `--max-tokens`, `--preview-url`, `--agent cursor|claude-code|codex`, `--implementer …`

Ledger: `runs/<id>/` → `progress.md`, `workbench.md`, `ORCHESTRATOR.md`, `CONTRACT.md` (apex), `evidence/`, `dispatch/`.

## Skill

```bash
# Cursor / Claude Code skill install
mkdir -p ~/.cursor/skills/gauntlet && cp -R skill/* ~/.cursor/skills/gauntlet/
# Or skills-add layout:
# npx skills add <this-repo>  → skills/gauntlet/
```

Triggers: `/gauntlet`, “beat this bar”, “compose gauntlet”, “gauntlet this plan”.

## Modes

- **Standard** — UI/sites/writing/code; exit when pieces win blind or you stop.
- **Apex / climb** — long runs (needs Claude Max / Codex plan for token volume). Writes `CONTRACT.md`. Human or budget is the real brake. Inspired by [apex-gp](https://github.com/jolbol1/apex-gp) (~22M tokens / ~19h) — **protocol is ready; full apex parity (GPU edge-energy compare, CLI agent spawn) is not claimed yet.**
- **Compose / dispatch** — paste `ORCHESTRATOR.md` into an agent; runtime keeps ledger + evidence.

## Hard rules

1. Critic never sees builder rationale; fresh critic every retry.
2. Binary `ours \| bar` + one gap — no 1–10.
3. Bar must be fetched (fail closed).
4. No default `maxRounds`. You are the brake.
5. Human gates and budgets outrank “keep going.”

## vs prompt-only forks

|                             | RoboNuggets | Duola        | Spisak          | **This repo** |
| --------------------------- | ----------- | ------------ | --------------- | ------------- |
| Aim / orchestrator prompt   | Yes         | Fill+run     | Strong compose  | Yes           |
| Bar health in code          | No          | No           | No              | **Yes**       |
| Evidence + blind A/B ledger | No          | Anti-harness | No              | **Yes**       |
| Stop / resume / budget      | No          | Human only   | Gates in prompt | **Yes**       |

## Test checklist (you)

```bash
npm test                 # unit + web + CLI integration
npm run canary           # dry offline canary (no token spend)
npm run ci               # build + test + canary + audit
npm run gauntlet -- doctor
npm run demo
npm run gauntlet -- run --goal "…" --bar https://example.com --bar-name example.com --spawn-agent --spawn-dry --max-rounds 2
# Live tokens (costs money — explicit opt-in):
#   GAUNTLET_LIVE_CANARY=1 OPENROUTER_API_KEY=… npm run canary -- --live
#   npm run gauntlet -- run … --vision-critic
#   npm run gauntlet -- run … --spawn-agent --agent claude-code
npm run gauntlet -- compare a.png b.png --grid 6
GAUNTLET_WEB_ALLOW_ANON=1 npm run web   # http://127.0.0.1:8787
```

CI: `.github/workflows/ci.yml` runs build, tests, dry canary, and `npm audit`.

Optional: `.env` from `.env.example` (`OPENROUTER_API_KEY`, `GAUNTLET_WEB_TOKEN`, `STRIPE_*`).

## Apex prerequisites (honest)

- Strong model + high token budget (Max / Codex)
- `--vision-critic` + `OPENROUTER_API_KEY` (or wire your own)
- Real implementers via paste/`--dispatch-only` (local stub is for demos)
- For WebGL games: project-level `window.__GAUNTLET__` capture (see CONTRACT.md) — smoke `shot`/`compare` ≠ apex `compare.mjs`

## Attribution

- Technique: **Matt Shumer**
- Prompt packaging: [robonuggets](https://github.com/robonuggets/gauntlet-loop), [duolahypercho](https://github.com/duolahypercho/gauntlet-loop)
- Role-split / gates / delegation: [NicholasSpisak/gauntlet-loop](https://github.com/NicholasSpisak/gauntlet-loop)
- Long-run harness lessons: [jolbol1/apex-gp](https://github.com/jolbol1/apex-gp)

## License

MIT. Credit Matt Shumer for the technique in public materials.
