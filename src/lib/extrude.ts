// three.js-dependent pure geometry helpers (extrusion cheat sheet):
//   Shape(xEast, yNorth) → ExtrudeGeometry({ depth: h−hMin, bevelEnabled: false })
//     → translate(0,0,hMin) → rotateX(−π/2)   // north = −Z, Y-up
//   outer CCW, holes CW (ShapeUtils.isClockWise to normalize)
//
// Kept separate from ThreeMap.svelte so `npm run verify` (scripts/verify.mjs)
// can pin this math in pure Node — a swapped axis here cannot be caught by
// svelte-check. NOTE: erasable-syntax-only (Node type stripping).

import { ExtrudeGeometry, Shape, ShapeUtils, Vector2 } from 'three';
import type { BufferGeometry } from 'three';

/** Drop consecutive duplicates + the closing repeat (Shape closes automatically). */
export function cleanRing(ring: Vector2[]): Vector2[] {
	const out: Vector2[] = [];
	for (const p of ring) {
		const last = out[out.length - 1];
		if (!last || last.x !== p.x || last.y !== p.y) out.push(p);
	}
	if (out.length > 1) {
		const f = out[0];
		const l = out[out.length - 1];
		if (f.x === l.x && f.y === l.y) out.pop();
	}
	return out.length >= 3 ? out : [];
}

/**
 * Normalize winding: outer must be CCW, holes CW (opposite of the outer, per
 * the Shape docs). OSM rings carry no guaranteed winding, and a CW footprint
 * yields downward-facing roof normals / inside-out walls.
 */
export function normalizeWinding(outer: Vector2[], holes: Vector2[][]): { outer: Vector2[]; holes: Vector2[][] } {
	if (ShapeUtils.isClockWise(outer)) outer = [...outer].reverse();
	const hs = holes.map((h) => (ShapeUtils.isClockWise(h) ? h : [...h].reverse()));
	return { outer, holes: hs };
}

/**
 * Extrude one building prism from local-metre rings. Returns null for
 * degenerate geometry (one bad building must not kill the import).
 */
export function extrudePrism(
	outerM: Vector2[],
	holesM: Vector2[][],
	height: number,
	minHeight: number
): BufferGeometry | null {
	const outer = cleanRing(outerM);
	if (outer.length < 3) return null;
	const holes = holesM.map(cleanRing).filter((h) => h.length >= 3);
	if (Math.abs(ShapeUtils.area(outer)) < 1e-6) return null;
	const n = normalizeWinding(outer, holes);
	try {
		const shape = new Shape(n.outer);
		shape.holes.push(...n.holes.map((h) => new Shape(h)));
		const depth = height - minHeight;
		if (depth <= 0) return null;
		const geo = new ExtrudeGeometry(shape, { depth, bevelEnabled: false, steps: 1 });
		geo.translate(0, 0, minHeight); // lift by min_height (before rotation)
		geo.rotateX(-Math.PI / 2); // shape-XY → ground plane: yNorth → −Z, depth → +Y up
		return geo;
	} catch {
		return null; // earcut chokes on self-intersecting ("bowtie") footprints
	}
}
