// OSM elements → scene descriptor. Minimal classification only (no game roles):
// buildings (footprint rings incl. multipolygon outer/inner holes + heights),
// roads (highway=* → centerline polylines with width by class),
// water/green (natural=water, leisure=park/garden → flat polygons).
//
// NOTE: erasable-syntax-only — Node type stripping runs this in `npm run verify`.

import type { BBox, MapObjectBase } from './types';
import type { RawElement, RawNode } from './overpass';

export type LonLat = [number, number]; // [lng, lat]
export type LonLatRing = LonLat[];

export interface BuildingPrism extends MapObjectBase {
	kind: 'building';
	outer: LonLatRing;
	holes: LonLatRing[];
	height: number; // metres, ground → roof top
	minHeight: number; // metres, bottom of the prism
}

export interface RoadLine extends MapObjectBase {
	kind: 'road';
	points: LonLat[];
	width: number; // metres, full width
}

export interface FlatPoly extends MapObjectBase {
	outer: LonLatRing;
	holes: LonLatRing[];
	kind: 'water' | 'green'; // narrows MapObjectBase.kind
}

export interface MapMeta {
	mapId: string;
	createdAt: string; // ISO timestamp
}

/** Any clickable, renderable object (buildings/roads/flats all extend MapObjectBase). */
export type SceneObject = BuildingPrism | RoadLine | FlatPoly;

/** What the drawer is currently showing: a clicked object, or the map overview. */
export type Selection = { kind: 'object'; object: SceneObject } | { kind: 'map' };

export interface SceneData {
	meta: MapMeta;
	bbox: BBox;
	buildings: BuildingPrism[];
	roads: RoadLine[];
	flats: FlatPoly[];
}

// ---- OSM height tags → metres ---------------------------------------------

/**
 * Parse an OSM height-ish tag to metres. Handles "12.5", "12.5 m", comma
 * decimals ("12,5"), and feet ("30'"). Returns null when unparseable or
 * outside the sanity clamp (0, 500).
 */
export function parseHeightMeters(raw: string | undefined): number | null {
	if (!raw) return null;
	const s = raw.trim();
	const m = /^(\d+(?:[.,]\d+)?)\s*(m|meter|meters)?\s*$/i.exec(s);
	if (m) {
		const v = parseFloat(m[1].replace(',', '.'));
		return v > 0 && v < 500 ? v : null;
	}
	const f = /^(\d+(?:\.\d+)?)\s*'$/.exec(s); // 30' → feet
	if (f) {
		const v = parseFloat(f[1]) * 0.3048;
		return v > 0 && v < 500 ? v : null;
	}
	return null;
}

/**
 * The fallback ladder (implemented exactly):
 *   h    = parse(height) ?? 3·(building:levels ?? 1) + (roof:levels ? 3·roof:levels : 0)
 *   hMin = parse(min_height) ?? 3·(building:min_level ?? 0)
 * height wins over levels; if depth (h − hMin) ≤ 0, drop hMin and extrude h from 0.
 */
export function buildingHeights(tags: Record<string, string>): { h: number; hMin: number } {
	const hTag = parseHeightMeters(tags.height);
	let h: number;
	if (hTag != null) {
		h = hTag;
	} else {
		const levels = parseFloat(tags['building:levels'] ?? '');
		const roof = parseFloat(tags['roof:levels'] ?? '');
		h = 3 * (Number.isFinite(levels) ? levels : 1) + (Number.isFinite(roof) ? 3 * roof : 0);
	}
	let hMin = parseHeightMeters(tags.min_height) ?? 0;
	if (hMin === 0) {
		const minLevel = parseFloat(tags['building:min_level'] ?? '');
		if (Number.isFinite(minLevel)) hMin = 3 * minLevel;
	}
	if (hMin < 0) hMin = 0;
	if (h - hMin <= 0) hMin = 0; // bad data (min_height ≥ height) → extrude h from 0
	return { h, hMin };
}

// ---- road widths by class --------------------------------------------------

