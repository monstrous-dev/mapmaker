// Shared scene → merged-geometry pipeline, extracted from ThreeMap.svelte so
// the HTML exporter ($lib/exportHtml.ts) serializes EXACTLY what the live
// viewport renders instead of duplicating the math. three.js-dependent (not
// imported by scripts/verify.mjs — that pins projection/extrude in pure Node).
//
// Per category (buildings / roads / water / green) one merged BufferGeometry,
// each sub-geometry stamped with a per-vertex `objId` so raycast hits resolve
// back into pickList (live view picking); the exporter simply drops that
// attribute when serializing.

import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import {
	BufferAttribute,
	BufferGeometry,
	Color,
	Shape,
	ShapeGeometry,
	Vector2
} from 'three';
import { extrudePrism } from '$lib/extrude';
import { makeProjector, type Projector } from '$lib/projection';
import type { SceneData, SceneObject } from '$lib/osmToScene';

// height ramp: #aaccbb → royalblue → purple at 0 / 200 / 400 m
const RAMP = [
	{ at: 0, c: new Color('#aaccbb') },
	{ at: 200, c: new Color('royalblue') },
	{ at: 400, c: new Color('purple') }
];

export function heightColor(h: number, out: Color): Color {
	const t = Math.max(RAMP[0].at, Math.min(RAMP[2].at, h));
	const [lo, hi] = t <= 200 ? [RAMP[0], RAMP[1]] : [RAMP[1], RAMP[2]];
	return out.copy(lo.c).lerp(hi.c, (t - lo.at) / (hi.at - lo.at));
}

/** lon/lat ring → local-metre Vector2 ring (xEast, yNorth). */
export function v2ring(proj: Projector, ring: [number, number][]): Vector2[] {
	return ring.map(([lon, lat]) => {
		const p = proj.toLocal(lon, lat);
		return new Vector2(p.x, p.y);
	});
}

/** Paint every vertex of a geometry one color (merged buildings keep per-building ramp colors). */
export function paint(geo: BufferGeometry, color: Color): BufferGeometry {
	const n = geo.getAttribute('position').count;
	const colors = new Float32Array(n * 3);
	for (let i = 0; i < n; i++) {
		colors[i * 3] = color.r;
		colors[i * 3 + 1] = color.g;
		colors[i * 3 + 2] = color.b;
	}
	geo.setAttribute('color', new BufferAttribute(colors, 3));
	return geo;
}

/** Stamp a per-vertex object id so a raycast hit maps back to pickList[id]. */
export function stampId(geo: BufferGeometry, id: number): BufferGeometry {
	const n = geo.getAttribute('position').count;
	const arr = new Float32Array(n);
	arr.fill(id);
	geo.setAttribute('objId', new BufferAttribute(arr, 1));
	return geo;
}

/** Flat ribbon triangulated along a centerline polyline (roads). y = lift. */
export function ribbonGeometry(pts: Vector2[], width: number, lift: number): BufferGeometry | null {
	if (pts.length < 2) return null;
	const half = width / 2;
	const positions: number[] = [];
	const normals: number[] = [];
	const push = (a: Vector2, b: Vector2, c: Vector2) => {
		// ground-plane XZ: Vector2 (xEast, yNorth) → (x, lift, −yNorth)
		positions.push(a.x, lift, -a.y, b.x, lift, -b.y, c.x, lift, -c.y);
		normals.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
	};
	for (let i = 0; i < pts.length - 1; i++) {
		const p0 = pts[i];
		const p1 = pts[i + 1];
		const dx = p1.x - p0.x;
		const dy = p1.y - p0.y;
		const len = Math.hypot(dx, dy);
		if (len < 1e-6) continue;
		const nx = (-dy / len) * half;
		const ny = (dx / len) * half;
		const a = new Vector2(p0.x + nx, p0.y + ny);
		const b = new Vector2(p0.x - nx, p0.y - ny);
		const c = new Vector2(p1.x + nx, p1.y + ny);
		const d = new Vector2(p1.x - nx, p1.y - ny);
		push(a, b, c);
		push(b, d, c);
	}
	if (!positions.length) return null;
	const geo = new BufferGeometry();
	geo.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
	geo.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3));
	return geo;
}

