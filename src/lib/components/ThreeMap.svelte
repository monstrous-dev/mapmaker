<script lang="ts">
	// Pure-Three.js 3D viewport — NO MapLibre here. Renders a SceneData
	// descriptor: extruded buildings (height-ramp vertex colors), flat
	// roads/water/green, ground plane in real metres. One merged BufferGeometry
	// per category; everything disposed on rebuild/destroy.
	//
	// Picking: each sub-geometry is stamped with a per-vertex `objId` attribute
	// (its index into pickList) before merging, so a raycast hit's faceIndex
	// resolves straight back to the originating OSM object without per-object
	// meshes. Camera: 5 spherical presets (top/2D default) + az/el nudges,
	// eased via a short fly tween that suspends OrbitControls input.

	import { onMount } from 'svelte';
	import * as THREE from 'three';
	import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
	import { buildMeshes, v2ring, ribbonGeometry, flatGeometry } from '$lib/sceneMeshes';
	import { extrudePrism } from '$lib/extrude';
	import type { SceneData, SceneObject } from '$lib/osmToScene';
	import type { Projector } from '$lib/projection';
	import type { ViewController, PresetName } from '$lib/view';

	let {
		scene = null as SceneData | null,
		selectedObj = null as SceneObject | null,
		onselect = (_o: SceneObject | null) => {},
		onmapselect = () => {},
		view = {} as ViewController
	}: {
		scene?: SceneData | null;
		selectedObj?: SceneObject | null;
		onselect?: (o: SceneObject | null) => void;
		onmapselect?: () => void;
		view?: ViewController;
	} = $props();

	let container: HTMLDivElement;

	let renderer: THREE.WebGLRenderer | undefined;
	let threeScene: THREE.Scene;
	let camera: THREE.PerspectiveCamera;
	let controls: OrbitControls;
	let world: THREE.Group | null = null;
	let pickList: SceneObject[] = [];
	const raycaster = new THREE.Raycaster();
	let raf = 0;

	// selection highlight: the selected object's edges, rebuilt on each change.
	let lastProj: Projector | null = null;
	let highlight: THREE.LineSegments | null = null;
	const HL_MAT = new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.95 });

	// scene scale + camera target (scene is centred on the origin)
	let diag = 1;
	const center = new THREE.Vector3(0, 0, 0);
	let fly: { from: THREE.Vector3; to: THREE.Vector3; t: number } | null = null;
	const FLY_MS = 600;

	// height ramp + geometry builders (ribbon/flat/paint/stamp/merge) live in
	// $lib/sceneMeshes.ts — shared with the HTML exporter

	const MAT = {
		building: new THREE.MeshLambertMaterial({ vertexColors: true }),
		road: new THREE.MeshLambertMaterial({ color: '#e8e6e0' }),
		water: new THREE.MeshLambertMaterial({ color: '#8ec7e8' }),
		green: new THREE.MeshLambertMaterial({ color: '#9cc98f' }),
		ground: new THREE.MeshLambertMaterial({ color: '#ccd3c4' })
	};


	function clearHighlight() {
		if (highlight) {
			threeScene.remove(highlight);
			highlight.geometry.dispose();
			highlight = null;
		}
	}

	/** Rebuild the single highlight LineSegments from the selected object's own geometry. */
	function setHighlight(obj: SceneObject | null) {
		clearHighlight();
		if (!obj || !lastProj) return;
		const proj = lastProj;
		let geo: THREE.BufferGeometry | null = null;
		if (obj.kind === 'building') {
			geo = extrudePrism(v2ring(proj, obj.outer), obj.holes.map((r) => v2ring(proj, r)), obj.height, obj.minHeight);
		} else if (obj.kind === 'road') {
			geo = ribbonGeometry(v2ring(proj, obj.points), obj.width, 0.2);
		} else {
			geo = flatGeometry(v2ring(proj, obj.outer), obj.holes.map((r) => v2ring(proj, r)), 0.1);
		}
		if (!geo) return;
		const edges = new THREE.EdgesGeometry(geo, 1);
		geo.dispose();
		highlight = new THREE.LineSegments(edges, HL_MAT);
		threeScene.add(highlight);
	}

	function disposeWorld() {
		clearHighlight();
		if (!world) return;
		world.traverse((o) => {
			if (o instanceof THREE.Mesh) o.geometry.dispose();
		});
		threeScene.remove(world);
		world = null;
		pickList = [];
	}

	function buildWorld(data: SceneData) {
		disposeWorld();
		const built = buildMeshes(data);
		lastProj = built.proj;

		world = new THREE.Group();
		if (built.buildings) world.add(new THREE.Mesh(built.buildings, MAT.building));
		if (built.roads) world.add(new THREE.Mesh(built.roads, MAT.road));
		if (built.water) world.add(new THREE.Mesh(built.water, MAT.water));
		if (built.green) world.add(new THREE.Mesh(built.green, MAT.green));

		// ground plane, real metres + 10% margin (no objId → clicking it = map select)
		const ground = new THREE.Mesh(new THREE.PlaneGeometry(built.ground.w * 1.2, built.ground.h * 1.2), MAT.ground);
		ground.rotation.x = -Math.PI / 2;
		ground.position.set(built.ground.cx, 0, built.ground.cz);
		world.add(ground);
		pickList = built.pickList;

		threeScene.add(world);

		// frame the scene
		diag = Math.max(1, Math.hypot(built.ground.w, built.ground.h));
		camera.near = Math.max(0.1, diag / 1000);
		camera.far = diag * 10;
		camera.updateProjectionMatrix();
		controls.target.copy(center);
		controls.minDistance = Math.max(1, diag * 0.01); // allow zooming right up to buildings
		controls.maxDistance = diag * 5;
		flyToPreset('top', true); // default: straight-down 2D
		controls.update();
	}

	// ---- camera presets + nudges (spherical around the origin) -------------
	const PRESETS: Record<PresetName, { phi: number; theta: number; r: number }> = {
		// phi = polar angle from +Y (rad); theta = azimuth; r = radius in units of diag
		top: { phi: 0.02, theta: 0, r: 0.95 }, // straight-down 2D plan
		iso: { phi: 0.98, theta: 0.54, r: 1.07 }, // classic 3/4 isometric
		low: { phi: 1.4, theta: 0.6, r: 0.9 }, // shallow street-ish angle
		high: { phi: 0.6, theta: 0.54, r: 1.6 }, // high, wide overview
		side: { phi: 1.54, theta: 0, r: 1.15 } // near-horizontal side elevation
	};
	function sphericalOf(): THREE.Spherical {
		const offset = new THREE.Vector3().subVectors(camera.position, center);
		return new THREE.Spherical().setFromVector3(offset);
	}
	function posFromSpherical(sph: THREE.Spherical): THREE.Vector3 {
		return new THREE.Vector3().setFromSpherical(sph).add(center);
	}
	function easeInOut(t: number): number {
		return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
	}
	function flyTo(to: THREE.Vector3, instant = false): void {
		if (instant) {
			camera.position.copy(to);
			controls.update();
			return;
		}
		fly = { from: camera.position.clone(), to: to.clone(), t: 0 };
		controls.enabled = false; // suspend user input for the duration of the tween
	}
	function flyToPreset(name: PresetName, instant = false): void {
		const p = PRESETS[name];
		flyTo(posFromSpherical(new THREE.Spherical(p.r * diag, p.phi, p.theta)), instant);
	}
	function nudge(tiltDeg: number, rotDeg: number): void {
		const sph = sphericalOf();
		sph.theta += (rotDeg * Math.PI) / 180;
		sph.phi = Math.max(0.02, Math.min(Math.PI / 2 - 0.02, sph.phi + (tiltDeg * Math.PI) / 180));
		flyTo(posFromSpherical(sph));
	}

	// ---- picking ------------------------------------------------------------
	let downPos = { x: 0, y: 0, t: 0, btn: -1 };
	function onPointerDown(e: PointerEvent) {
		downPos = { x: e.clientX, y: e.clientY, t: performance.now(), btn: e.button };
	}
	function onPointerUp(e: PointerEvent) {
		// only a left (primary) click selects; right-drag now orbits, left-drag pans
		if (downPos.btn !== 0) return;
		if (Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y) > 5) return;
		if (performance.now() - downPos.t > 400) return;
		pick(e);
	}
	function pick(e: PointerEvent) {
		if (!renderer || !world) return;
		const rect = renderer.domElement.getBoundingClientRect();
		const ndc = new THREE.Vector2(
			((e.clientX - rect.left) / rect.width) * 2 - 1,
			-((e.clientY - rect.top) / rect.height) * 2 + 1
		);
		raycaster.setFromCamera(ndc, camera);
		const hits = raycaster.intersectObjects(world.children, true);
		if (!hits.length) {
			onselect(null); // clicked the sky → deselect
			return;
		}
		const hit = hits[0];
		const idAttr = (hit.object as THREE.Mesh).geometry.getAttribute('objId');
		if (idAttr && hit.faceIndex != null) {
			const id = (idAttr.array as ArrayLike<number>)[hit.faceIndex * 3];
			const obj = pickList[id];
			if (obj) {
				onselect(obj);
				return;
			}
		}
		onmapselect(); // hit the ground plane (or an unmapped face) → map drawer
	}

	onMount(() => {
		renderer = new THREE.WebGLRenderer({ antialias: true });
		renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		container.appendChild(renderer.domElement);

		threeScene = new THREE.Scene();
		threeScene.background = new THREE.Color('#dfe5ea');
		camera = new THREE.PerspectiveCamera(50, 1, 0.1, 10000);
		controls = new OrbitControls(camera, renderer.domElement);
		controls.enableDamping = true;
		controls.target.copy(center);
		controls.maxPolarAngle = Math.PI / 2 - 0.02; // never dip below the ground
		// swapped from the OrbitControls default: left = pan, right = orbit (rotate)
		controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };

		const sun = new THREE.DirectionalLight('#ffffff', 2.2);
		sun.position.set(0.5, 1, 0.35).multiplyScalar(1000);
		threeScene.add(sun);
		threeScene.add(new THREE.AmbientLight('#ffffff', 0.9));

		// expose the imperative camera API to the parent toolbar
		view.setPreset = (p) => flyToPreset(p);
		view.rotateBy = (deg) => nudge(0, deg);
		view.tiltBy = (deg) => nudge(deg, 0);
		view.reset = () => flyToPreset('top');

		const dom = renderer.domElement;
		dom.addEventListener('pointerdown', onPointerDown);
		dom.addEventListener('pointerup', onPointerUp);

		const ro = new ResizeObserver(() => {
			if (!renderer) return;
			const { clientWidth: cw, clientHeight: ch } = container;
			if (!cw || !ch) return;
			renderer.setSize(cw, ch);
			camera.aspect = cw / ch;
			camera.updateProjectionMatrix();
		});
		ro.observe(container);

		if (scene) buildWorld(scene); // scene may have arrived before mount

		let last = performance.now();
		const tick = () => {
			raf = requestAnimationFrame(tick);
			const now = performance.now();
			const dt = now - last;
			last = now;
			if (fly) {
				fly.t += dt / FLY_MS;
				camera.position.lerpVectors(fly.from, fly.to, easeInOut(Math.min(1, fly.t)));
				camera.lookAt(center);
				if (fly.t >= 1) {
					fly = null;
					controls.enabled = true;
					controls.update(); // sync OrbitControls' internal state
				}
			} else {
				controls.update();
			}
			renderer?.render(threeScene, camera);
		};
		tick();

		return () => {
			cancelAnimationFrame(raf);
			ro.disconnect();
			dom.removeEventListener('pointerdown', onPointerDown);
			dom.removeEventListener('pointerup', onPointerUp);
			disposeWorld();
			controls.dispose();
			HL_MAT.dispose();
			for (const m of Object.values(MAT)) m.dispose();
			renderer?.dispose();
			renderer?.domElement.remove();
			renderer = undefined;
			view.setPreset = undefined;
			view.rotateBy = undefined;
			view.tiltBy = undefined;
			view.reset = undefined;
		};
	});

	// rebuild the world whenever a new scene descriptor arrives
	$effect(() => {
		if (scene && renderer) buildWorld(scene);
	});

	// redraw the selection edges whenever the selected object changes
	$effect(() => {
		if (renderer) setHighlight(selectedObj);
	});
</script>

<div class="viewport" bind:this={container}>
	{#if !scene}
		<div class="empty muted">Draw an area above and hit Generate — the pure-Three.js scene renders here.</div>
	{/if}
</div>

<style>
	.viewport {
		position: relative;
		height: 100%;
		width: 100%;
		overflow: hidden;
		border-radius: var(--radius);
		border: 1px solid var(--border);
		background: #dfe5ea;
	}
	.viewport :global(canvas) {
		display: block;
	}
	.empty {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		color: #5b6470;
	}
</style>
