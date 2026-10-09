---
type: Decision
title: Rename app to mapmaker and strip research-chain docs (knowledge folded inline)
description: Context
tags: [rename, docs-cleanup, project-identity, repository-hygiene]
status: accepted
timestamp: "2026-10-09T14:43:40.311Z"
---

# Rename app to mapmaker and strip research-chain docs (knowledge folded inline)

## Context

The project folder was already named `mapmaker`, but the package identity, README, page title/header, and wiki still said `three-js-maps`. The repo also carried a build-time research chain (`research_plan.md`, `research_report.md`, `docs/findings_0..5_*.md`) that was process documentation, not app surface. The user asked to rename all app names to mapmaker and strip everything that isn't typical app surface/dependencies.

## Choice

- **Rename** `three-js-maps` → `mapmaker` in `package.json`, `package-lock.json`, `README.md`, and `src/routes/+page.svelte` (`<title>` + `<h1>`).
- **Delete** the research chain: `research_plan.md`, `research_report.md`, `docs/findings_0_user_brief.md` … `docs/findings_5_streaming.md`.
- **Fold knowledge inline**: before deleting, rewrite every source comment and README section that cited the findings files (in `projection.ts`, `extrude.ts`, `osmToScene.ts`, `overpass.ts`, `scripts/verify.mjs`, and the README "Design basis" section) so the knowledge survives inside the app surface itself.
- **Keep, deliberately**: `.pi/`, `docs/wiki/`, `.wiki_ignore` (agent tooling the user set up) and gitignored generated dirs (`node_modules/`, `build/`, `.svelte-kit/`, `data/`). These are not app surface but are not stripped.
- Also fixed a stale README port (dev server runs on **5231**, README said 5230).

## Alternatives considered

- **Archive the research docs** under `docs/research/` — rejected: they were one-time build-process artifacts whose valuable content is now folded inline; keeping them would re-pollute the app surface.
- **Keep the old package name** — rejected: it mismatched the folder name and the app's actual branding.
- **Strip the wiki/agent tooling too** — rejected: the user keeps those as working tooling, not app surface.

## Consequences

- The repo is clean app surface only; there is no research-chain folder to look for — the projection/extrusion/Overpass basis lives in source comments and the README "Design basis" section.
- Future cleanup passes must NOT delete `.pi/`, `docs/wiki/`, or `.wiki_ignore` under a "not app surface" rule.
- Verified: `npm run check` (0 errors), `npm run verify` (math self-check passed), `npm run build` green, and grep shows zero remaining references to `three-js-maps` or the deleted files.
