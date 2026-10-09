---
type: Rule
title: Highlight picked 3D objects in Three.js, not via CSS
description: Guideline
tags: [three-js, webgl, selection, ui]
timestamp: "2026-08-12T19:09:15.809Z"
---

# Highlight picked 3D objects in Three.js, not via CSS

## Guideline

Per-object styling in the 3D view (selected / hovered buildings, roads, or flats)
must be done **inside Three.js** — never via CSS classes or ids on the objects.

The project's chosen implementation: rebuild a single `THREE.LineSegments` from
`EdgesGeometry` of the selected object's own geometry, drawn in a highlight
colour, on every `selectedObj` change. No un-merging of the merged category
meshes, no custom shaders, no separate outline pass.

## When it applies

Any time you want to visually distinguish a picked element in the 3D viewport
(`ThreeMap.svelte`).

## Rationale

The entire 3D scene renders into **one WebGL `<canvas>` DOM node**. CSS can
target the canvas itself, but has no access to individual meshes inside it —
this is a fundamental WebGL limit, not a Three.js choice, so CSS-based
"per-object selection" is impossible regardless of class/id tags.

DOM-side chrome around the viewport (toolbar, [[info-drawer]], corner links)
uses normal CSS classes as usual.

## Known ceiling

Edges-only: a filled / translucent selection tint would need depth-offset
handling to avoid z-fighting against the merged surface. Add that only if edge
highlighting proves insufficient. Marked in code as a deliberate simplification.

## Evidence

- `src/lib/components/ThreeMap.svelte` — `setHighlight()` / `clearHighlight()`
  rebuild the `LineSegments` overlay from the selected object's geometry; the
  `HL_MAT` constant holds the highlight material.
