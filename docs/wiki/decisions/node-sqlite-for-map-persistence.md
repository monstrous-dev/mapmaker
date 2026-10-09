---
type: Decision
title: "Use stdlib node:sqlite for map persistence (not better-sqlite3)"
description: Context
tags: [architecture, persistence, sqlite, dependencies]
status: accepted
timestamp: "2026-08-12T19:00:05.467Z"
---

# Use stdlib node:sqlite for map persistence (not better-sqlite3)

## Context

`mapmaker` builds a `SceneData` descriptor (buildings / roads / water / green with tags + geometry) entirely client-side from Overpass and renders it in Three.js. Until this turn nothing was persisted — regenerating meant re-querying Overpass. The new inspect-and-download feature needs to (a) store the full scene with server-computed area/length measures and (b) let the user download one self-contained file per map.

## Choice

Persist each generated map to its **own SQLite file** (`data/maps/<mapId>.sqlite`) using the standard-library **`node:sqlite`** (`DatabaseSync`), exposed through a small REST surface under `/api/maps`. One map = one file = one database; schema is two tables (`map` meta + `element` rows carrying tags/geometry JSON and server-computed `area_m2` / `length_m`). See [[map-persistence-and-rest-api]].

## Alternatives considered

- **`better-sqlite3`** — most popular, but a native addon: `node-gyp` build step, per-platform prebuilt binaries, larger supply-chain surface. Overkill for write-once-read-many per-map files.
- **`sql.js` (WASM)** — pure JS but ships ~1 MB of SQLite WASM, is in-memory only (you serialize to disk yourself), and is slower.
- **Plain JSON files** — simplest, but no typed columns / queryability / measures, and re-reading large scenes is wasteful.

## Rationale

`node:sqlite` ships in Node ≥ 22.5 (unflagged on ≥ 23.4 / 24.x, and the project already targets Node 24). **Zero new runtime deps** — the only addition was `@types/node` (dev) because the project previously had no node-builtin types. The synchronous `DatabaseSync` API is fine here (single write on generate; small reads on meta/list/download). One-file-per-map keeps maps isolated, trivially deletable, and directly downloadable as `application/vnd.sqlite3`.

## Consequences

- Runtime requires **Node ≥ 22.5**.
- The module is **server-only** (imports `node:sqlite`) and lives under `src/lib/server/` — it must never be imported from client code.
- `mapId` is the sole user-controlled path segment; `safeMapId()` slug-validates it (`^[a-zA-Z0-9_-]{1,80}$`, rejects `..`) — this is the file-path trust boundary, path-traversal tested → 400.
