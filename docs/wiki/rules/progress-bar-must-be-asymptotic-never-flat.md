---
type: Rule
title: Progress bar must be asymptotic, never flat
description: Guideline
tags: [ux, frontend, convention]
timestamp: "2026-08-12T18:23:13.160Z"
---

# Progress bar must be asymptotic, never flat

## Guideline

The generation progress bar (`src/routes/+page.svelte`) must be **asymptotic**:
it creeps toward a cap that rises with real cell progress (maximum 99%), never
holds flat for long, and reaches **100% only once the scene is rendered**.

## When it applies

Any UI that reports progress for the Overpass fetch + scene-build pipeline.

## Rationale

Client-side Overpass extraction is variable-latency: cells subdivide and retry,
mirrors fail over, and rendering is a separate stage after the last cell.
A bar that fills to 100% at "fetch done" then freezes during rendering looks
broken. The asymptotic rule keeps the bar moving honestly toward the *actual*
milestone the user cares about — a visible scene — and only completes there.

## How to honor it

- Cap the bar below 100% during fetch; raise the cap as real cell progress
  increases.
- Keep the bar creeping (never constant) so the app never appears hung.
- Set 100% only after `ThreeMap` finishes its first render.
