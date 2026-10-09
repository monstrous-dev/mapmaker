import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		// adapter-node: run as SSR on a VPS/Railway (stack-preferences-smb §1, §20).
		adapter: adapter()
	}
};

export default config;
