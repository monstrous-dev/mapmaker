// POST /api/maps — persist a generated map to its own SQLite file.
// GET  /api/maps — list all saved maps (newest first).
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listMaps, safeMapId, writeMap, type BBoxLike, type ElementInput } from '$lib/server/db';

function isBBox(b: unknown): b is BBoxLike {
	if (!b || typeof b !== 'object') return false;
	const o = b as Record<string, unknown>;
	return (
		typeof o.minLng === 'number' && isFinite(o.minLng) &&
		typeof o.minLat === 'number' && isFinite(o.minLat) &&
		typeof o.maxLng === 'number' && isFinite(o.maxLng) &&
		typeof o.maxLat === 'number' && isFinite(o.maxLat)
	);
}

export const POST: RequestHandler = async ({ request }) => {
	let body: Record<string, unknown>;
	try {
		body = (await request.json()) as Record<string, unknown>;
	} catch {
		throw error(400, 'Invalid JSON body');
	}

	const meta = body.meta as Record<string, unknown> | undefined;
	const mapId = safeMapId(meta?.mapId);
	if (!mapId) throw error(400, 'Missing or invalid meta.mapId');
	if (!isBBox(body.bbox)) throw error(400, 'Missing or invalid bbox');

	const createdAt =
		typeof meta?.createdAt === 'string' ? meta.createdAt : new Date().toISOString();

	try {
		const saved = writeMap(
			mapId,
			createdAt,
			body.bbox,
			{
				buildings: (body.buildings as ElementInput[]) ?? [],
				roads: (body.roads as ElementInput[]) ?? [],
				flats: (body.flats as ElementInput[]) ?? []
			}
		);
		return json(saved, { status: 201 });
	} catch (e) {
		console.error('[api/maps] save failed:', e);
		throw error(500, 'Failed to write map database');
	}
};

export const GET: RequestHandler = async () => {
	return json(listMaps());
};
