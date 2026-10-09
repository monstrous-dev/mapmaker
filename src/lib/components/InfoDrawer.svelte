<script lang="ts">
	// Slide-in info panel. Shows a clicked object's OSM identity, derived
	// geometry stats, and full tag set — or, for a map-area click, the bbox,
	// element counts, and the SQLite download for this generated map.

	import { fly } from 'svelte/transition';
	import type { Selection, MapMeta } from '$lib/osmToScene';
	import type { BBox } from '$lib/types';
	import { polyArea, lineLength, ringPerimeter, fmtArea, fmtLen } from '$lib/measure';

	let {
		selection = null as Selection | null,
		mapMeta = null as MapMeta | null,
		bbox = null as BBox | null,
		counts = null as { buildings: number; roads: number; water: number; green: number } | null,
		sqliteUrl = null as string | null,
		onClose = () => {}
	}: {
		selection?: Selection | null;
		mapMeta?: MapMeta | null;
		bbox?: BBox | null;
		counts?: { buildings: number; roads: number; water: number; green: number } | null;
		sqliteUrl?: string | null;
		onClose?: () => void;
	} = $props();

	const KIND_LABEL: Record<string, string> = {
		building: 'Building',
		road: 'Road',
		water: 'Water',
		green: 'Park / Green',
		map: 'Map area'
	};
	const KIND_ICON: Record<string, string> = {
		building: '🏢',
		road: '🛣️',
		water: '💧',
		green: '🌳',
		map: '🗺️'
	};

	const obj = $derived(selection?.kind === 'object' ? selection.object : null);
	const osmUrl = $derived(
		obj && obj.osmType !== 'map' ? `https://www.openstreetmap.org/${obj.osmType}/${obj.osmId}` : null
	);
	const tagEntries = $derived(
		obj ? Object.entries(obj.tags).sort((a, b) => a[0].localeCompare(b[0])) : []
	);

	// label/value stats grid, derived per object kind
	const stats = $derived.by(() => {
		if (!obj) return [] as { label: string; value: string }[];
		const o = obj; // capture once so kind-narrowing works
		const out: { label: string; value: string }[] = [];
		if (o.kind === 'building') {
			out.push({ label: 'Height', value: `${o.height.toFixed(1)} m` });
			if (o.minHeight > 0) out.push({ label: 'Base height', value: `${o.minHeight.toFixed(1)} m` });
			out.push({ label: 'Levels', value: o.tags['building:levels'] ?? '—' });
			out.push({ label: 'Footprint', value: fmtArea(polyArea(o.outer, o.holes)) });
		} else if (o.kind === 'road') {
			out.push({ label: 'Width', value: `${o.width.toFixed(1)} m` });
			out.push({ label: 'Length', value: fmtLen(lineLength(o.points)) });
			out.push({ label: 'Class', value: o.tags.highway ?? '—' });
			if (o.tags.surface) out.push({ label: 'Surface', value: o.tags.surface });
		} else {
			// water / green
			out.push({ label: 'Area', value: fmtArea(polyArea(o.outer, o.holes)) });
			out.push({ label: 'Perimeter', value: fmtLen(ringPerimeter(o.outer)) });
		}
		return out;
	});

	function fmtCoord(n: number): string {
		return n.toFixed(5);
	}
	const created = $derived(mapMeta ? new Date(mapMeta.createdAt).toLocaleString() : null);
</script>

