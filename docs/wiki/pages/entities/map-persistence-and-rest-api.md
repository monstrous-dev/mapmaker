---
type: Entity
title: Map persistence and REST API
description: Server-side subsystem that persists each generated map to its own SQLite file and exposes it over HTTP. One map = one file = one database under `data/maps/<mapI
tags: [persistence, sqlite, api, server]
timestamp: "2026-08-12T19:00:05.467Z"
---

# Map persistence and REST API

Server-side subsystem that persists each generated map to its own SQLite file and exposes it over HTTP. One map = one file = one database under `data/maps/<mapId>.sqlite`. This is the project's **first persistence layer** — until this turn the app had no database.

## Role

Lets generated maps survive a page reload, be listed/inspected by metadata, and be downloaded as a self-contained `.sqlite`. The download carries server-computed `area_m²` / `length_m` per element so the data is useful outside the app. Built on stdlib `node:sqlite` (decision record "Use stdlib node:sqlite for map persistence", in `decisions/`).

## Details

- **Location**: `src/lib/server/db.ts` (storage) + `src/routes/api/maps/+server.ts`, `src/routes/api/maps/[id]/+server.ts`, `src/routes/api/maps/[id]/download/+server.ts` (HTTP).
- **Schema** (per file):
  - `map` — `id` PK, `created_at`, bbox (`min/max_lng/lat`), element counts (`n_buildings/roads/water/green`).
  - `element` — `rowid`, `osm_type`, `osm_id`, `kind`, `name`, `height`, `min_height`, `width`, `area_m2`, `length_m`, `tags` (JSON), `geometry` (JSON); index on `kind`.
- **Endpoints**:
  - `POST /api/maps` — write/overwrite a map (`201`).
  - `GET /api/maps` — list all maps, newest-first.
  - `GET /api/maps/[id]` — metadata (`404` if unknown).
  - `GET /api/maps/[id]/download` — stream the `.sqlite` as `application/vnd.sqlite3`.
- **Trust boundary**: `mapId` is the only user-controlled path segment; `safeMapId()` restricts to `^[a-zA-Z0-9_-]{1,80}$` and rejects `..` → path-traversal returns `400`. `bbox` is validated; bad JSON → `400`; unknown id → `404`.
- **Configuration**: `MAPS_DIR = <cwd>/data/maps` (auto-created). Requires Node ≥ 22.5 for `node:sqlite`.
- **Measures**: computed server-side via `makeProjector` anchored at the bbox centre (same ENU anchor as the 3D render) — `area_m²` for polygons (minus holes), `length_m` for polylines.

## Relationships

- [merged-geometry-object-identity-per-vertex-objid](../concepts/merged-geometry-object-identity-per-vertex-objid.md) — the client picking that feeds the same object identity.
- Reuses `src/lib/projection.ts` (`makeProjector`) for server-side measures.

## Lifecycle

- First added: this turn — introduces the project's first persistence layer (overview previously stated "no database").
