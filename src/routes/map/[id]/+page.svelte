<script lang="ts">
	// Standalone full-page map. Just the 3D viewport (with its camera controls
	// and info drawer) filling the screen — no selection pane, no generator.
	import ThreeMap from '$lib/components/ThreeMap.svelte';
	import InfoDrawer from '$lib/components/InfoDrawer.svelte';
	import type { ViewController, PresetName } from '$lib/view';
	import type { SceneObject, Selection } from '$lib/osmToScene';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const scene = $derived(data.scene);

	let selection = $state<Selection | null>(null);
	let view: ViewController = {};
	let activePreset = $state<PresetName | null>('top');

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

	const counts = $derived({
		buildings: scene.buildings.length,
		roads: scene.roads.length,
		water: scene.flats.filter((f) => f.kind === 'water').length,
		green: scene.flats.filter((f) => f.kind === 'green').length
	});
	const sqliteUrl = $derived(`/api/maps/${scene.meta.mapId}/download`);

	// self-contained HTML export
	let exportStatus = $state<'idle' | 'working' | 'done' | 'failed'>('idle');
	async function exportHtml() {
		if (exportStatus === 'working') return;
		exportStatus = 'working';
		try {
			const { downloadSceneHtml } = await import('$lib/exportDownload');
			await downloadSceneHtml(scene);
			exportStatus = 'done';
		} catch {
			exportStatus = 'failed';
		}
	}
</script>

<svelte:head>
	<title>Map · {scene.meta.mapId.slice(0, 8)}</title>
</svelte:head>

<div class="full">
	<a class="back btn" href="/" title="Back to generator">← Back</a>

	<button
		class="btn sm export"
		title="Download this map as one self-contained HTML file (offline Three.js viewer + embedded geometry)"
		onclick={exportHtml}
		disabled={exportStatus === 'working'}
	>
		{exportStatus === 'working' ? '⏳ Building HTML…' : exportStatus === 'done' ? '✓ HTML downloaded' : exportStatus === 'failed' ? '⚠ Export failed — retry' : '⬇ Save HTML'}
	</button>

	<div class="viewctrl">
		{#each PRESETS as p}
			<button class="btn sm" class:on={activePreset === p.name} onclick={() => preset(p.name)}>{p.label}</button>
		{/each}
		<span class="sep"></span>
		<button class="btn sm" title="Rotate left" onclick={() => nudge(-15, 0)}>⟲</button>
		<button class="btn sm" title="Rotate right" onclick={() => nudge(15, 0)}>⟳</button>
		<button class="btn sm" title="Tilt toward top-down" onclick={() => nudge(0, -15)}>⤒</button>
		<button class="btn sm" title="Tilt toward horizon" onclick={() => nudge(0, 15)}>⤓</button>
	</div>

	<ThreeMap
		{scene}
		selectedObj={selection?.kind === 'object' ? selection.object : null}
		onselect={handleObjectSelect}
		onmapselect={handleMapSelect}
		{view}
	/>
</div>

<InfoDrawer
	{selection}
	mapMeta={scene.meta}
	bbox={scene.bbox}
	{counts}
	{sqliteUrl}
	onClose={() => (selection = null)}
/>

<style>
	.full {
		position: fixed;
		inset: 0;
	}
	.back {
		position: absolute;
		top: 10px;
		left: 10px;
		z-index: 6;
		text-decoration: none;
	}
	.export {
		position: absolute;
		top: 10px;
		left: 92px;
		z-index: 6;
		background: rgba(14, 15, 18, 0.78);
	}
	.viewctrl {
		position: absolute;
		top: 10px;
		right: 10px;
		z-index: 6;
		display: flex;
		align-items: center;
		gap: 0.3rem;
		flex-wrap: wrap;
		justify-content: flex-end;
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
</style>
