---
okf_version: "0.1"
---

# Project Knowledge Wiki

<!-- wiki-nav:start -->
## Navigation map

Auto-generated detailed index of every docs/wiki/ concept — the map the LLM uses to locate information. 14 concept(s). Regenerated on init and on wiki_mark_synced. Generated 2026-10-09T14:40:35.511Z.

Each entry: [title](concept-id.md) — description. Links are clickable in /wiki; pass the concept-id (link target minus .md) to wiki_get.

### Core concepts

- [Glossary](glossary.md) — Key terms for this project.
- [Overview](overview.md) — What this project contains and its structure.

### Architecture

- [File tree](architecture/file-tree.md) — Complete project file listing with per-file descriptions.

### Pages

- [Merged-geometry object identity (per-vertex objId)](pages/concepts/merged-geometry-object-identity-per-vertex-objid.md) — What is it?
- [Map persistence and REST API](pages/entities/map-persistence-and-rest-api.md) — Server-side subsystem that persists each generated map to its own SQLite file and exposes it over HTTP. One map = one file = one database under `data/maps/<mapI
- [Standalone map route (/map/[mapId])](pages/entities/standalone-map-route-map-mapid.md) — A full-viewport SSR route that renders **one persisted map** with just the 3D
- [Page Templates](pages/TEMPLATES.md) — Reference templates for Concept, Entity, and Artifact pages. Follow these when using wiki_note_page.

### Decisions

- [Freeform area selection via bbox query + client-side point-in-polygon filter](decisions/freeform-area-selection-via-bbox-query-client-side-point-in-.md) — Context
- [Use stdlib node:sqlite for map persistence (not better-sqlite3)](decisions/node-sqlite-for-map-persistence.md) — Context
- [Pure Three.js 3D view (no MapLibre)](decisions/pure-three-js-3d-view-no-maplibre.md) — Context

### Rules

- [Highlight picked 3D objects in Three.js, not via CSS](rules/highlight-picked-3d-objects-in-three-js-not-via-css.md) — Guideline
- [Keep math modules erasable-syntax-only](rules/keep-math-modules-erasable-syntax-only.md) — Guideline
- [Progress bar must be asymptotic, never flat](rules/progress-bar-must-be-asymptotic-never-flat.md) — Guideline

### Learnings

- [Redeclare the discriminant field as a literal on each union variant](learnings/redeclare-discriminant-as-literal.md) — In `src/lib/osmToScene.ts`, `BuildingPrism` / `RoadLine` / `FlatPoly` extend `MapObjectBase`, whose `kind: ObjectKind` is the broad union `'building' | 'road' |
<!-- wiki-nav:end -->

An [OKF](https://github.com/earendil-works/okf) bundle documenting this project.

- [Overview](./overview.md) — What this project contains and its structure
- [File tree](./architecture/file-tree.md) — Complete project file listing
- [Glossary](./glossary.md) — Key terms for this project
- [Decisions](./decisions/) — Major decisions and direction shifts (ADRs)
- [Rules](./rules/) — Reusable heuristics, guidelines, and conventions
- [Pages](./pages/) — Concepts, entities, and artifacts of this project
- [Learnings](./learnings/) — Captured learnings and insights
- [Preferences](./preferences/) — Captured preferences and conventions
