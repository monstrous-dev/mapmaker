---
type: Glossary
title: Glossary
description: Key terms for this project.
timestamp: "2026-08-12T18:19:33.480Z"
---

# Glossary

| Term | Definition |
|------|------------|
| SMB stack | The project's web stack: SvelteKit 2 + Svelte 5 (runes) + TypeScript strict + Vite + adapter-node. No database. |
| BBox | Bounding box `{ minLng, minLat, maxLng, maxLat }` (`src/lib/types.ts`) — the user-selected area and the unit Overpass is tiled against. |
| Overpass API | A read-only API over OpenStreetMap data; queried client-side (CORS-enabled, key-free) for every element inside the bbox. |
| Overpass mirror | One public Overpass endpoint (`overpass-api.de`, `kumi.systems`, `private.coffee`). Each has an independent per-IP rate budget, so failover rotates across them. |
| Cell / tiling | The bbox is split into ~0.05° (~5 km) cells (capped at ≤16) so public mirrors answer fast; heavy cells are subdivided ×4 and retried. |
| OSM element | A node, way, or relation from OpenStreetMap. Ways and relations are returned by Overpass `out geom;` with inline geometry. |
| Multipolygon | An OSM relation with `outer`/`inner` member rings; buildings and water/parks use the largest closed outer ring plus inner rings as holes. |
| ENU projection | East-North-Up local projection: lon/lat → metres `{ x: east, y: north }` anchored at the bbox center. Implemented as an equirectangular approximation. |
| Equirectangular (Option B) | The chosen projection: `xEast = (lon−lon0)·(π/180)·R·cos(lat0)`, `yNorth = (lat−lat0)·(π/180)·R`. `cos(lat)` frozen at the anchor. |
| Shape → ExtrudeGeometry | Three.js recipe: build a `THREE.Shape` in local metres, extrude with `depth = h − hMin`, then `rotateX(−π/2)` so north maps to −Z and height to +Y up. |
| Winding normalization | Outer rings must be CCW and holes CW for correct normals; `ShapeUtils.isClockWise` flips OSM rings of unknown winding. |
| Height fallback ladder | `height ?? 3·(building:levels ?? 1) [+ 3·roof:levels]`, `min_height ?? 3·building:min_level`, clamped 0–500 m; if depth ≤ 0 the min height is dropped. |
| SceneData | The classified scene descriptor (`src/lib/osmScene.ts`): `buildings`, `roads`, `flats`, and the source `bbox`. What `ThreeMap.svelte` renders. |
| Height ramp | Building vertex-color gradient `#aaccbb → royalblue → purple` at 0/200/400 m, applied per-vertex on the merged building geometry. |
| Ribbon / flat geometry | Roads become flat triangulated ribbons along centerlines (width by highway class); water/green become flat `ShapeGeometry` polygons with holes. |
| Asymptotic progress | UI rule: the progress bar creeps toward a cap that rises with real cell progress (max 99%), never holds flat, and only reaches 100% once the scene is rendered. |
| `npm run verify` | A pure-Node round-trip self-check (`scripts/verify.mjs`) that pins projection scale, axis orientation, winding, ring cleaning, and the height ladder — catching a swapped axis that `svelte-check` cannot. |
| Erasable-syntax-only | Constraint on `projection.ts` / `extrude.ts` / `osmToScene.ts`: no enums/namespaces, so Node's type stripping can run them directly in `verify`. |
| base-map-gen | Sibling project (`../base-map-gen`) whose Overpass tiling/failover and selection-map conventions this project reuses. |
