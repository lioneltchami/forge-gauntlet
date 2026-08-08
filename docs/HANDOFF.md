# HANDOFF — Gauntlet Runtime

**Updated:** 2026-08-08 (Spisak adoptions: plan extract, smoothing, adversarial, workbench)  
**Repo:** `/Users/lionel/builders/gauntlet` · **Version:** 0.2.0

## Ready to test

```bash
cd /Users/lionel/builders/gauntlet
npm test          # 69 passing
npm run ci
npm run gauntlet -- doctor
npm run demo
npm run web       # http://localhost:8787
```

### What you can exercise now

| Feature                                 | How                                                                              |
| --------------------------------------- | -------------------------------------------------------------------------------- |
| Propose / compose / run / stop / resume | CLI as before                                                                    |
| **Compose from plan**                   | `compose --plan plan.md\|spec.html --bar a --goal "…" [--json]`                  |
| **Smoothing + adversarial**             | Enforced after blind wins; risky piece names / `--` criteria via compose         |
| **Workbench findings**                  | `runs/<id>/workbench.md` — rounds, verdict, open findings, smoothing             |
| **Skills packaging**                    | `skills/gauntlet/` for `npx skills add`; also `skill/`                           |
| **Spawn Claude/Codex**                  | `--spawn-agent --spawn-dry` (safe) or `--spawn-agent` (live)                     |
| **Vision critic**                       | `export OPENROUTER_API_KEY=…` then `--vision-critic` (auto if key set)           |
| **Edge-energy compare**                 | `gauntlet compare a.png b.png --grid 6`                                          |
| **Stripe / auth**                       | `.env.example`; checkout placeholder without key; webhook + bearer auth when set |
| Web 4-step UX                           | `npm run web`                                                                    |

`doctor` on this machine found **claude** + **codex** on PATH. `OPENROUTER_API_KEY` / Stripe keys were unset — vision/Stripe live paths need your secrets.

## Done vs open

| Item                                                  | Status                              |
| ----------------------------------------------------- | ----------------------------------- |
| P0/P1 polish + web shell                              | Done                                |
| P2 spawn adapters + dry-run                           | Done                                |
| P2 vision auto + graceful fallback                    | Done                                |
| P3 apex grid edge-energy compare                      | Done (PNG / pngjs)                  |
| P4 Stripe REST checkout + webhook verify + web bearer | Done (live when keys set)           |
| Spisak: plan/HTML + DERIVED gaps                      | Done                                |
| Spisak: smoothing + adversarial + criteria map        | Done                                |
| Spisak: workbench findings + skills packaging         | Done                                |
| P5 full Nike/F1 proof with paid tokens                | **You** — needs Max plan + keys     |
| CDP WebGL pause/renderFrame                           | Still project-level (`CONTRACT.md`) |

## Mission (unchanged)

Quality-loop runtime (not trygauntlet multi-chat). Beat a real bar. Apex-scale needs your model plan.

## Attribution

Matt Shumer · RoboNuggets / Duola · Nicholas Spisak · jolbol1/apex-gp
