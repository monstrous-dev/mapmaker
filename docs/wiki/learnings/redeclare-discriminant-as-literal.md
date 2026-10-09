---
type: Learning
title: Redeclare the discriminant field as a literal on each union variant
description: "In `src/lib/osmToScene.ts`, `BuildingPrism` / `RoadLine` / `FlatPoly` extend `MapObjectBase`, whose `kind: ObjectKind` is the broad union `'building' | 'road' |"
tags: [typescript, types, gotcha]
timestamp: "2026-08-12T19:00:05.467Z"
---

# Redeclare the discriminant field as a literal on each union variant

In `src/lib/osmToScene.ts`, `BuildingPrism` / `RoadLine` / `FlatPoly` extend `MapObjectBase`, whose `kind: ObjectKind` is the broad union `'building' | 'road' | 'water' | 'green' | 'map'`. **Inheriting that broad type means each subclass's `kind` is still the full union**, so `SceneObject = BuildingPrism | RoadLine | FlatPoly` is *not* a real discriminated union: a `switch (o.kind)` won't narrow `o` to the right variant, and `o.outer` / `o.points` won't type-check under the branch you expect.

## Fix

Redeclare `kind` as a **literal** on each variant:

- `BuildingPrism { kind: 'building'; ... }`
- `RoadLine { kind: 'road'; ... }`
- `FlatPoly { kind: 'water' | 'green'; ... }` (narrows `MapObjectBase.kind`)

Then TypeScript narrows correctly per branch.

## Why it bit us

The base interface looked "typed enough" because `kind` had a named union type, so the missing per-variant literal was invisible until code tried to branch on it. General TS rule, but it surfaced here on the scene-object model — the fix lives in `src/lib/osmToScene.ts`.
