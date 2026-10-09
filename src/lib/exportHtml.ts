// Self-contained HTML export: serializes the generated SceneData into ONE
// .html file that renders the same pure-Three.js scene fully offline.
//
// How it stays self-contained: the minified three.module.min.js +
// three.core.min.js sources are inlined (base64) and at open time booted via
// blob-URL dynamic import — no CDN, no network. Geometry is precomputed
// through the shared $lib/sceneMeshes pipeline (identical to the live view),
// so the exporter only ships attribute arrays + a ~150-line viewer.

import { buildMeshes } from '$lib/sceneMeshes';
import type { SceneData } from '$lib/osmToScene';

/** Float32Array → base64 (chunked so we never blow the call stack). */
function b64f32(a: Float32Array): string {
	const u8 = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
	let s = '';
	const CH = 0x8000;
	for (let i = 0; i < u8.length; i += CH) {
		s += String.fromCharCode(...u8.subarray(i, i + CH));
	}
	return btoa(s);
}

interface GeoPayload {
	position: string;
	normal: string;
	color: string | null;
	count: number;
}

function harvest(geo: import('three').BufferGeometry | null): GeoPayload | null {
	if (!geo) return null;
	const pos = geo.getAttribute('position');
	const nor = geo.getAttribute('normal');
	const col = geo.getAttribute('color');
	const out: GeoPayload = {
		position: b64f32(pos.array as Float32Array),
		normal: nor ? b64f32(nor.array as Float32Array) : '',
		color: col ? b64f32(col.array as Float32Array) : null,
		count: pos.count
	};
	geo.dispose();
	return out;
}

/** Load the minified three build sources (vite aliases → ?raw, code-split). */
async function loadThreeSources(): Promise<{ core: string; mod: string }> {
	const [core, mod] = await Promise.all([
		import('three-inline/core?raw'),
		import('three-inline/mod?raw')
	]);
	return { core: core.default, mod: mod.default };
}

export async function exportSceneHtml(scene: SceneData): Promise<Blob> {
	const built = buildMeshes(scene);
	const payload = {
		meta: scene.meta,
		counts: {
			buildings: scene.buildings.length,
			roads: scene.roads.length,
			water: scene.flats.filter((f) => f.kind === 'water').length,
			green: scene.flats.filter((f) => f.kind === 'green').length
		},
		ground: built.ground,
		geos: {
			buildings: harvest(built.buildings),
			roads: harvest(built.roads),
			water: harvest(built.water),
			green: harvest(built.green)
		}
	};

	const { core, mod } = await loadThreeSources();
	// base64-embed the library sources; JSON payload is embedded raw with `<`
	// escaped (`<\/`) so `</script>` inside data can't terminate the tag.
	const dataJson = JSON.stringify(payload).replace(/<\//g, '<\\/');
	const coreB64 = btoa(core);
	const modB64 = btoa(mod);

	const html = HTML_HEAD + '<script id="data" type="application/json">' + dataJson + '</script>\n' +
		'<script id="three-core" type="text/plain">' + coreB64 + '</script>\n' +
		'<script id="three-mod" type="text/plain">' + modB64 + '</script>\n' +
		'<script type="module">\n' + VIEWER_JS + '</script>\n</body>\n</html>\n';
	return new Blob([html], { type: 'text/html' });
}

const HTML_HEAD = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>3D map</title>
<style>
	html, body { margin: 0; height: 100%; overflow: hidden; background: #dfe5ea;
		font-family: system-ui, sans-serif; }
	canvas { display: block; }
	#hud { position: fixed; top: 10px; left: 10px; z-index: 5; color: #e8eaed;
		background: rgba(14,15,18,.82); border: 1px solid #33363c; border-radius: 8px;
		padding: 8px 10px; font-size: 12px; max-width: calc(100vw - 20px); }
	#hud .t { font-weight: 600; margin-bottom: 2px; }
	#hud .m { color: #9aa3ad; }
	#hud button { all: unset; cursor: pointer; border: 1px solid #44484f;
		border-radius: 5px; padding: 2px 7px; margin: 6px 4px 0 0; font-size: 12px; }
	#hud button:hover { border-color: #34d399; color: #34d399; }
	#fail { position: fixed; inset: 0; display: grid; place-items: center; color: #5b6470; }
