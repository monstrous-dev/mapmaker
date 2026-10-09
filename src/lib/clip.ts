// Geometry helpers for freeform area selection. The Overpass query is always
// bbox-based; for a drawn polygon we query its bounding box then keep only the
// elements with at least one node inside the polygon (point-in-polygon, even-odd
// ray casting). Erasable-syntax-only.
import type { BBox } from './types';
import type { RawElement } from './overpass';

/** Axis-aligned bounding box of a lon/lat ring. */
export function bboxOfRing(ring: [number, number][]): BBox {
	let minLng = Infinity;
	let minLat = Infinity;
	let maxLng = -Infinity;
	let maxLat = -Infinity;
	for (const [lng, lat] of ring) {
		if (lng < minLng) minLng = lng;
		if (lng > maxLng) maxLng = lng;
		if (lat < minLat) minLat = lat;
		if (lat > maxLat) maxLat = lat;
	}
	return { minLng, minLat, maxLng, maxLat };
}

/** Even-odd ray-casting point-in-polygon. Works on open or closed rings. */
export function pointInRing(lng: number, lat: number, ring: [number, number][]): boolean {
	let inside = false;
	for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
		const xi = ring[i][0];
		const yi = ring[i][1];
		const xj = ring[j][0];
		const yj = ring[j][1];
		const intersect = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
		if (intersect) inside = !inside;
	}
	return inside;
}

/** All lon/lat nodes of a way or relation element (own geometry + members'). */
function elementNodes(el: RawElement): { lon: number; lat: number }[] {
	const out: { lon: number; lat: number }[] = [];
	if (el.geometry) for (const n of el.geometry) out.push({ lon: n.lon, lat: n.lat });
	if (el.members) {
		for (const mem of el.members) {
			if (mem.geometry) for (const n of mem.geometry) out.push({ lon: n.lon, lat: n.lat });
		}
	}
	return out;
}

/**
 * Keep an element if any of its nodes lies inside the polygon — inclusive, so
 * buildings straddling the edge and roads crossing the area are retained rather
 * than clipped.
 */
export function elementInPolygon(el: RawElement, ring: [number, number][]): boolean {
	for (const n of elementNodes(el)) {
		if (pointInRing(n.lon, n.lat, ring)) return true;
	}
	return false;
}
