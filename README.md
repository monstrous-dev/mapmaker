# mapmaker

Pure-**Three.js** 3D map generator on the SMB stack (SvelteKit 2 + Svelte 5 runes +
TypeScript strict + Vite + adapter-node). MapLibre (via svelte-maplibre-gl) is used
**only** for the 2D area-selection map — the 3D view contains no MapLibre at all.
Each generated map is persisted to its own SQLite database
(`data/maps/<id>.sqlite`, via the stdlib `node:sqlite` — one file per map).

## What it does

1. **Select an area** on the world map (▢ Select area → click & drag a box). Base
   style: CARTO Positron (key-free), drawn bbox shown as a GeoJSON polygon layer.
2. **Generate** — every OpenStreetMap element inside the box is fetched from the
   Overpass API (no key), **client-side**: the box is tiled into ~0.05° cells,
   heavy cells (406/413/504) are subdivided ×4 and retried, border elements are
   deduped by OSM id, and mirrors are rotated on failure (independent per-IP rate
   buckets) with a per-mirror `AbortController` timeout (a dead mirror hangs
   `fetch()` forever — the server's `[timeout:]` doesn't bound the client).
   The progress bar creeps **asymptotically toward 99%** with a live elapsed timer
   — never holds flat, never fakes 100%.
3. **Render** — elements become a pure Three.js scene: extruded building prisms
   (footprint rings incl. multipolygon outer/inner holes), flat road ribbons
   (width by highway class), flat water/park polygons, and a ground plane sized
   in real metres. One merged `BufferGeometry` per category; buildings carry
   height-ramp vertex colors (#aaccbb → royalblue → purple at 0/200/400 m).
   OrbitControls to fly around.
4. **Explore** — every object (building / road / water / park) and the ground
   are clickable: a raycast hit resolves straight to the OSM object and opens an
   info drawer (name, OSM id + link, derived area/length, full tag set). The
   ground opens a map overview with a one-click SQLite download. Five camera
   presets are provided (Top/2D default, Iso, Low, High, Side) plus rotate/tilt
   nudge buttons.

## Run

```bash
npm install
npm run dev        # http://localhost:5231 (--strictPort)

npm run check      # svelte-check
npm run verify     # pure-Node projection/extrusion self-check
npm run build      # adapter-node production build
```

## Knobs

| Where | Knob | Default |
|---|---|---|
| `src/lib/overpass.ts` | `OVERPASS_ENDPOINTS` mirror list | overpass-api.de, kumi.systems, private.coffee |
| `src/lib/overpass.ts` | `CELL_DEG` / `MAX_AXIS_CELLS` tiling | 0.05° / ≤16 cells |
| `src/lib/overpass.ts` | `CLIENT_TIMEOUT_MS` per-mirror abort | 45 s |
| `src/lib/osmToScene.ts` | `ROAD_WIDTH` per highway class (m) | 12 → 2 |
| `src/lib/osmToScene.ts` | height fallback ladder | `height ?? 3·levels`, clamp 0–500 m |
| `src/lib/components/ThreeMap.svelte` | `RAMP` building height colors | #aaccbb → royalblue → purple @ 0/200/400 m |
| `src/lib/components/ThreeMap.svelte` | `MAT` category materials | road/water/green/ground colors |

## Design basis

The math and streaming pipeline were researched before implementation. The key
decisions, as implemented:

- **Projection + extrusion** (`src/lib/projection.ts` + `src/lib/extrude.ts`):
  ENU anchor at bbox center (equirectangular approximation), `(xEast, yNorth)`
  Shape → `ExtrudeGeometry` with `depth = h − hMin`, `bevelEnabled: false`,
  `translate(0,0,hMin)`, `rotateX(−π/2)` (north = −Z, Y-up), winding
  normalization via `ShapeUtils.isClockWise`, and the OSM height-tag fallback
  ladder. `npm run verify` (`scripts/verify.mjs`) pins all of this in pure
  Node — a swapped axis can't be caught by svelte-check.
- **Overpass client-side streaming** (`src/lib/overpass.ts`): small ~0.05°
  cells, subdivide-and-retry heavy cells, dedupe border elements by OSM id,
  mirror failover, and a per-mirror `AbortController` timeout (pattern lifted
  from `../base-map-gen/src/lib/generate.ts`).

## Attribution

| Source | Used for |
|---|---|
| [OpenStreetMap](https://www.openstreetmap.org/copyright) © ODbL contributors | All map data |
| [Overpass API](https://overpass-api.de/) public mirrors | Client-side element extraction |
| [CARTO Positron](https://carto.com/basemaps/) | 2D selection-map base style (key-free) |
| [three.js](https://threejs.org/) | 3D renderer (Shape/ExtrudeGeometry/ShapeUtils, OrbitControls, BufferGeometryUtils) |
| [MapLibre GL JS](https://maplibre.org/) + [svelte-maplibre-gl](https://svelte-maplibre-gl.mierune.dev/) | 2D selection map only |
| OSM wiki ([Simple 3D Buildings](https://wiki.openstreetmap.org/wiki/Simple_3D_Buildings), [Key:building:levels](https://wiki.openstreetmap.org/wiki/Key:building:levels), [Zoom levels](https://wiki.openstreetmap.org/wiki/Zoom_levels)) | Height-tag semantics, metres-per-pixel math |
| OpenMapTiles schema | Reference for the building/height property model |
| `../base-map-gen` (this repo) | Overpass tiling/failover + selection-map conventions |
