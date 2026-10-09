---
type: Concept
title: Merged-geometry object identity (per-vertex objId)
description: What is it?
tags: [three-js, rendering, interaction, picking]
timestamp: "2026-08-12T19:00:05.467Z"
---

# Merged-geometry object identity (per-vertex objId)

## What is it?

A technique for keeping per-source-object identity **after** many geometries are merged into one Three.js `BufferGeometry` per category. Each renderable object is assigned an index into a `pickList`; before merging, its geometry is given a per-vertex `objId` `BufferAttribute` set to that index (every vertex of the object carries the same id). On a raycast hit, `geometry.getAttribute('objId').array[hit.faceIndex * 3]` resolves straight back to the source object.

## Why does it matter?

Rendering one merged geometry per category (buildings / roads / water / green) is what makes the scene cheap to draw. Naively merging throws away *which triangle belonged to which OSM object*, so click-to-inspect would be impossible. This keeps the performance of merging **and** makes every object individually selectable.

## Key rules / properties

- `objId` must be **uniform across all vertices of one object** — write it as a 1-component attribute with the object's index repeated for every vertex.
- The **ground plane intentionally has no `objId` attribute** → a raycast hit with no `objId` is interpreted as a "map" selection (opens the map-overview drawer).
- Read `faceIndex * 3` (the first vertex of the hit triangle) from the attribute array.
- Works because `raycast.faceIndex` indexes into the merged index buffer, which stays aligned with the per-vertex attribute.

## Relationships

- [map-persistence-and-rest-api](../entities/map-persistence-and-rest-api.md) — both surfaces read the same `MapObjectBase` identity (`id`, `osmType`, `osmId`, `tags`), so a click and a DB row refer to the same object.

## Source

- `src/lib/components/ThreeMap.svelte` — `stampObjectIds()` + the pick/raycast handler.
