---
type: Rule
title: Keep math modules erasable-syntax-only
description: Guideline
tags: [typescript, tooling, convention]
timestamp: "2026-08-12T18:23:13.160Z"
---

# Keep math modules erasable-syntax-only

## Guideline

The math-heavy modules — `src/lib/projection.ts`, `src/lib/extrude.ts`, and
`src/lib/osmToScene.ts` — must stay **erasable-syntax-only**: no TypeScript
`enum`s, no `namespace`s, and nothing else that requires real type
transpilation rather than type *stripping*.

## When it applies

Any edit to those three files. Equivalent modules added later that
`scripts/verify.mjs` should round-trip should follow the same constraint.

## Rationale

`npm run verify` (`scripts/verify.mjs`) imports these files directly via Node
≥ 22.18 native type stripping. Node's type *stripper* can erase type
annotations, type imports, and `as` casts, but it **cannot** transform
`enum`/`namespace` declarations — those are real runtime constructs that need
compilation. Adding one breaks `verify`, which is the only check that pins
projection scale, axis orientation, winding normalization, and the height
ladder — things `svelte-check` cannot catch.

## How to honor it

- Prefer `const` unions / object maps over `enum`.
- Prefer module-scope functions/objects over `namespace`.
- If a construct requires real transpilation, move it to a *different* file and
  import the result.

## Source

- `scripts/verify.mjs` — the pure-Node self-check that runs these files.
- [[pure-three-js-3d-view-no-maplibre]] — why this pipeline exists at all.
