---
type: Entity
title: "Standalone map route (/map/[mapId])"
description: A full-viewport SSR route that renders **one persisted map** with just the 3D
tags: [route, sveltekit, ssr, maps, persistence]
timestamp: "2026-08-12T19:09:15.809Z"
---

# Standalone map route (/map/[mapId])

A full-viewport SSR route that renders **one persisted map** with just the 3D
viewport — no area-selection map, no generator. The URL is shareable, opens in a
new tab, and survives a refresh, because it loads straight from the map's own
SQLite file.

## Why it matters

Before this route, a generated map only existed in memory on the main page.
`/map/[mapId]` makes a saved map a **first-class, linkable resource**: the corner
`↗` link on the main page points here, and any `/api/maps/[id]` mapId resolves to
a real page. It shares the same camera presets and the **InfoDrawer** panel as the main
view so the map stays usable.

## Details

- **Location**:
  - `src/routes/map/[id]/+page.server.ts` — `PageServerLoad`: normalizes the id
    via `safeMapId`, calls `readMapScene(id)`, throws `error(404, …)` when the id
    is malformed or no map exists (handles traversal and unknown ids).
  - `src/routes/map/[id]/+page.svelte` — fixed full-screen layout; camera-preset
    bar + rotate/tilt nudges; `← Back` link to `/`. `scene` is `$derived(data.scene)`
    (data is reactive, so the capture must be reactive too).
- **Data source**: `readMapScene(id)` in `src/lib/server/db.ts` — the inverse of
  the write path. Reads the `map` row + every `element` row, `JSON.parse`s each
  row's `tags` / `geometry`, and reconstructs a full `SceneData` (buildings,
  roads, flats with heights/widths/holes/names). Returns `null` when the map
  file is absent. Uses `readOnly` SQLite.
- **Entry point on the main page**: `src/routes/+page.svelte` renders an
  `<a class="ext" href="/map/${scene.meta.mapId}" target="_blank" rel="noopener">↗</a>`
  in the top-right corner of the 3D viewport.
- **Passes through**: `selectedObj` highlight to `ThreeMap` so the standalone
  page gets the same per-object selection feedback as the main page.

## Relationships

- `[map-persistence-and-rest-api](./map-persistence-and-rest-api.md)` — the REST surface
  (`GET /api/maps/[id]`, `…/download`) this route parallels; both read the same
  per-map SQLite files.
- **ThreeMap** (`src/lib/components/ThreeMap.svelte`) — the 3D component rendered full-viewport.
- **InfoDrawer** (`src/lib/components/InfoDrawer.svelte`) — inspect/download panel reused unchanged.

## Lifecycle

- First added: this turn, to satisfy "page with only the map in it" plus an
  external link in the corner of the main 3D view. Reconstructing `SceneData`
  from SQLite required the new `readMapScene` loader.
