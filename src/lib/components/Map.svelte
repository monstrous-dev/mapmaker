<script lang="ts">
	// 2D area-selection map — the ONLY MapLibre in this component (the 3D view is
	// pure Three.js). Two draw modes: Rectangle (click-drag box) and Freeform
	// (click-drag to trace a polygon). The drawn Area is emitted to the parent.
	//
	// Conventions match ../base-map-gen: declarative svelte-maplibre-gl layers,
	// CARTO Positron, draw gesture attached imperatively to the raw map instance.

	import 'svelte-maplibre-gl/vite'; // required for maplibre-gl v6 worker
	import { MapLibre, GeoJSONSource, FillLayer, LineLayer, NavigationControl, ScaleControl } from 'svelte-maplibre-gl';
	import * as maplibregl from 'maplibre-gl'; // v6 type defs: namespace import, no default export
	import type { Area, BBox } from '$lib/types';

	let { onarea = (_a: Area | null) => {} }: { onarea?: (a: Area | null) => void } = $props();

	const STYLE = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';
	type Mode = 'rect' | 'free';
	let mode = $state<Mode>('rect');
	let drawMode = $state(false);
	let area = $state<Area | null>(null);
	let map = $state<maplibregl.Map | undefined>(undefined);

	let selectionFC = $derived(area ? areaFC(area) : emptyFC());

	function chooseMode(m: Mode) {
		if (drawMode && mode === m) {
			drawMode = false; // toggle off — keep the drawn area
			return;
		}
		if (mode !== m) {
			area = null; // switching shape → clear
			onarea(null);
		}
		mode = m;
		drawMode = true;
	}

	// Draw gesture attaches imperatively to the raw map instance once it exists.
	$effect(() => {
		if (!map) return;
		const m = map;

		let drawing = false;
		let rectStart: { lng: number; lat: number } | null = null;
		let freePts: [number, number][] = [];

		const onDown = (e: maplibregl.MapMouseEvent) => {
			if (!drawMode) return;
			drawing = true;
			if (mode === 'rect') {
				rectStart = e.lngLat;
				area = { type: 'bbox', bbox: fromLngLat(e.lngLat, e.lngLat) };
			} else {
				freePts = [[e.lngLat.lng, e.lngLat.lat]];
				area = { type: 'polygon', ring: [...freePts] };
			}
		};
		const onMove = (e: maplibregl.MapMouseEvent) => {
			if (!drawing) return;
			if (mode === 'rect' && rectStart) {
				area = { type: 'bbox', bbox: fromLngLat(rectStart, e.lngLat) };
			} else if (mode === 'free') {
				// throttle: skip points within ~3px of the last to keep rings small
				const last = freePts[freePts.length - 1];
				if (last) {
					const a = m.project([last[0], last[1]]);
					const b = m.project([e.lngLat.lng, e.lngLat.lat]);
					if (Math.hypot(a.x - b.x, a.y - b.y) < 3) return;
				}
				freePts.push([e.lngLat.lng, e.lngLat.lat]);
				area = { type: 'polygon', ring: [...freePts] };
			}
		};
		const onUp = () => {
			if (!drawing) return;
			drawing = false;
			if (mode === 'rect') {
				if (area?.type === 'bbox' && bigEnough(area.bbox)) onarea(area);
				else {
					area = null;
					onarea(null);
				}
			} else {
				if (freePts.length >= 3) onarea({ type: 'polygon', ring: [...freePts] });
				else {
					area = null;
					onarea(null);
				}
			}
		};

		m.on('mousedown', onDown);
		m.on('mousemove', onMove);
		m.on('mouseup', onUp);
		return () => {
			m.off('mousedown', onDown);
			m.off('mousemove', onMove);
			m.off('mouseup', onUp);
		};
	});

	// drawing mode: disable pan/zoom so drag means "draw"
	$effect(() => {
		if (!map) return;
		if (drawMode) {
			map.dragPan.disable();
			map.boxZoom.disable();
			map.doubleClickZoom?.disable();
			map.getCanvas().style.cursor = 'crosshair';
		} else {
			map.dragPan.enable();
			map.boxZoom.enable();
			map.doubleClickZoom?.enable();
			map.getCanvas().style.cursor = '';
		}
	});

	function fromLngLat(a: { lng: number; lat: number }, b: { lng: number; lat: number }): BBox {
		return {
			minLng: Math.min(a.lng, b.lng),
			minLat: Math.min(a.lat, b.lat),
			maxLng: Math.max(a.lng, b.lng),
			maxLat: Math.max(a.lat, b.lat)
		};
	}
	function bigEnough(b: BBox): boolean {
		return b.maxLng - b.minLng > 1e-5 && b.maxLat - b.minLat > 1e-5;
	}

	type FC = GeoJSON.FeatureCollection;
	function emptyFC(): FC {
		return { type: 'FeatureCollection', features: [] };
	}
	/** Close a ring for GeoJSON Polygon rendering (first === last). */
	function closeRing(ring: [number, number][]): [number, number][] {
		const r = ring.slice();
		const f = r[0];
		const l = r[r.length - 1];
		if (r.length && (f[0] !== l[0] || f[1] !== l[1])) r.push(r[0]);
		return r;
	}
	function areaFC(a: Area): FC {
		const ring: [number, number][] =
			a.type === 'bbox'
				? [
						[a.bbox.minLng, a.bbox.minLat],
						[a.bbox.maxLng, a.bbox.minLat],
						[a.bbox.maxLng, a.bbox.maxLat],
						[a.bbox.minLng, a.bbox.maxLat],
						[a.bbox.minLng, a.bbox.minLat]
					]
				: closeRing(a.ring);
		return {
			type: 'FeatureCollection',
			features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } }]
		};
	}
