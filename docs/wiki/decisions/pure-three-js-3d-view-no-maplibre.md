---
type: Decision
title: Pure Three.js 3D view (no MapLibre)
description: Context
tags: [architecture, rendering, three-js]
status: accepted
timestamp: "2026-08-12T18:24:37.399Z"
---

# Pure Three.js 3D view (no MapLibre)

## Context

The project generates a 3D map of any user-selected area on Earth by fetching
OpenStreetMap data client-side and rendering it. Two rendering approaches were
researched before implementation (see the README "Design basis" section):

- **A. MapLibre GL / Mapbox-style 3D** — reuse a mature 3D globe engine that
  already tiles/serves vector + terrain data.
- **B. Pure Three.js** — fetch raw OSM via the Overpass API and build the scene
  by hand (extruded buildings, flat ribbons, flat polygons) on a ground plane
  sized in real metres.

## Choice

**Option B — pure Three.js.** MapLibre (via `svelte-maplibre-gl`) is used *only*
for the 2D area-selection map (`src/lib/components/Map.svelte`); the 3D render
stage (`src/lib/components/ThreeMap.svelte`) is pure Three.js with no MapLibre
dependency.

## Rationale

- **No data-source coupling**: pure Three.js renders only the elements the user
  selected, fetched directly from Overpass. A MapLibre 3D engine would bind the
  result to a tile/terrain provider and its coordinate system.
- **Full control over geometry**: extrusion depth, per-class road widths, flat
  water/park polygons, and the building height-ramp vertex colors are all
  hand-built — none of which a tile-consuming engine exposes cheaply.
- **Self-contained, deterministic output**: the scene is a function of the bbox
  + OSM data with no network tile fetching at render time, so it can be exported
  or inspected as plain geometry.
- **No API keys / no database**: matches the SMB-stack, key-free,
  client-side-only constraint.

## Consequences

- The math pipeline (ENU projection in `src/lib/projection.ts` + extrusion in
  `src/lib/extrude.ts`) must be implemented and kept correct — see
  [[keep-math-modules-erasable-syntax-only]] and `npm run verify`.
- MapLibre is deliberately excluded from the dependency optimizer in
  `vite.config.ts` so its v6 worker registers correctly.
- Raw OSM is classified into the `SceneData` descriptor in `src/lib/osmToScene.ts`.

## Alternatives considered

MapLibre/Mapbox GL 3D, deck.gl, Cesium — all rejected for binding output to a
tile/terrain provider and hiding the geometry the project needs to control.