const ROAD_WIDTH: Record<string, number> = {
	motorway: 12,
	trunk: 12,
	primary: 10,
	secondary: 8,
	tertiary: 7,
	unclassified: 6,
	residential: 6,
	service: 4,
	track: 3,
	path: 2,
	footway: 2,
	cycleway: 2,
	pedestrian: 3,
	bridleway: 2,
	steps: 2
};
const DEFAULT_ROAD_WIDTH = 5;

// ---- element → scene conversion --------------------------------------------

function ringOf(geometry: RawNode[] | undefined): LonLatRing | null {
	const g = geometry ?? [];
	if (g.length < 4) return null;
	const first = g[0];
	const last = g[g.length - 1];
	if (first.lat !== last.lat || first.lon !== last.lon) return null; // not closed
	return g.map((n) => [n.lon, n.lat] as LonLat);
}

function lineOf(geometry: RawNode[] | undefined): LonLat[] | null {
	const g = geometry ?? [];
	if (g.length < 2) return null;
	return g.map((n) => [n.lon, n.lat] as LonLat);
}

function ringBboxArea(r: LonLatRing): number {
	let minX = Infinity,
		minY = Infinity,
		maxX = -Infinity,
		maxY = -Infinity;
	for (const [x, y] of r) {
		if (x < minX) minX = x;
		if (x > maxX) maxX = x;
		if (y < minY) minY = y;
		if (y > maxY) maxY = y;
	}
	return (maxX - minX) * (maxY - minY);
}

/**
 * Outer/inner rings of a multipolygon relation. ponytail: only members whose
 * geometry is already a closed ring are used (no way-segment stitching) — split
 * outer rings are rare in practice; the largest closed outer wins, extras drop.
 */
function relationRings(el: RawElement): { outer: LonLatRing; holes: LonLatRing[] } | null {
	const outers: LonLatRing[] = [];
	const holes: LonLatRing[] = [];
	for (const mem of el.members ?? []) {
		const ring = ringOf(mem.geometry);
		if (!ring) continue;
		if (mem.role === 'inner') holes.push(ring);
		else outers.push(ring); // 'outer' or unroled
	}
	if (!outers.length) return null;
	outers.sort((a, b) => ringBboxArea(b) - ringBboxArea(a));
	return { outer: outers[0], holes };
}

export function elementsToScene(
	elements: RawElement[],
	bbox: BBox,
	meta: MapMeta
): SceneData {
	const scene: SceneData = { meta, bbox, buildings: [], roads: [], flats: [] };
	for (const el of elements) {
		const tags = el.tags ?? {};
		const name = tags.name ?? null;

		if (tags.building) {
			const rings =
				el.type === 'way'
					? (() => {
							const outer = ringOf(el.geometry);
							return outer ? { outer, holes: [] as LonLatRing[] } : null;
						})()
					: relationRings(el);
			if (!rings) continue;
			const { h, hMin } = buildingHeights(tags);
			scene.buildings.push({
				id: `${el.type}/${el.id}`,
				osmType: el.type,
				osmId: el.id,
				kind: 'building',
				tags,
				name,
				outer: rings.outer,
				holes: rings.holes,
				height: h,
				minHeight: hMin
			});
			continue;
		}

		if (tags.highway) {
			const pts = lineOf(el.geometry);
			if (!pts) continue;
			scene.roads.push({
				id: `${el.type}/${el.id}`,
				osmType: el.type,
				osmId: el.id,
				kind: 'road',
				tags,
				name,
				points: pts,
				width: ROAD_WIDTH[tags.highway] ?? DEFAULT_ROAD_WIDTH
			});
			continue;
		}

		const kind =
			tags.natural === 'water' ? ('water' as const) : tags.leisure === 'park' || tags.leisure === 'garden' ? ('green' as const) : null;
		if (kind) {
			const rings =
				el.type === 'way'
					? (() => {
							const outer = ringOf(el.geometry);
							return outer ? { outer, holes: [] as LonLatRing[] } : null;
						})()
					: relationRings(el);
			if (!rings) continue;
			scene.flats.push({
				id: `${el.type}/${el.id}`,
				osmType: el.type,
				osmId: el.id,
				kind,
				tags,
				name,
				outer: rings.outer,
				holes: rings.holes
			});
		}
	}
	return scene;
}
