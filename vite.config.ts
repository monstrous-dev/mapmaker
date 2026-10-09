import { fileURLToPath } from 'node:url';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, type Alias } from 'vite';

// three's exports map hides ./build/* — these aliases let the HTML exporter
// ($lib/exportHtml.ts) pull the minified library sources via ?raw and inline
// them into self-contained downloads. Regex form so the ?raw query survives.
const threeInline: Alias[] = [
	{ find: /^three-inline\/core(\?raw)$/, replacement: fileURLToPath(new URL('./node_modules/three/build/three.core.min.js', import.meta.url)) + '$1' },
	{ find: /^three-inline\/mod(\?raw)$/, replacement: fileURLToPath(new URL('./node_modules/three/build/three.module.min.js', import.meta.url)) + '$1' }
];

export default defineConfig({
	plugins: [sveltekit()],
	resolve: {
		alias: threeInline
	},
	// svelte-maplibre-gl/vite registers the MapLibre v6 worker via `?worker&url`,
	// which esbuild cannot pre-bundle (504 "Outdated Optimize Dep" reload loop).
	// maplibre-gl itself must also stay out of the optimizer (tile worker).
	// The three-inline ?raw imports must NOT be optimized either — esbuild would
	// bundle them as code instead of exporting the file contents as a string.
	optimizeDeps: {
		exclude: ['svelte-maplibre-gl', 'maplibre-gl', 'three-inline/core?raw', 'three-inline/mod?raw']
	}
});
