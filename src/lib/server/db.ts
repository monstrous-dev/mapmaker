// Server-only SQLite persistence for generated maps. Uses the stdlib
// node:sqlite (Node ≥ 22.5; unflagged on ≥ 23.4 / 24.x) — zero native deps.
// Each generated map gets its own data/maps/<mapId>.sqlite file holding the
// map metadata plus every OSM element (tags + geometry + derived measures).
//
// mapId is the ONLY user-controlled path component, so safeMapId() locks it to
// slug chars and rejects traversal — this is the trust boundary for the file path.

import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { makeProjector } from '$lib/projection';
import type { SceneData } from '$lib/osmToScene';

const MAPS_DIR = join(process.cwd(), 'data', 'maps');

export interface BBoxLike {
	minLng: number;
	minLat: number;
	maxLng: number;
	maxLat: number;
}
export interface SavedMapMeta {
	mapId: string;
	createdAt: string;
	bbox: BBoxLike;
	counts: { buildings: number; roads: number; water: number; green: number };
	bytes: number;
}
export interface ElementInput {
	osmType?: string;
	osmId?: number;
	kind?: string;
	name?: string | null;
	tags?: Record<string, string>;
	height?: number;
	minHeight?: number;
	width?: number;
	outer?: [number, number][];
	holes?: [number, number][][];
	points?: [number, number][];
}
export interface MapPayload {
	buildings?: ElementInput[];
	roads?: ElementInput[];
	flats?: ElementInput[];
}
type Proj = ReturnType<typeof makeProjector>;

/** mapId is the sole user-controlled path segment — slug chars only, no '..'. */
export function safeMapId(raw: unknown): string | null {
	if (typeof raw !== 'string') return null;
	if (!/^[a-zA-Z0-9_-]{1,80}$/.test(raw) || raw.includes('..')) return null;
	return raw;
}

export function dbPath(id: string): string {
	return join(MAPS_DIR, `${id}.sqlite`);
}

export function mapExists(id: string): boolean {
	return existsSync(dbPath(id));
}

function ensureDir(): void {
	mkdirSync(MAPS_DIR, { recursive: true });
}

// ---- local-metre measures (anchor at bbox centre, same as the 3D render) ----
function ringArea(ring: [number, number][] | undefined, proj: Proj): number {
	if (!ring || ring.length < 3) return 0;
	const p = ring.map(([lng, lat]) => proj.toLocal(lng, lat));
	let s = 0;
	for (let i = 0; i < p.length; i++) {
		const a = p[i];
		const b = p[(i + 1) % p.length];
		s += a.x * b.y - b.x * a.y;
	}
	return Math.abs(s) / 2;
}
function lineLength(pts: [number, number][] | undefined, proj: Proj): number {
	if (!pts || pts.length < 2) return 0;
	let len = 0;
	for (let i = 1; i < pts.length; i++) {
		const a = proj.toLocal(pts[i - 1][0], pts[i - 1][1]);
		const b = proj.toLocal(pts[i][0], pts[i][1]);
		len += Math.hypot(b.x - a.x, b.y - a.y);
	}
	return len;
}
function polyArea(outer: [number, number][], holes: [number, number][][], proj: Proj): number {
	const total = ringArea(outer, proj);
	const holesArea = (holes ?? []).reduce((s, h) => s + ringArea(h, proj), 0);
	return Math.max(0, total - holesArea);
}

const SCHEMA = `
CREATE TABLE map(
	id TEXT PRIMARY KEY,
	created_at TEXT NOT NULL,
	min_lng REAL, min_lat REAL, max_lng REAL, max_lat REAL,
	n_buildings INTEGER, n_roads INTEGER, n_water INTEGER, n_green INTEGER
);
CREATE TABLE element(
	rowid INTEGER PRIMARY KEY AUTOINCREMENT,
	osm_type TEXT, osm_id INTEGER, kind TEXT, name TEXT,
	height REAL, min_height REAL, width REAL, area_m2 REAL, length_m REAL,
	tags TEXT, geometry TEXT
);
CREATE INDEX idx_element_kind ON element(kind);
`;

/**
 * Write (or overwrite) one map's database. Returns its metadata. Throws on
 * sqlite failure — the caller maps that to HTTP 500.
 */
