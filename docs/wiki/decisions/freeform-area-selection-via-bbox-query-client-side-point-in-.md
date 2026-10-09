---
type: Decision
title: Freeform area selection via bbox query + client-side point-in-polygon filter
description: Context
tags: [area-selection, overpass, geometry, frontend]
status: accepted
timestamp: "2026-08-12T19:30:53.790Z"
---

# Freeform area selection via bbox query + client-side point-in-polygon filter

## Context

Users wanted to draw an arbitrary freehand polygon (an L-shape, a curved area)
on the 2D selection map and generate the 3D scene from just that shape — not
just the existing click-drag rectangle.

The extraction layer (`src/lib/overpass.ts`) is hard-wired to **bounding boxes**:
it tiles a bbox into ~0.05° cells, queries Overpass per cell, subdivides/retries
heavy cells, dedupes by OSM id, and fails over across mirrors. Overpass does not
have a cheap "elements inside this arbitrary polygon" query comparable to bbox
tiling.

## Choice

Keep the Overpass query bbox-based. For a drawn polygon:

1. Compute the polygon's axis-aligned bounding box (`bboxOfRing` in
   `src/lib/clip.ts`).
2. Run the **existing** extraction (all tiling/failover untouched) on that bbox.
3. **Client-side filter** the returned elements, keeping any element that has at
   least one node inside the polygon (even-odd ray-casting `pointInRing`, exposed
   as `elementInPolygon`). The filter is inclusive: a building straddling the
   edge or a road crossing the area is **kept whole**, never clipped.

The selection map (`Map.svelte`) gains a ▢ Rectangle / ✎ Freeform mode toggle;
both emit a single `Area` type (`{ type: 'bbox'; bbox }` or
`{ type: 'polygon'; ring }`). The page resolves the area to a bbox for extraction
and applies the polygon filter only for `polygon`.

## Alternatives considered

- **Rewrite the extraction layer to query an arbitrary polygon.** Overpass has no
  bbox-equivalent for polygons; you'd approximate with many tiny bboxes or
  `around` filters, breaking the tiling/subdivision/retry logic that makes
  extraction robust. Rejected — far more risk for no better result.
- **Clip building/road geometry to the polygon boundary.** Produces prettier
  edges but adds real geometry work (polygon-polygon clipping per element) and
  visually slices buildings in half. Rejected — keeping whole objects is simpler
  and reads better at city-block scale.

## Rationale

The bbox pipeline is the fragile, hard-won part of the system. Reusing it means
zero extraction risk. The client-side filter is a pure function over already-
fetched data (~tens of thousands of elements), so cost is negligible relative to
the network extraction. Whole-object retention avoids geometry clipping entirely.

## Consequences

- An element is included if **any** of its nodes is inside the polygon, so a road
  that merely grazes the edge brings its whole length in. Acceptable for city-
  block selection.
- The 3D ground plane is still the polygon's bounding **rectangle**, not the
  exact polygon shape — content is clipped correctly, but the base is framed by a
  rectangle. Upgrade path (if wanted): build the ground from the polygon ring.
- `src/lib/clip.ts` is erasable-syntax-only so `scripts/verify.mjs` could import
  it directly, matching the convention of the other math modules.

## Source

- `src/lib/clip.ts` — `bboxOfRing`, `pointInRing`, `elementInPolygon`
- `src/lib/types.ts` — `Area` union type
- `src/lib/components/Map.svelte` — Rectangle/Freeform toggle + draw handlers
- `src/routes/+page.svelte` — area → bbox + polygon filter wiring
