# Design — Forge Gauntlet

Locked design system for the marketing site. Page redesigns read this before emitting code.

## Genre

atmospheric

## Macrostructure family

- Marketing pages: **Narrative Workflow** (stage timeline). Alternate allowed: Manifesto for belief-led strips only.
- App pages: Workbench (when added)
- Content pages: Long Document (when added)

## Theme

Dark forge paper · acid-lime accent (≤5% of viewport) · ember for Win/stop only.
Accent on CTAs, thin rules, stage numerals — never the full display brand word.

- `--color-paper` oklch(8% 0.01 145)
- `--color-paper-2` oklch(12% 0.012 145)
- `--color-ink` oklch(95% 0.015 120)
- `--color-ink-2` oklch(72% 0.02 125)
- `--color-ink-faint` oklch(62% 0.02 145)
- `--color-rule` oklch(22% 0.015 145)
- `--color-accent` oklch(92% 0.21 120)
- `--color-accent-ink` oklch(12% 0.02 145)
- `--color-focus` oklch(92% 0.21 120)
- `--color-ember` oklch(68% 0.18 40)
- `--color-bone` oklch(92% 0.02 95)

## Typography

- Display: Big Shoulders Display, weight 800–900, style **normal** (never italic headers)
- Body: Instrument Sans, weight 400–500
- Mono: Fragment Mono, weight 400–500
- Display tracking: -0.02em to -0.03em
- Type scale anchor: `--text-display` = clamp(3.5rem, 12vw, 9rem)

## Spacing

4-point named scale in `site/tokens.css`. Pages use named tokens only.

## Motion

- Easings: `--ease-out: cubic-bezier(0.16, 1, 0.3, 1)`
- Reveal: **one** hero opacity fade only; no staggered stack
- Reduced-motion: opacity-only ≤150ms

## Microinteractions stance

- silent success
- hover delay n/a on marketing; focus delay 0ms
- no glass / backdrop-blur chrome
- instant `:focus-visible` ring ≥3:1

## CTA voice

- Primary: solid accent fill, square corners (0 radius), mono label
- Secondary: 1px rule border, transparent fill, no blur

## Nav / Footer

- Nav: **N9 Edge-aligned** (brand left edge, links right edge, no pill/blur)
- Footer: **Ft5 Statement** (one closing sentence + MIT/GitHub)

## What pages MUST share

- Wordmark “Forge Gauntlet” + mark.png
- Accent lime placement discipline
- Display + body + mono fonts
- Square CTA voice
- No section eyebrows / kickers (except true stage numerals in Narrative Workflow)

## What pages MAY differ on

- Stage count / copy within Narrative Workflow
- Hero photo crop
- Install block presence

## Exports

See `site/tokens.css`.