</style>
</head>
<body>
<div id="hud"></div>
`;

// Viewer runtime. Plain string concat only — no template literals — so it can
// be embedded in the exporter's own template safely.
const VIEWER_JS = [
	"const el = (id) => document.getElementById(id);",
	"function bytes(b64) {",
	"  const bin = atob(b64);",
	"  const u8 = new Uint8Array(bin.length);",
	"  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);",
	"  return u8;",
	"}",
	"function f32(b64) { return new Float32Array(bytes(b64).buffer); }",
	"const DATA = JSON.parse(el('data').textContent);",
	"",
	"async function boot() {",
	"  // inline three.js: core first, then the module with its relative",
	"  // './three.core.min.js' specifiers rewritten to the core blob URL",
	"  const coreUrl = URL.createObjectURL(new Blob([bytes(el('three-core').textContent)], { type: 'text/javascript' }));",
	"  const modSrc = new TextDecoder().decode(bytes(el('three-mod').textContent));",
	"  const patched = modSrc.split('./three.core.min.js').join(coreUrl);",
	"  const modUrl = URL.createObjectURL(new Blob([patched], { type: 'text/javascript' }));",
	"  const THREE = await import(modUrl);",
	"",
	"  const G = DATA.ground;",
	"  const diag = Math.max(1, Math.hypot(G.w, G.h));",
	"",
	"  const scene = new THREE.Scene();",
	"  scene.background = new THREE.Color('#dfe5ea');",
	"  const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, Math.max(0.1, diag / 1000), diag * 10);",
	"  let renderer;",
	"  try { renderer = new THREE.WebGLRenderer({ antialias: true }); }",
	"  catch (e) {",
	"    const d = document.createElement('div'); d.id = 'fail';",
	"    d.textContent = 'WebGL is not available in this browser.';",
	"    document.body.appendChild(d); return;",
	"  }",
	"  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));",
	"  renderer.setSize(innerWidth, innerHeight);",
	"  document.body.appendChild(renderer.domElement);",
	"",
	"  const sun = new THREE.DirectionalLight('#ffffff', 2.2);",
	"  sun.position.set(0.5, 1, 0.35).multiplyScalar(diag * 10);",
	"  scene.add(sun);",
	"  scene.add(new THREE.AmbientLight('#ffffff', 0.9));",
	"",
	"  function mesh(rec, material) {",
	"    if (!rec) return null;",
	"    const g = new THREE.BufferGeometry();",
	"    g.setAttribute('position', new THREE.BufferAttribute(f32(rec.position), 3));",
	"    g.setAttribute('normal', new THREE.BufferAttribute(f32(rec.normal), 3));",
	"    if (rec.color) g.setAttribute('color', new THREE.BufferAttribute(f32(rec.color), 3));",
	"    const m = new THREE.Mesh(g, material); scene.add(m); return m;",
	"  }",
	"  mesh(DATA.geos.buildings, new THREE.MeshLambertMaterial({ vertexColors: true }));",
	"  mesh(DATA.geos.roads, new THREE.MeshLambertMaterial({ color: '#e8e6e0' }));",
	"  mesh(DATA.geos.water, new THREE.MeshLambertMaterial({ color: '#8ec7e8' }));",
	"  mesh(DATA.geos.green, new THREE.MeshLambertMaterial({ color: '#9cc98f' }));",
	"  const ground = new THREE.Mesh(",
	"    new THREE.PlaneGeometry(G.w * 1.2, G.h * 1.2),",
	"    new THREE.MeshLambertMaterial({ color: '#ccd3c4' })",
	"  );",
	"  ground.rotation.x = -Math.PI / 2;",
	"  ground.position.set(G.cx, 0, G.cz);",
	"  scene.add(ground);",
	"",
	"  // spherical camera around the scene centre, same presets as the app",
	"  const PRESETS = { top: [0.02, 0, 0.95], iso: [0.98, 0.54, 1.07], low: [1.4, 0.6, 0.9], high: [0.6, 0.54, 1.6], side: [1.54, 0, 1.15] };",
	"  let sph = { phi: 0.02, theta: 0, r: 0.95 * diag };",
	"  function applyCam() {",
	"    camera.position.setFromSphericalCoords(sph.r, sph.phi, sph.theta);",
	"    camera.lookAt(0, 0, 0);",
	"  }",
	"  applyCam();",
	"",
	"  // mini controls: left-drag pan, right-drag rotate, wheel zoom",
	"  let drag = null;",
	"  const dom = renderer.domElement;",
	"  dom.addEventListener('contextmenu', (e) => e.preventDefault());",
	"  dom.addEventListener('pointerdown', (e) => { drag = { b: e.button, x: e.clientX, y: e.clientY }; dom.setPointerCapture(e.pointerId); });",
	"  dom.addEventListener('pointermove', (e) => {",
	"    if (!drag) return;",
	"    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;",
	"    drag.x = e.clientX; drag.y = e.clientY;",
	"    if (drag.b === 2) {",
	"      sph.theta -= dx * 0.005;",
	"      sph.phi = Math.max(0.02, Math.min(Math.PI / 2 - 0.02, sph.phi + dy * 0.005));",
	"    } else {",
	"      const k = sph.r / dom.clientHeight;",
	"      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0);",
	"      const up = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1);",
	"      camera.position.addScaledVector(right, -dx * k).addScaledVector(up, dy * k);",
	"    }",
	"    applyCam();",
	"  });",
	"  dom.addEventListener('pointerup', (e) => { drag = null; dom.releasePointerCapture(e.pointerId); });",
	"  dom.addEventListener('wheel', (e) => {",
	"    e.preventDefault();",
	"    sph.r = Math.max(diag * 0.01, Math.min(diag * 5, sph.r * (e.deltaY > 0 ? 1.1 : 0.9)));",
	"    applyCam();",
	"  }, { passive: false });",
	"",
	"  addEventListener('resize', () => {",
	"    camera.aspect = innerWidth / innerHeight;",
	"    camera.updateProjectionMatrix();",
	"    renderer.setSize(innerWidth, innerHeight);",
	"  });",
	"",
	"  (function tick() { requestAnimationFrame(tick); renderer.render(scene, camera); })();",
	"  window.__viewer = renderer.info; // diagnostics: render.calls / triangles > 0 = drawing",
	"",
	"  const c = DATA.counts;",
	"  el('hud').innerHTML =",
	"    '<div class=t>3D map · ' + c.buildings + ' buildings · ' + c.roads + ' roads · ' + c.water + ' water · ' + c.green + ' green</div>' +",
	"    '<div class=m>self-contained export · left-drag pan · right-drag rotate · wheel zoom</div>' +",
	"    Object.keys(PRESETS).map((k) => '<button data-p=' + k + '>' + k.charAt(0).toUpperCase() + k.slice(1) + '</button>').join('');",
	"  el('hud').addEventListener('click', (e) => {",
	"    const k = e.target && e.target.getAttribute && e.target.getAttribute('data-p');",
	"    if (!k) return;",
	"    const p = PRESETS[k];",
	"    sph = { phi: p[0], theta: p[1], r: p[2] * diag };",
	"    applyCam();",
	"  });",
	"}",
	"boot();"
].join('\n');
