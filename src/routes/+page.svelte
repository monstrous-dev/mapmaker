<script lang="ts">
	import { extractOsm } from '$lib/overpass';
	import { elementsToScene, type SceneData, type SceneObject, type Selection } from '$lib/osmToScene';
	import type { ViewController, PresetName } from '$lib/view';
	import { bboxOfRing, elementInPolygon } from '$lib/clip';
	import type { Area } from '$lib/types';
	import Map from '$lib/components/Map.svelte';
	import ThreeMap from '$lib/components/ThreeMap.svelte';
	import InfoDrawer from '$lib/components/InfoDrawer.svelte';

	let area = $state<Area | null>(null);
	let scene = $state<SceneData | null>(null);
	let error = $state<string | null>(null);
	let generating = $state(false);

	// info drawer + SQLite persistence
	let selection = $state<Selection | null>(null);
	let saveStatus = $state<'idle' | 'saving' | 'saved' | 'failed'>('idle');
	let sqliteUrl = $state<string | null>(null);

	// self-contained HTML export
	let exportStatus = $state<'idle' | 'working' | 'done' | 'failed'>('idle');

	// imperative camera handle populated by ThreeMap on mount
	let view: ViewController = {};
	let activePreset = $state<PresetName | null>('top');

	// Asymptotic progress (repo rule: never hold flat, never fake 100%) —
	// creeps toward a cap that rises with real cell progress, asymptote at 99%,
	// plus a live elapsed timer. Set to 1 only when the scene is rendered.
	let progress = $state(0);
	let elapsed = $state(0);
	let cap = $state(0.1);

	$effect(() => {
		if (!generating) return;
		const t0 = Date.now();
		const iv = setInterval(() => {
			elapsed = (Date.now() - t0) / 1000;
			progress += (cap - progress) * 0.04; // increment shrinks near the cap
		}, 100);
		return () => clearInterval(iv);
	});

	async function generate() {
		if (!area || generating) return;
		generating = true;
		error = null;
		progress = 0;
		cap = 0.1;
		elapsed = 0;
		selection = null;
		saveStatus = 'idle';
		sqliteUrl = null;
		activePreset = 'top';
		try {
			const sel = area; // capture before await (area is reactive)
			const bbox = sel.type === 'bbox' ? sel.bbox : bboxOfRing(sel.ring);
			const raw = await extractOsm(bbox, (done, total) => {
				cap = 0.1 + 0.89 * (done / total); // real progress raises the asymptote, max 0.99
			});
			// freeform: query the polygon's bbox, then keep only elements inside the polygon
			const elements =
				sel.type === 'polygon' ? raw.filter((el) => elementInPolygon(el, sel.ring)) : raw;
			const meta = { mapId: crypto.randomUUID(), createdAt: new Date().toISOString() };
			const s = elementsToScene(elements, bbox, meta);
			scene = s;
			progress = 1;
			if (!s.buildings.length && !s.roads.length && !s.flats.length) {
				error = 'No buildings, roads, water or parks found in that area — try a town or city block.';
			}
			saveStatus = 'saving';
			saveMap(s);
		} catch (e) {
			error = (e as Error).message;
		} finally {
			generating = false;
		}
	}

	/** Persist every element of the generated map to its own SQLite file. */
	async function saveMap(s: SceneData) {
		try {
			const res = await fetch('/api/maps', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(s)
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			sqliteUrl = `/api/maps/${s.meta.mapId}/download`;
			saveStatus = 'saved';
		} catch {
			saveStatus = 'failed';
		}
	}

	/** Download the current scene as one self-contained, offline-capable HTML file. */
	async function exportHtml() {
		if (!scene || exportStatus === 'working') return;
		exportStatus = 'working';
		try {
			const { downloadSceneHtml } = await import('$lib/exportDownload');
			await downloadSceneHtml(scene);
			exportStatus = 'done';
		} catch {
			exportStatus = 'failed';
		}
	}

	// picking callbacks from the 3D viewport
	function handleObjectSelect(o: SceneObject | null) {
		selection = o ? { kind: 'object', object: o } : null;
	}
	function handleMapSelect() {
		selection = { kind: 'map' };
	}

	const PRESETS: { name: PresetName; label: string }[] = [
		{ name: 'top', label: 'Top (2D)' },
		{ name: 'iso', label: 'Iso' },
		{ name: 'low', label: 'Low' },
		{ name: 'high', label: 'High' },
		{ name: 'side', label: 'Side' }
	];
	function preset(p: PresetName) {
		view.setPreset?.(p);
		activePreset = p;
	}
	function nudge(rot: number, tilt: number) {
		if (rot) view.rotateBy?.(rot);
		if (tilt) view.tiltBy?.(tilt);
		activePreset = null;
	}
	function reset() {
		view.reset?.();
		activePreset = 'top';
	}

	const counts = $derived(
		scene
			? {
					buildings: scene.buildings.length,
					roads: scene.roads.length,
					water: scene.flats.filter((f) => f.kind === 'water').length,
					green: scene.flats.filter((f) => f.kind === 'green').length
				}
			: null
	);
	const saveLabel = $derived(
		saveStatus === 'saving'
			? '💾 Saving database…'
			: saveStatus === 'saved'
				? '✓ Saved to SQLite'
				: saveStatus === 'failed'
					? '⚠ Save failed'
					: null
	);
</script>

<svelte:head>
	<title>mapmaker — pure Three.js OSM 3D map generator</title>
</svelte:head>

<div class="page">
	<header>
		<div>
			<h1>mapmaker</h1>
			<p class="muted">
				Draw a box → client-side Overpass extraction → <b>pure Three.js</b> 3D scene. Click any object for
				details; every map is saved to its own SQLite database.
			</p>
		</div>
		<div class="actions">
			{#if saveLabel}<span class="save mono" class:ok={saveStatus === 'saved'} class:bad={saveStatus === 'failed'}>{saveLabel}</span>{/if}
			{#if scene}
				<button
					class="btn"
					title="Download this map as one self-contained HTML file (offline Three.js viewer + embedded geometry)"
					onclick={exportHtml}
					disabled={exportStatus === 'working'}
				>
					{exportStatus === 'working'
						? '⏳ Building HTML…'
						: exportStatus === 'done'
							? '✓ HTML downloaded'
							: exportStatus === 'failed'
								? '⚠ Export failed'
								: '⬇ Save HTML'}
				</button>
			{/if}
			<button class="btn primary" disabled={!area || generating} onclick={generate}>
				{generating ? 'Generating…' : '⚙ Generate 3D map'}
			</button>
			{#if exportStatus === 'failed'}
				<span class="save bad mono">HTML export failed</span>
			{/if}
		</div>
	</header>

	{#if generating}
		<div class="bar-row">
			<div class="progress"><div style="width: {(progress * 100).toFixed(1)}%"></div></div>
			<span class="mono muted">{(progress * 100).toFixed(0)}% · {elapsed.toFixed(0)}s</span>
		</div>
	{/if}
	{#if error}
		<p class="error">{error}</p>
	{/if}

	<div class="split">
		<section class="pane">
			<h2>1 · Select area (MapLibre 2D)</h2>
			<div class="map-box">
				<Map onarea={(a) => (area = a)} />
			</div>
		</section>

		<section class="pane">
			<h2>2 · Three.js 3D scene — click any object</h2>
			{#if counts}
				<p class="counts mono">
					🏢 {counts.buildings} buildings · 🛣 {counts.roads} roads · 💧 {counts.water} water · 🌳 {counts.green}
					green
				</p>
			{/if}
			<div class="map-box">
				<!-- camera controls -->
				<div class="viewctrl">
					{#each PRESETS as p}
						<button class="btn sm" class:on={activePreset === p.name} onclick={() => preset(p.name)}>{p.label}</button>
					{/each}
					<span class="sep"></span>
					<button class="btn sm" title="Rotate left" onclick={() => nudge(-15, 0)}>⟲</button>
					<button class="btn sm" title="Rotate right" onclick={() => nudge(15, 0)}>⟳</button>
					<button class="btn sm" title="Tilt toward top-down" onclick={() => nudge(0, -15)}>⤒</button>
					<button class="btn sm" title="Tilt toward horizon" onclick={() => nudge(0, 15)}>⤓</button>
					<button class="btn sm" title="Reset to top view" onclick={reset}>⟳ Reset</button>
				</div>

				{#if scene && saveStatus === 'saved'}
					<a class="ext" href={`/map/${scene.meta.mapId}`} target="_blank" rel="noopener" title="Open this map in a full page">↗</a>
				{/if}
				<ThreeMap
					{scene}
					selectedObj={selection?.kind === 'object' ? selection.object : null}
					onselect={handleObjectSelect}
					onmapselect={handleMapSelect}
					{view}
				/>
			</div>
		</section>
	</div>
</div>

<InfoDrawer
	{selection}
	mapMeta={scene?.meta ?? null}
	bbox={scene?.bbox ?? null}
	{counts}
	{sqliteUrl}
	onClose={() => (selection = null)}
/>

<style>
	.page {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		padding: 0.8rem;
		height: 100vh;
	}
	header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
	}
	header p {
		margin: 0;
	}
	.actions {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		gap: 0.8rem;
	}
	.save {
		font-size: 0.78rem;
		color: var(--muted);
	}
	.save.ok {
		color: var(--accent);
	}
	.save.bad {
		color: var(--danger);
	}
	.bar-row {
		display: flex;
		align-items: center;
		gap: 0.7rem;
	}
	.bar-row .progress {
		flex: 1;
	}
	.error {
		margin: 0;
		color: var(--danger);
	}
	.split {
		flex: 1;
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.8rem;
		min-height: 0;
	}
	.pane {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		min-height: 0;
	}
	.map-box {
		flex: 1;
		min-height: 0;
		position: relative;
		border-radius: var(--radius);
		overflow: hidden;
		border: 1px solid var(--border);
	}
	.counts {
		margin: 0;
		color: var(--muted);
	}
	.viewctrl {
		position: absolute;
		top: 10px;
		left: 10px;
		z-index: 5;
		display: flex;
		align-items: center;
		gap: 0.3rem;
		flex-wrap: wrap;
		background: rgba(14, 15, 18, 0.78);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 0.3rem;
		max-width: calc(100% - 20px);
	}
	.btn.sm {
		padding: 0.3rem 0.55rem;
		font-size: 0.8rem;
		border-color: transparent;
		background: transparent;
		color: var(--text);
	}
	.btn.sm:hover {
		border-color: var(--border);
		background: var(--panel-2);
	}
	.btn.sm.on {
		background: var(--accent);
		color: #04130c;
		font-weight: 600;
	}
	.sep {
		width: 1px;
		align-self: stretch;
		background: var(--border);
		margin: 0 0.15rem;
	}
	.ext {
		position: absolute;
		top: 10px;
		right: 10px;
		z-index: 6;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
		border-radius: var(--radius);
		background: rgba(14, 15, 18, 0.78);
		border: 1px solid var(--border);
		color: var(--text);
		text-decoration: none;
		font-size: 1rem;
	}
	.ext:hover {
		border-color: var(--accent);
		color: var(--accent);
	}
	@media (max-width: 900px) {
		.page {
			height: auto;
		}
		.split {
			grid-template-columns: 1fr;
		}
		.map-box {
			height: 60vh;
			flex: none;
		}
	}
</style>
