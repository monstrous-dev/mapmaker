// Client-side tiled Overpass extraction — structure/conventions lifted from
// ../base-map-gen/src/lib/generate.ts, with these gotchas applied: small ~0.05°
// cells, subdivide heavy cells, dedupe by OSM
// id, failover across mirrors (independent per-IP rate buckets, not retry),
// and a per-mirror AbortController client timeout because a dead mirror hangs
// fetch() forever ([timeout:N] only bounds the server-side query).

import type { BBox } from './types';

// Public Overpass mirrors — each has an INDEPENDENT per-IP rate limit.
// Verified 2026-10-09: overpass-api.de unreachable (TCP timeout), kumi /
// private.coffee / monicz 500ing intermittently — monicz.dev recovers on
// retry and is the only one answering, so it goes first. NEVER add
// overpass.osm.ch: it serves a Switzerland-only extract and returns HTTP 200
// with elements:[] everywhere else, which silently defeats the failover and
// surfaces as "No buildings found". fr/ is 403 whitelist-only; mail.ru has
// no CORS headers (client-side fetch would be blocked).
const OVERPASS_ENDPOINTS = [
	'https://overpass.monicz.dev/api/interpreter',
	'https://overpass-api.de/api/interpreter',
	'https://overpass.kumi.systems/api/interpreter',
	'https://overpass.private.coffee/api/interpreter'
];

const CLIENT_TIMEOUT_MS = 45_000; // per-mirror fetch abort

export interface RawNode {
	lat: number;
	lon: number;
}
export interface RawMember {
	type: 'way' | 'node' | 'relation';
	role: string;
	geometry?: RawNode[];
}
export interface RawElement {
	type: 'way' | 'relation';
	id: number;
	tags?: Record<string, string>;
	geometry?: RawNode[]; // ways, with `out geom;`
	members?: RawMember[]; // relations, with `out geom;`
}

/**
 * Query Overpass for everything we render inside the bbox. Runs client-side
 * (Overpass is CORS-enabled) so the user's IP holds the rate budget.
 * Per-cell progress via onProgress(done, total).
 */
export async function extractOsm(
	bbox: BBox,
	onProgress?: (done: number, total: number) => void
): Promise<RawElement[]> {
	const cells = tileBBox(bbox);
	const elements = new Map<string, RawElement>();
	let done = 0;
	onProgress?.(0, cells.length);
	for (const cell of cells) {
		await fetchCell(cell, elements, 0);
		onProgress?.(++done, cells.length);
	}
	return [...elements.values()];
}

// ~0.05° ≈ 5 km — small enough that public mirrors answer fast.
const CELL_DEG = 0.05;
const MAX_AXIS_CELLS = 4; // ≤ 16 cells total; cells grow beyond CELL_DEG for huge boxes

function tileBBox(bbox: BBox): BBox[] {
	const nx = Math.max(1, Math.min(MAX_AXIS_CELLS, Math.ceil((bbox.maxLng - bbox.minLng) / CELL_DEG)));
	const ny = Math.max(1, Math.min(MAX_AXIS_CELLS, Math.ceil((bbox.maxLat - bbox.minLat) / CELL_DEG)));
	const cw = (bbox.maxLng - bbox.minLng) / nx;
	const ch = (bbox.maxLat - bbox.minLat) / ny;
	const cells: BBox[] = [];
	for (let i = 0; i < nx; i++) {
		for (let j = 0; j < ny; j++) {
			cells.push({
				minLng: bbox.minLng + i * cw,
				maxLng: bbox.minLng + (i + 1) * cw,
				minLat: bbox.minLat + j * ch,
				maxLat: bbox.minLat + (j + 1) * ch
			});
		}
	}
	return cells;
}

async function fetchCell(bbox: BBox, acc: Map<string, RawElement>, depth: number): Promise<void> {
	const res = await runOverpass(queryFor(bbox));
	if (res.ok) {
		for (const el of res.elements) acc.set(`${el.type}/${el.id}`, el); // dedupe across cell borders
		return;
	}
	// Heavy-query failure (406/413/504): split into 4 quadrants and retry smaller.
	if (res.heavy && depth < 2) {
		const midLng = (bbox.minLng + bbox.maxLng) / 2;
		const midLat = (bbox.minLat + bbox.maxLat) / 2;
		for (const sub of [
			{ minLng: bbox.minLng, minLat: bbox.minLat, maxLng: midLng, maxLat: midLat },
			{ minLng: midLng, minLat: bbox.minLat, maxLng: bbox.maxLng, maxLat: midLat },
			{ minLng: bbox.minLng, minLat: midLat, maxLng: midLng, maxLat: bbox.maxLat },
			{ minLng: midLng, minLat: midLat, maxLng: bbox.maxLng, maxLat: bbox.maxLat }
		]) {
			await fetchCell(sub, acc, depth + 1);
		}
		return;
	}
	throw new Error(res.message);
}

function queryFor(bbox: BBox): string {
	// Overpass bbox order is south,west,north,east (lat,lng).
	const b = `${bbox.minLat},${bbox.minLng},${bbox.maxLat},${bbox.maxLng}`;
	return `[out:json][timeout:60];
(
  way["building"](${b});
  relation["building"](${b});
  way["highway"](${b});
  way["natural"="water"](${b});
  relation["natural"="water"](${b});
  way["leisure"~"^(park|garden)$"](${b});
  relation["leisure"~"^(park|garden)$"](${b});
);
out geom;`;
}

type OverpassResult = { ok: true; elements: RawElement[] } | { ok: false; heavy: boolean; message: string };

async function runOverpass(query: string): Promise<OverpassResult> {
	const body = 'data=' + encodeURIComponent(query);
	const attempts: string[] = [];
	let sawHeavy = false;
	let sawRate = false;

	// Two passes over ALL mirrors, with a short backoff between passes. Mirrors
	// have independent rate buckets, so a second pass (after the IP cools a few
	// seconds) usually finds one that answers.
	for (let pass = 0; pass < 2; pass++) {
		for (const endpoint of OVERPASS_ENDPOINTS) {
			const ctrl = new AbortController();
			const timer = setTimeout(() => ctrl.abort(), CLIENT_TIMEOUT_MS);
			try {
				const res = await fetch(endpoint, {
					method: 'POST',
					headers: { 'content-type': 'application/x-www-form-urlencoded' },
					body,
					signal: ctrl.signal
				});
				if (res.ok) {
					const data = (await res.json()) as { elements?: RawElement[] };
					return { ok: true, elements: data.elements ?? [] };
				}
				attempts.push(`${new URL(endpoint).host}:${res.status}`); // 429/504/etc → failover
				if (res.status === 406 || res.status === 413 || res.status === 504) sawHeavy = true;
				if (res.status === 429 || res.status === 503 || res.status === 529) sawRate = true;
			} catch {
				// DNS/conn refused/abort (dead mirror hang) → failover to next mirror
				attempts.push(`${new URL(endpoint).host}:net`);
			} finally {
				clearTimeout(timer);
			}
		}
		if (pass === 0) await sleep(3000);
	}

	return {
		ok: false,
		heavy: sawHeavy,
		message:
			(sawHeavy
				? 'Overpass rejected the query as too heavy. '
				: sawRate
					? 'Overpass rate-limited this IP. '
					: 'Overpass unavailable. ') +
			'Wait ~1 min, try a smaller area, or self-host an endpoint. ' +
			'Attempts: ' +
			attempts.join(', ')
	};
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
