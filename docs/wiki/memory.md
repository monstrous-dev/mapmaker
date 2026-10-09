---
okf_version: "0.1"
---

<!-- wiki-memory:start -->
# Memory — the live contract

Auto-generated digest of the most recent conventions, decisions, rules and
development patterns, plus architecture and global patterns — newest first.
The actual files live in the wiki subfolders; follow the links (clickable in /wiki).
Regenerated on every wiki write and on wiki_mark_synced. Generated 2026-10-09T14:43:40.319Z.

## Recent Decisions

- [Rename app to mapmaker and strip research-chain docs (knowledge folded inline)](decisions/rename-app-to-mapmaker-and-strip-research-chain-docs-knowled.md) — Context (2026-10-09)
- [Freeform area selection via bbox query + client-side point-in-polygon filter](decisions/freeform-area-selection-via-bbox-query-client-side-point-in-.md) — Context (2026-08-12)
- [Use stdlib node:sqlite for map persistence (not better-sqlite3)](decisions/node-sqlite-for-map-persistence.md) — Context (2026-08-12)
- [Pure Three.js 3D view (no MapLibre)](decisions/pure-three-js-3d-view-no-maplibre.md) — Context (2026-08-12)

## Active Rules

- [Fold knowledge inline before deleting referenced docs](rules/fold-knowledge-inline-before-deleting-referenced-docs.md) — Guideline (2026-10-09)
- [Highlight picked 3D objects in Three.js, not via CSS](rules/highlight-picked-3d-objects-in-three-js-not-via-css.md) — Guideline (2026-08-12)
- [Keep math modules erasable-syntax-only](rules/keep-math-modules-erasable-syntax-only.md) — Guideline (2026-08-12)
- [Progress bar must be asymptotic, never flat](rules/progress-bar-must-be-asymptotic-never-flat.md) — Guideline (2026-08-12)

## Recent Learnings — development patterns

- [Redeclare the discriminant field as a literal on each union variant](learnings/redeclare-discriminant-as-literal.md) — In `src/lib/osmToScene.ts`, `BuildingPrism` / `RoadLine` / `FlatPoly` extend `MapObjectBase`, whose `kind: ObjectKind` is the broad union `'… (2026-08-12)

## Architecture

- [File tree](architecture/file-tree.md) — Complete project file listing with per-file descriptions. (2026-08-12)

## Global Patterns

- [Merged-geometry object identity (per-vertex objId)](pages/concepts/merged-geometry-object-identity-per-vertex-objid.md) — What is it? (2026-08-12)

<!-- wiki-memory:end -->