{#if selection}
	<aside class="drawer" transition:fly={{ x: 380, duration: 250 }}>
		<header class="dhead">
			<div class="title">
				<span class="icon">{KIND_ICON[selection.kind]}</span>
				<div>
					<h3>{obj ? obj.name ?? `${KIND_LABEL[obj.kind]} ${obj.osmId}` : 'Map area'}</h3>
					<span class="badge">{KIND_LABEL[selection.kind]}</span>
				</div>
			</div>
			<button class="x" onclick={onClose} aria-label="Close">✕</button>
		</header>

		<div class="body">
			{#if obj}
				{#if osmUrl}
					<a class="osm" href={osmUrl} target="_blank" rel="noopener">
						Open in OpenStreetMap ↗
					</a>
				{/if}

				{#if stats.length}
					<section class="grid">
						{#each stats as s}
							<div class="stat">
								<span class="lbl">{s.label}</span>
								<span class="val mono">{s.value}</span>
							</div>
						{/each}
					</section>
				{/if}

				<section class="id">
					<span class="lbl">OSM id</span>
					<code class="mono">{obj.osmType}/{obj.osmId}</code>
				</section>

				<section class="tags">
					<h4>Tags ({tagEntries.length})</h4>
					<div class="taglist">
						{#each tagEntries as [k, v]}
							<div class="tag"><span class="k">{k}</span><span class="v">{v}</span></div>
						{:else}
							<p class="muted">No tags.</p>
						{/each}
					</div>
				</section>
			{:else}
				<!-- map-area selection -->
				{#if bbox}
					<section class="bbox">
						<h4>Bounding box</h4>
						<div class="grid">
							<div class="stat"><span class="lbl">West</span><span class="val mono">{fmtCoord(bbox.minLng)}</span></div>
							<div class="stat"><span class="lbl">East</span><span class="val mono">{fmtCoord(bbox.maxLng)}</span></div>
							<div class="stat"><span class="lbl">South</span><span class="val mono">{fmtCoord(bbox.minLat)}</span></div>
							<div class="stat"><span class="lbl">North</span><span class="val mono">{fmtCoord(bbox.maxLat)}</span></div>
						</div>
					</section>
				{/if}
				{#if counts}
					<section class="grid">
						<div class="stat"><span class="lbl">🏢 Buildings</span><span class="val mono">{counts.buildings}</span></div>
						<div class="stat"><span class="lbl">🛣️ Roads</span><span class="val mono">{counts.roads}</span></div>
						<div class="stat"><span class="lbl">💧 Water</span><span class="val mono">{counts.water}</span></div>
						<div class="stat"><span class="lbl">🌳 Green</span><span class="val mono">{counts.green}</span></div>
					</section>
				{/if}
				{#if created}
					<p class="muted mono small">Generated {created}</p>
				{/if}
				{#if sqliteUrl}
					<a class="dl" href={sqliteUrl} download>⬇ Download this map's SQLite database</a>
				{:else}
					<p class="muted small">Saving database…</p>
				{/if}
			{/if}
		</div>
	</aside>
{/if}

<style>
	.drawer {
		position: fixed;
		top: 0;
		right: 0;
		height: 100vh;
		width: 380px;
		max-width: 92vw;
		background: var(--panel);
		border-left: 1px solid var(--border);
		z-index: 51;
		display: flex;
		flex-direction: column;
		box-shadow: -10px 0 30px rgba(0, 0, 0, 0.35);
	}
	.dhead {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0.9rem 1rem;
		border-bottom: 1px solid var(--border);
	}
	.title {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		min-width: 0;
	}
	.icon {
		font-size: 1.5rem;
	}
	.title h3 {
		margin: 0;
		font-size: 1rem;
		line-height: 1.2;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.badge {
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--muted);
	}
	.x {
		background: none;
		border: none;
		color: var(--muted);
		font-size: 1.1rem;
		cursor: pointer;
		padding: 0.2rem 0.4rem;
		border-radius: var(--radius);
	}
	.x:hover {
		color: var(--text);
		background: var(--panel-2);
	}
	.body {
		flex: 1;
		overflow-y: auto;
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
	.osm {
		display: block;
		text-align: center;
		text-decoration: none;
		padding: 0.55rem;
		border-radius: var(--radius);
		border: 1px solid var(--border);
		background: var(--panel-2);
		color: var(--accent);
		font-size: 0.85rem;
	}
	.osm:hover {
		border-color: var(--accent);
	}
	.grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.5rem;
	}
	.stat {
		background: var(--panel-2);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 0.5rem 0.6rem;
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}
	.stat .lbl {
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--muted);
	}
	.stat .val {
		font-size: 0.9rem;
		color: var(--text);
	}
	.id {
		display: flex;
		align-items: center;
		justify-content: space-between;
		background: var(--panel-2);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 0.5rem 0.7rem;
	}
	.id .lbl {
		font-size: 0.75rem;
		color: var(--muted);
	}
	code {
		font-size: 0.85rem;
		color: var(--accent-2);
	}
	.tags h4,
	.bbox h4 {
		margin: 0 0 0.5rem;
		font-size: 0.8rem;
		color: var(--muted);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.taglist {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}
	.tag {
		display: flex;
		gap: 0.5rem;
		font-size: 0.8rem;
		border-bottom: 1px dashed var(--border);
		padding-bottom: 0.3rem;
	}
	.tag .k {
		color: var(--accent-2);
		min-width: 8rem;
		flex-shrink: 0;
		word-break: break-all;
	}
	.tag .v {
		color: var(--text);
		word-break: break-word;
	}
	.small {
		font-size: 0.8rem;
	}
	.dl {
		text-align: center;
		text-decoration: none;
		padding: 0.6rem;
		border-radius: var(--radius);
		background: var(--accent);
		color: #04130c;
		font-weight: 600;
	}
	.dl:hover {
		filter: brightness(1.05);
	}
	.mono {
		font-family: var(--mono);
	}
</style>
