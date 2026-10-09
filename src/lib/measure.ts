// Local-metre geometry measures for the info drawer. Each feature is anchored
// at its own first vertex (parcel-scale, so the frozen-cos(lat) error is
// negligible). Erasable-syntax-only so it could also run under `npm run verify`.
import { makeProjector } from './projection';
import type { LonLat, LonLatRing } from './osmToScene';

export function ringArea(ring: LonLatRing): number {
	if (ring.length < 3) return 0;
	const proj = makeProjector(ring[0][0], ring[0][1]);
	const p = ring.map(([lng, lat]) => proj.toLocal(lng, lat));
	let s = 0;
	for (let i = 0; i < p.length; i++) {
		const a = p[i];
		const b = p[(i + 1) % p.length];
		s += a.x * b.y - b.x * a.y;
	}
	return Math.abs(s) / 2;
}
export function polyArea(outer: LonLatRing, holes: LonLatRing[]): number {
	return Math.max(0, ringArea(outer) - holes.reduce((s, h) => s + ringArea(h), 0));
}
export function lineLength(pts: LonLat[]): number {
	if (pts.length < 2) return 0;
	const proj = makeProjector(pts[0][0], pts[0][1]);
	let len = 0;
	for (let i = 1; i < pts.length; i++) {
		const a = proj.toLocal(pts[i - 1][0], pts[i - 1][1]);
		const b = proj.toLocal(pts[i][0], pts[i][1]);
		len += Math.hypot(b.x - a.x, b.y - a.y);
	}
	return len;
}
export function ringPerimeter(ring: LonLatRing): number {
	if (ring.length < 2) return 0;
	const proj = makeProjector(ring[0][0], ring[0][1]);
	let len = 0;
	for (let i = 0; i < ring.length; i++) {
		const a = proj.toLocal(ring[i][0], ring[i][1]);
		const b = proj.toLocal(ring[(i + 1) % ring.length][0], ring[(i + 1) % ring.length][1]);
		len += Math.hypot(b.x - a.x, b.y - a.y);
	}
	return len;
}

export function fmtArea(m2: number): string {
	if (m2 < 10000) return `${m2.toFixed(0)} m²`;
	if (m2 < 1e6) return `${(m2 / 10000).toFixed(2)} ha`;
	return `${(m2 / 1e6).toFixed(2)} km²`;
}
export function fmtLen(m: number): string {
	return m < 1000 ? `${m.toFixed(0)} m` : `${(m / 1000).toFixed(2)} km`;
}
