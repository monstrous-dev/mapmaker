// Pure-Node round-trip self-check for the projection + extrusion math
// cheat sheet. svelte-check cannot catch a
// swapped axis — this can. Run: npm run verify
//
// Runs on Node ≥ 22.18 via built-in type stripping: it imports the app's real
// TS modules (erasable-syntax-only) so the checked code IS the shipped code.

import { makeProjector, metresPerPixel, EARTH_R } from '../src/lib/projection.ts';
import { buildingHeights, parseHeightMeters } from '../src/lib/osmToScene.ts';
import { cleanRing, normalizeWinding, extrudePrism } from '../src/lib/extrude.ts';
import { ShapeUtils, Vector2 } from 'three';

let failures = 0;
function assert(name, cond) {
	if (cond) console.log('ok  :', name);
	else {
		console.error('FAIL:', name);
		failures++;
	}
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// ---- projection: known scale ------------------------------------------------
// 1° at the anchor = (π/180)·R metres in both axes; east axis scaled by cos(lat0).
{
	const p = makeProjector(0, 0);
	const oneDeg = (Math.PI / 180) * EARTH_R; // 111319.49…
	const e = p.toLocal(1, 0);
	const n = p.toLocal(0, 1);
	assert('equator: 1° lon = 111319.49 m east', near(e.x, oneDeg, 1e-6));
	assert('equator: 1° lat = 111319.49 m north', near(n.y, oneDeg, 1e-6));

	const p60 = makeProjector(6, 60);
	const e60 = p60.toLocal(7, 60);
	assert('lat 60: 1° lon = 111319.49·cos(60°) m', near(e60.x, oneDeg * Math.cos(Math.PI / 3), 1e-6));
}

// ---- projection: round-trip ---------------------------------------------------
{
	const p = makeProjector(6.53, 53.11); // ~Veendam
	for (const [lon, lat] of [
		[6.53, 53.11],
		[6.55, 53.12],
		[6.4, 53.0],
		[7.1, 53.5]
	]) {
		const m = p.toLocal(lon, lat);
		const back = p.toLonLat(m.x, m.y);
		assert(`round-trip ${lon},${lat}`, near(back.lon, lon, 1e-9) && near(back.lat, lat, 1e-9));
	}
	// anchor is the origin
	const o = p.toLocal(6.53, 53.11);
	assert('anchor → (0,0)', o.x === 0 && o.y === 0);
	// north of anchor is +yNorth
	assert('north of anchor → +yNorth', p.toLocal(6.53, 53.12).y > 0);
}

// ---- metresPerPixel ------------------------------------------------------------
assert('m/px at equator z0 ≈ 156543.03', near(metresPerPixel(0, 0), 156543.03392, 1e-6));
assert('m/px halves per zoom', near(metresPerPixel(52, 14) * 2, metresPerPixel(52, 13), 1e-9));

// ---- extrusion orientation: yNorth → −Z, depth → +Y ---------------------------
{
	// Asymmetric footprint: a marker vertex 10 m NORTH of the others.
	const outer = [new Vector2(0, 0), new Vector2(20, 0), new Vector2(20, 10), new Vector2(0, 20)];
	const geo = extrudePrism(outer, [], 30, 5);
	assert('extrudePrism returns geometry', !!geo);
	geo.computeBoundingBox();
	const bb = geo.boundingBox;
	// height: minHeight..height on +Y
	assert('prism base lifted to minHeight on +Y', near(bb.min.y, 5, 1e-6));
	assert('prism top at height on +Y', near(bb.max.y, 30, 1e-6));
	// ground extents: xEast 0..20 stays +X; yNorth 0..20 becomes −Z (north = −Z)
	assert('xEast maps to +X', near(bb.min.x, 0, 1e-6) && near(bb.max.x, 20, 1e-6));
	assert('yNorth maps to −Z', near(bb.min.z, -20, 1e-6) && near(bb.max.z, 0, 1e-6));
	geo.dispose();
}

// ---- winding normalization ------------------------------------------------------
{
	const ccw = [new Vector2(0, 0), new Vector2(10, 0), new Vector2(10, 10), new Vector2(0, 10)];
	const cw = [...ccw].reverse();
	assert('ShapeUtils sanity: ccw not clockwise', ShapeUtils.isClockWise(ccw) === false);
	const n = normalizeWinding(cw, [ccw]); // outer CW, hole CCW → both flipped
	assert('outer normalized to CCW', ShapeUtils.isClockWise(n.outer) === false);
	assert('holes normalized to CW', ShapeUtils.isClockWise(n.holes[0]) === true);
}

// ---- cleanRing -------------------------------------------------------------------
{
	const ring = [new Vector2(0, 0), new Vector2(1, 0), new Vector2(1, 0), new Vector2(0, 1), new Vector2(0, 0)];
	const c = cleanRing(ring);
	assert('cleanRing drops dupes + closing repeat', c.length === 3);
	assert('cleanRing drops degenerate rings', cleanRing([new Vector2(0, 0), new Vector2(1, 1)]).length === 0);
}

// ---- height ladder ----------------------------------------------------------------
assert('parse "12.5"', parseHeightMeters('12.5') === 12.5);
assert('parse "12.5 m"', parseHeightMeters('12.5 m') === 12.5);
assert('parse comma decimal "12,5"', parseHeightMeters('12,5') === 12.5);
assert('parse feet "30\'' , near(parseHeightMeters("30'") ?? 0, 9.144, 1e-9));
assert('clamp: "600" → null', parseHeightMeters('600') === null);
assert('clamp: "0" → null', parseHeightMeters('0') === null);
assert('parse garbage → null', parseHeightMeters('tall') === null);
assert('parse undefined → null', parseHeightMeters(undefined) === null);

assert('height wins over levels', buildingHeights({ height: '20', 'building:levels': '3' }).h === 20);
assert('levels fallback: 3·levels', buildingHeights({ 'building:levels': '4' }).h === 12);
assert('default: 3 m', buildingHeights({}).h === 3);
assert('roof:levels add', buildingHeights({ 'building:levels': '4', 'roof:levels': '1' }).h === 15);
assert('min_height tag', buildingHeights({ height: '13', min_height: '10' }).hMin === 10);
assert('building:min_level fallback', buildingHeights({ height: '13', 'building:min_level': '3' }).hMin === 9);
assert('depth ≤ 0 drops hMin', buildingHeights({ height: '10', min_height: '12' }).hMin === 0);

if (failures) {
	console.error(`\n${failures} check(s) FAILED`);
	process.exit(1);
}
console.log('\nAll projection/extrusion checks passed.');
