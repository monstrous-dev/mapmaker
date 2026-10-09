// lon/lat → local-metre ENU projection:
//
// Option B — equirectangular approximation anchored at the bbox centre:
//   xEast  = (lon − lon0) · (π/180) · R · cos(lat0)
//   yNorth = (lat − lat0) · (π/180) · R
// cos(lat) is frozen at the anchor; error grows with N-S distance from it
// (invisible for a neighbourhood scene — see findings §5.1).
//
// Feeding Three.js: build THREE.Shape with (xEast, yNorth), extrude, then
// geometry.rotateX(-Math.PI/2) — which maps yNorth → −Z (north = into the
// screen) and extrusion depth → +Y up. Verified by scripts/verify.mjs.
//
// NOTE: keep this file erasable-syntax-only (no enums/namespaces) — Node's
// type stripping runs it directly in `npm run verify`.

export const EARTH_R = 6378137; // WGS84 semi-major axis, mercator metre radius

export interface Projector {
	lon0: number;
	lat0: number;
	/** lon/lat (degrees) → local metres { x: east, y: north }, anchor at origin. */
	toLocal(lon: number, lat: number): { x: number; y: number };
	/** Inverse of toLocal — round-trip check. */
	toLonLat(x: number, y: number): { lon: number; lat: number };
}

export function makeProjector(lon0: number, lat0: number): Projector {
	const k = (Math.PI / 180) * EARTH_R;
	const kx = k * Math.cos((lat0 * Math.PI) / 180);
	return {
		lon0,
		lat0,
		toLocal(lon, lat) {
			return { x: (lon - lon0) * kx, y: (lat - lat0) * k };
		},
		toLonLat(x, y) {
			return { lon: lon0 + x / kx, lat: lat0 + y / k };
		}
	};
}

/** Metres per pixel for 256-px slippy tiles (Web-Mercator zoom math). */
export function metresPerPixel(lat: number, zoom: number): number {
	return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
}
