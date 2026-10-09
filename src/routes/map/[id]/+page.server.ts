// /map/[id] — full-viewport standalone view of one generated map, loaded
// straight from its SQLite database so the URL is shareable and survives a
// refresh / new tab.
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { readMapScene, safeMapId } from '$lib/server/db';

export const load: PageServerLoad = async ({ params }) => {
	const id = safeMapId(params.id);
	if (!id) throw error(404, 'Not found');
	const scene = readMapScene(id);
	if (!scene) throw error(404, 'Map not found');
	return { scene };
};
