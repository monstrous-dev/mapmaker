// GET /api/maps/[id]/download — stream the map's SQLite file to the client.
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { readFileSync } from 'node:fs';
import { dbPath, mapExists, safeMapId } from '$lib/server/db';

export const GET: RequestHandler = async ({ params }) => {
	const id = safeMapId(params.id);
	if (!id || !mapExists(id)) throw error(404, 'Map not found');
	const buf = readFileSync(dbPath(id));
	return new Response(new Uint8Array(buf), {
		headers: {
			'content-type': 'application/vnd.sqlite3',
			'content-disposition': `attachment; filename="map-${id}.sqlite"`,
			'content-length': String(buf.byteLength)
		}
	});
};
