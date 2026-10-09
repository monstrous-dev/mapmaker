// Shared download helper for the self-contained HTML export — builds the blob
// via $lib/exportHtml (dynamically imported: the inlined three.js sources are
// code-split and only fetched when an export actually runs) and triggers a
// browser download. Used by the generator page and the /map/[id] viewer.
import type { SceneData } from '$lib/osmToScene';

export async function downloadSceneHtml(scene: SceneData): Promise<void> {
	const { exportSceneHtml } = await import('$lib/exportHtml');
	const blob = await exportSceneHtml(scene);
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = `map-${scene.meta.mapId.slice(0, 8)}.html`;
	document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
