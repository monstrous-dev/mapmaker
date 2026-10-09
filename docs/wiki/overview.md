---
type: System Overview
title: Overview
description: What this project contains and its structure.
timestamp: "2026-08-12T19:00:32.673Z"
---

# Overview

**mapmaker** is a pure-**Three.js** 3D map generator built on the SMB stack
(SvelteKit 2 + Svelte 5 runes + TypeScript strict + Vite + adapter-node). A user
draws a box or freehand polygon on a 2D world map, every OpenStreetMap element
inside that area is fetched **client-side** from the Overpass API, and the result is rendered as a
pure Three.js 3D scene — extruded building prisms, flat road ribbons, flat
water/park polygons, and a ground plane sized in real metres. There is **no
MapLibre in the 3D view** (MapLibre via `svelte-maplibre-gl` is used *only* for
the 2D area-selection map). Persisted maps live as **one SQLite file per map**
(`data/maps/<mapId>.sqlite`, written via the stdlib `node:sqlite`) — there is no
shared/central database. See [[map-persistence-and-rest-api]].

## How it works (four stages)

1. **Select** — `src/lib/components/Map.svelte` is the only MapLibre surface: a
   CARTO Positron base style with a **▢ Rectangle / ✎ Freeform** toggle. Rectangle
   is click-drag box-draw; Freeform is click-drag to trace a freehand polygon
   (release to finish, throttled to ~3px spacing). The drawn area is emitted as an
   `Area` (`src/lib/types.ts`): `{ type: 'bbox'; bbox }` or
   `{ type: 'polygon'; ring }`. A freeform polygon is resolved at generate time by
   querying its bbox and client-side filtering — see
   [[freeform-area-selection-via-bbox-query-client-side-point-in-]].
2. **Generate** — `src/lib/overpass.ts` tiles the bbox into ~0.05° cells, queries
   each cell against public Overpass mirrors (CORS-enabled, key-free), subdivides
   heavy cells (406/413/504) ×4 and retries, dedupes border elements by OSM id,
   and fails over across mirrors with independent per-IP rate buckets plus a
   per-mirror `AbortController` timeout. `src/routes/+page.svelte` runs the
   extraction with an asymptotic progress bar that creeps toward 99% and only
   shows 100% when the scene is rendered.
3. **Render** — `src/lib/osmToScene.ts` classifies raw OSM elements into a
   `SceneData` descriptor (buildings with heights, roads with per-class widths,
   flat water/green polygons). `src/lib/components/ThreeMap.svelte` projects
   lon/lat → local metres (`src/lib/projection.ts`, equirectangular ENU anchored
   at the bbox center), extrudes buildings (`src/lib/extrude.ts`), merges one
   `BufferGeometry` per category (stamping a per-vertex `objId` so merged meshes
   stay individually clickable — see [[merged-geometry-object-identity-per-vertex-objid]]),
   paints a height-ramp vertex color on buildings, and flies an `OrbitControls`
   camera through 5 presets (top/iso/low/high/side, top-down default) plus
   rotate/tilt nudges (`src/lib/view.ts`).
4. **Persist & inspect** — on generate the scene is `POST`ed to
   `POST /api/maps`, which writes the per-map SQLite file with server-computed
   `area_m²` / `length_m` per element (`src/lib/server/db.ts`). Clicking any
   object raycasts back to its OSM identity and opens a slide-in
   `src/lib/components/InfoDrawer.svelte` (name, OSM type/id + openstreetmap.org
   link, derived stats from `src/lib/measure.ts`, full tag set, and the map's
   SQLite download). Endpoints: `GET /api/maps` (list), `GET /api/maps/[id]`
   (meta), `GET /api/maps/[id]/download` (file).

## Source layout

Application code lives in `src/lib/` plus the page and API routes in
`src/routes/`. Everything is `strict` TypeScript:

- **Domain modules** (`src/lib/`): `projection.ts`, `extrude.ts`, `osmToScene.ts`,
  `overpass.ts`, `clip.ts` (freeform-selection geometry: bbox-of-ring + even-odd
  point-in-polygon + keep-if-any-node-inside), `types.ts`, plus `measure.ts`
  (local-metre area/length/format helpers for the drawer) and `view.ts` (the
  imperative camera `ViewController` API). `src/lib/server/db.ts` is the
  **server-only** SQLite persistence module.
- **Components** (`src/lib/components/`): `Map.svelte` (2D selection),
  `ThreeMap.svelte` (3D viewport + picking + camera), `InfoDrawer.svelte`
  (inspect/download panel).
- **Routes** (`src/routes/`): `+page.svelte` (orchestrates select → generate →
  render → persist) and `src/routes/api/maps/` (the REST surface).

The math-heavy modules (`projection.ts`, `extrude.ts`, `osmToScene.ts`) are kept
**erasable-syntax-only** (no enums/namespaces) so that `scripts/verify.mjs`
(`npm run verify`) can import them directly via Node ≥ 22.18 type stripping — a
pure-Node self-check that pins the projection/extrusion orientation, which
`svelte-check` cannot catch. `vite.config.ts` excludes `svelte-maplibre-gl` /
`maplibre-gl` from the dependency optimizer so the MapLibre v6 worker registers
correctly.

## Research basis

The pipeline was researched before implementation (the research-chain markdown
files were stripped in 2026-10 once the findings were folded into the code and
README "Design basis" section). Key basis: the projection + extrusion math cheat
sheet implemented in `projection.ts` / `extrude.ts`, and the Overpass
client-side streaming gotchas implemented in `overpass.ts`. Conventions were
lifted from the sibling `../base-map-gen` project (Overpass tiling/failover and
the selection-map).