export function writeMap(
	id: string,
	createdAt: string,
	bbox: BBoxLike,
	data: MapPayload
): SavedMapMeta {
	ensureDir();
	const path = dbPath(id);
	if (existsSync(path)) rmSync(path);

	const db = new DatabaseSync(path);
	const counts = { buildings: 0, roads: 0, water: 0, green: 0 };
	try {
		db.exec(SCHEMA);
		const proj = makeProjector((bbox.minLng + bbox.maxLng) / 2, (bbox.minLat + bbox.maxLat) / 2);

		const insertEl = db.prepare(
			'INSERT INTO element(osm_type, osm_id, kind, name, height, min_height, width, area_m2, length_m, tags, geometry) VALUES (?,?,?,?,?,?,?,?,?,?,?)'
		);
		const emit = (el: ElementInput) => {
			const area = el.outer ? polyArea(el.outer, el.holes ?? [], proj) : null;
			const length = el.points ? lineLength(el.points, proj) : null;
			insertEl.run(
				el.osmType ?? null,
				el.osmId ?? 0,
				el.kind ?? 'unknown',
				el.name ?? null,
				el.height ?? null,
				el.minHeight ?? null,
				el.width ?? null,
				area,
				length,
				JSON.stringify(el.tags ?? {}),
				JSON.stringify(el.outer ? { outer: el.outer, holes: el.holes ?? [] } : { points: el.points ?? [] })
			);
		};

		for (const b of data.buildings ?? []) {
			counts.buildings++;
			emit(b);
		}
		for (const r of data.roads ?? []) {
			counts.roads++;
			emit(r);
		}
		for (const f of data.flats ?? []) {
			if (f.kind === 'water') counts.water++;
			else if (f.kind === 'green') counts.green++;
			emit(f);
		}

		db.prepare(
			'INSERT INTO map(id, created_at, min_lng, min_lat, max_lng, max_lat, n_buildings, n_roads, n_water, n_green) VALUES (?,?,?,?,?,?,?,?,?,?)'
		).run(id, createdAt, bbox.minLng, bbox.minLat, bbox.maxLng, bbox.maxLat, counts.buildings, counts.roads, counts.water, counts.green);
	} finally {
		db.close();
	}

	return { mapId: id, createdAt, bbox, counts, bytes: statSync(path).size };
}

export function readMapMeta(id: string): SavedMapMeta | null {
	if (!mapExists(id)) return null;
	const db = new DatabaseSync(dbPath(id), { readOnly: true });
	try {
		const row = db.prepare('SELECT * FROM map LIMIT 1').get() as Record<string, number | string> | undefined;
		if (!row) return null;
		return {
			mapId: String(row.id),
			createdAt: String(row.created_at),
			bbox: {
				minLng: Number(row.min_lng),
				minLat: Number(row.min_lat),
				maxLng: Number(row.max_lng),
				maxLat: Number(row.max_lat)
			},
			counts: {
				buildings: Number(row.n_buildings),
				roads: Number(row.n_roads),
				water: Number(row.n_water),
				green: Number(row.n_green)
			},
			bytes: statSync(dbPath(id)).size
		};
	} finally {
		db.close();
	}
}

interface ElRow {
	osm_type: string | null;
	osm_id: number | null;
	kind: string | null;
	name: string | null;
	height: number | null;
	min_height: number | null;
	width: number | null;
	tags: string | null;
	geometry: string | null;
}

/** Reconstruct the full SceneData (geometry + tags) from a saved map's rows. */
export function readMapScene(id: string): SceneData | null {
	if (!mapExists(id)) return null;
	const db = new DatabaseSync(dbPath(id), { readOnly: true });
	try {
		const m = db.prepare('SELECT * FROM map LIMIT 1').get() as
			| {
					id: number | string;
					created_at: number | string;
					min_lng: number;
					min_lat: number;
					max_lng: number;
					max_lat: number;
			  }
			| undefined;
		if (!m) return null;
		const rows = db.prepare(
			'SELECT osm_type, osm_id, kind, name, height, min_height, width, tags, geometry FROM element'
		).all() as unknown as ElRow[];

		const buildings: SceneData['buildings'] = [];
		const roads: SceneData['roads'] = [];
		const flats: SceneData['flats'] = [];
		for (const r of rows) {
			const tags = JSON.parse(r.tags ?? '{}');
			const geom = JSON.parse(r.geometry ?? '{}');
			const osmType = (r.osm_type ?? 'way') as 'way' | 'relation';
			const osmId = r.osm_id ?? 0;
			const oid = `${osmType}/${osmId}`;
			const name = r.name ?? null;
			if (r.kind === 'building') {
				buildings.push({
					id: oid,
					osmType,
					osmId,
					kind: 'building',
					tags,
					name,
					outer: geom.outer ?? [],
					holes: geom.holes ?? [],
					height: r.height ?? 0,
					minHeight: r.min_height ?? 0
				});
			} else if (r.kind === 'road') {
				roads.push({
					id: oid,
					osmType,
					osmId,
					kind: 'road',
					tags,
					name,
					points: geom.points ?? [],
					width: r.width ?? 0
				});
			} else if (r.kind === 'water' || r.kind === 'green') {
				flats.push({
					id: oid,
					osmType,
					osmId,
					kind: r.kind,
					tags,
					name,
					outer: geom.outer ?? [],
					holes: geom.holes ?? []
				});
			}
		}
		return {
			meta: { mapId: String(m.id), createdAt: String(m.created_at) },
			bbox: { minLng: m.min_lng, minLat: m.min_lat, maxLng: m.max_lng, maxLat: m.max_lat },
			buildings,
			roads,
			flats
		};
	} finally {
		db.close();
	}
}

/** All saved maps, newest first. */
export function listMaps(): SavedMapMeta[] {
	ensureDir();
	const out: SavedMapMeta[] = [];
	for (const f of readdirSync(MAPS_DIR)) {
		if (!f.endsWith('.sqlite')) continue;
		const meta = readMapMeta(f.slice(0, -'.sqlite'.length));
		if (meta) out.push(meta);
	}
	out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
	return out;
}