</script>

<div class="map-wrap">
	<MapLibre
		bind:map
		style={STYLE}
		center={{ lng: 10, lat: 30 }}
		zoom={2}
		hash={true}
		inlineStyle="position:absolute;inset:0"
		attributionControl={{ compact: true }}
	>
		<NavigationControl position="top-right" />
		<ScaleControl position="bottom-left" unit="metric" />

		<!-- drawn selection (rectangle or freeform polygon) -->
		<GeoJSONSource data={selectionFC}>
			<FillLayer paint={{ 'fill-color': '#34d399', 'fill-opacity': 0.12 }} />
			<LineLayer paint={{ 'line-color': '#34d399', 'line-width': 2, 'line-dasharray': [2, 1] }} />
		</GeoJSONSource>
	</MapLibre>

	<div class="toolbar">
		<button class="btn draw" class:on={drawMode && mode === 'rect'} onclick={() => chooseMode('rect')}>
			▢ Rectangle
		</button>
		<button class="btn draw" class:on={drawMode && mode === 'free'} onclick={() => chooseMode('free')}>
			✎ Freeform
		</button>
	</div>
	{#if drawMode}
		<div class="hint">
			{mode === 'rect'
				? 'Click & drag to draw a box, then toggle the tool off.'
				: 'Click & drag to trace an area, release to finish.'}
		</div>
	{/if}
</div>

<style>
	.map-wrap {
		position: relative;
		height: 100%;
		width: 100%;
	}
	.toolbar {
		position: absolute;
		top: 12px;
		left: 12px;
		z-index: 5;
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}
	.btn.on {
		background: var(--accent);
		color: #04130c;
		border-color: var(--accent);
		font-weight: 600;
	}
	.hint {
		position: absolute;
		top: 56px;
		left: 12px;
		z-index: 5;
		background: rgba(14, 15, 18, 0.85);
		border: 1px solid var(--border);
		padding: 0.3rem 0.6rem;
		border-radius: var(--radius);
		font-size: 0.8rem;
		color: var(--muted);
	}
</style>