/** Flat polygon with holes (water/green). Shape in (xEast, yNorth), rotated to ground. */
export function flatGeometry(outer: Vector2[], holes: Vector2[][], lift: number): BufferGeometry | null {
	if (outer.length < 3) return null;
	try {
		const shape = new Shape(outer);
		shape.holes.push(...holes.filter((h) => h.length >= 3).map((h) => new Shape(h)));
		const geo = new ShapeGeometry(shape);
		geo.rotateX(-Math.PI / 2); // yNorth → −Z
		geo.translate(0, lift, 0);
		return geo;
	} catch {
		return null;
	}
}

export function mergeGeos(geos: BufferGeometry[]): BufferGeometry | null {
	if (!geos.length) return null;
	// normalize attribute sets (extrudes carry uv, ribbons don't) before merging
	const hasUv = geos.every((g) => g.getAttribute('uv'));
	if (!hasUv) for (const g of geos) g.deleteAttribute('uv');
	const merged = BufferGeometryUtils.mergeGeometries(geos, false);
	for (const g of geos) g.dispose();
	return merged;
}

export interface BuiltMeshes {
	buildings: BufferGeometry | null;
	roads: BufferGeometry | null;
	water: BufferGeometry | null;
	green: BufferGeometry | null;
	/** pickList[objId] — stamped in this order across the four categories. */
	pickList: SceneObject[];
	/** the projector used for lon/lat → local metres (callers rebuilding single-object geometry reuse it) */
	proj: Projector;
	/** ground plane in local metres, unmargined (callers add margin), centred */
	ground: { w: number; h: number; cx: number; cz: number };
}

/**
 * Project + extrude/ribbon/flatten every element of a SceneData descriptor and
 * merge into one BufferGeometry per category. Single source of truth for the
 * geometry pipeline — the live viewport and the HTML exporter both consume it.
 */
export function buildMeshes(data: SceneData): BuiltMeshes {
	const { bbox } = data;
	const proj = makeProjector((bbox.minLng + bbox.maxLng) / 2, (bbox.minLat + bbox.maxLat) / 2);
	const sw = proj.toLocal(bbox.minLng, bbox.minLat);
	const ne = proj.toLocal(bbox.maxLng, bbox.maxLat);

	const pickList: SceneObject[] = [];
	const tmp = new Color();

	// buildings — extruded prisms, per-building ramp vertex colors
	const buildingGeos: BufferGeometry[] = [];
	for (const b of data.buildings) {
		const geo = extrudePrism(v2ring(proj, b.outer), b.holes.map((r) => v2ring(proj, r)), b.height, b.minHeight);
		if (!geo) continue;
		stampId(geo, pickList.length);
		pickList.push(b);
		buildingGeos.push(paint(geo, heightColor(b.height, tmp)));
	}

	// roads — flat ribbons, slight lift over ground
	const roadGeos: BufferGeometry[] = [];
	for (const r of data.roads) {
		const geo = ribbonGeometry(v2ring(proj, r.points), r.width, 0.2);
		if (!geo) continue;
		stampId(geo, pickList.length);
		pickList.push(r);
		roadGeos.push(geo);
	}

	// water + green — flat polygons
	const waterGeos: BufferGeometry[] = [];
	const greenGeos: BufferGeometry[] = [];
	for (const kind of ['water', 'green'] as const) {
		const geos = kind === 'water' ? waterGeos : greenGeos;
		for (const f of data.flats) {
			if (f.kind !== kind) continue;
			const geo = flatGeometry(v2ring(proj, f.outer), f.holes.map((r) => v2ring(proj, r)), 0.1);
			if (!geo) continue;
			stampId(geo, pickList.length);
			pickList.push(f);
			geos.push(geo);
		}
	}

	return {
		buildings: mergeGeos(buildingGeos),
		roads: mergeGeos(roadGeos),
		water: mergeGeos(waterGeos),
		green: mergeGeos(greenGeos),
		pickList,
		proj,
		ground: {
			w: Math.max(1, ne.x - sw.x),
			h: Math.max(1, ne.y - sw.y),
			cx: (sw.x + ne.x) / 2,
			cz: -(sw.y + ne.y) / 2
		}
	};
}
