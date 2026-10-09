// GET /api/maps/[id] — metadata for one saved map.
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { mapExists, readMapMeta, safeMapId } from '$lib/server/db';

export const GET: RequestHandler = async ({ params }) => {
	const id = safeMapId(params.id);
	if (!id || !mapExists(id)) throw error(404, 'Map not found');
	const meta = readMapMeta(id);
	if (!meta) throw error(404, 'Map not found');
	return json(meta);
};
