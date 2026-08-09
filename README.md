# Forge Gauntlet

Open quality-loop runtime for [Matt Shumer’s](https://github.com/mshumer) gauntlet method ([guide](https://somethingbig.ai/gauntlet-loop) · [Claude of Duty](https://github.com/mshumer/Claude-of-Duty)): named fetchable bar → fan-out builders → separate harsh critic → blind A/B → loop until win or you stop.

> Continuity: [`docs/HANDOFF.md`](docs/HANDOFF.md) · Technique: [`docs/TECHNIQUE.md`](docs/TECHNIQUE.md) · Site: [gauntlet-runtime.vercel.app](https://gauntlet-runtime.vercel.app)

## Quick start

```bash
npm install
npx playwright install chromium   # optional real screenshots
npm run gauntlet -- propose "a dark athletic landing page for a running brand"
npm run gauntlet -- meta --goal "…"            # Shumer meta-prompt
npm run gauntlet -- compose --bar a --goal "…" --agent claude-code
npm run gauntlet -- run --bar a --goal "…"
npm run gauntlet -- status
npm run gauntlet -- stop
npm run demo
npm run web    # http://localhost:8787 — local run UI

# Marketing site
cd site && npm install && npm run dev
```

## CLI

| Command                        | Purpose                                              |
| ------------------------------ | ---------------------------------------------------- |
| `propose "<goal>"`             | Offer 2–3 named bars, then stop                      |
| `meta --goal …`                | Shumer meta-prompt → draft a short aim prompt        |
| `compose --bar … --goal …`     | Orchestrator system prompt (paste into Claude/Codex) |
| `compose --plan file.md\|html` | Extract criteria/gates; emit prompt + ≤3 gap bullets |
| `run --bar … --goal …`         | Validate bar, ledger, builder↔critic loop            |
| `status` / `stop` / `resume`   | Live progress, human brake, continue                 |
| `shot --url …` / `compare a b` | Apex-style named captures + smoke compare            |
| `validate-bar` / `demo`        | Health check / end-to-end demo                       |

Useful `run` flags: `--mode apex`, `--climb`, `--vision-critic`, `--llm-critic`, `--dispatch-only`, `--max-usd`, `--max-tokens`, `--preview-url`, `--agent cursor|claude-code|codex`, `--implementer …`

Ledger: `runs/<id>/` → `progress.md`, `workbench.md`, `ORCHESTRATOR.md`, `CONTRACT.md` (apex), `evidence/`, `dispatch/`.

## Skill

```bash
mkdir -p ~/.cursor/skills/gauntlet && cp -R skill/* ~/.cursor/skills/gauntlet/
# npx skills add <this-repo>  → skills/gauntlet/
```

Triggers: `/gauntlet`, “beat this bar”, “compose gauntlet”, “gauntlet this plan”.

## Modes

- **Standard** — UI/sites/writing/code; exit when pieces win blind + smoothing, or you stop.
- **Apex / climb** — long runs (needs Claude Max / Codex plan). Writes `CONTRACT.md`. Human or budget is the real brake.
- **Compose / meta** — paste into another agent session; runtime keeps ledger + evidence when you run.

## Hard rules

1. Critic never sees builder rationale; fresh critic every retry.
2. Verdict binary: `ours` or `bar` + one gap. No 1–10.
3. Bar evidence fetched. Labels stripped.
4. Exit = wins + smoothing, human stop, or budget. **No default round cap.**
5. Human gates and budgets outrank “keep going.”

## Attribution

- Technique: [Matt Shumer](https://github.com/mshumer) · [somethingbig.ai/gauntlet-loop](https://somethingbig.ai/gauntlet-loop) · [Claude of Duty](https://github.com/mshumer/Claude-of-Duty)
- Role-split / gates: [NicholasSpisak/gauntlet-loop](https://github.com/NicholasSpisak/gauntlet-loop)
- Apex capture lessons: [jolbol1/apex-gp](https://github.com/jolbol1/apex-gp)

## License

MIT
