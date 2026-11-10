import * as THREE from 'three';
import { LocalFrame } from './geo.js';
import { LOCATIONS } from './locations.js';
import { Sky } from './sky.js';
import { Planes } from './planes.js';
import { Satellites } from './satellites.js';
import { Buildings } from './buildings.js';
import { DropInMap } from './map.js';

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, logarithmicDepthBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const DESKTOP_BG = new THREE.Color(0x02060a);
scene.background = DESKTOP_BG;

const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 2e7);
camera.position.set(0, 1.7, 0);
camera.rotation.order = 'YXZ';

// root.rotation.y = heading calibration (turn the whole world until north lines up)
const root = new THREE.Group();
scene.add(root);
// world.position.y = -(your height above the street)
const world = new THREE.Group();
root.add(world);

// Flat ground at street level (no globe): a fading grid you stand on.
function makeGround() {
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { color: { value: new THREE.Color(0x1d7a8c) } },
    vertexShader: `
      varying vec2 vXZ;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main() {
        vXZ = position.xz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `
      uniform vec3 color;
      varying vec2 vXZ;
      #include <logdepthbuf_pars_fragment>
      float grid(vec2 p, float step) {
        vec2 g = abs(fract(p / step - 0.5) - 0.5) / fwidth(p / step);
        return 1.0 - min(min(g.x, g.y), 1.0);
      }
      void main() {
        #include <logdepthbuf_fragment>
        float d = length(vXZ);
        float lines = max(grid(vXZ, 10.0) * 0.5, grid(vXZ, 100.0));
        float fade = 1.0 - smoothstep(300.0, 3000.0, d);
        float a = (0.04 + lines * 0.5) * fade;
        if (a < 0.003) discard;
        gl_FragColor = vec4(color, a);
      }`,
  });
  const g = new THREE.Mesh(new THREE.CircleGeometry(3000, 96).rotateX(-Math.PI / 2), mat);
  g.renderOrder = -1;
  return g;
}
const ground = makeGround();
world.add(ground);

const sky = new Sky(root);
const buildings = new Buildings(world);
const planes = new Planes(world);
const sats = new Satellites(root);

// ---------- location ----------
let frame = null;
let observerH = 0;
const $ = (id) => document.getElementById(id);

const sel = $('loc');
for (const l of LOCATIONS) sel.add(new Option(l.name, l.id));
sel.add(new Option('Custom…', 'custom'));

function teleport(lat, lon, h) {
  frame = new LocalFrame(lat, lon, 0);
  observerH = h;
  world.position.y = -h;
  $('lat').value = lat.toFixed(5);
  $('lon').value = lon.toFixed(5);
  $('h').value = Math.round(h);
  const u = new URL(location.href);
  u.searchParams.set('lat', lat.toFixed(5));
  u.searchParams.set('lon', lon.toFixed(5));
  u.searchParams.set('h', String(Math.round(h)));
  history.replaceState(null, '', u);
  buildings.load(frame);
  planes.setFrame(frame);
  lastSkyUpdate = 0;
}

sel.onchange = () => {
  const l = LOCATIONS.find((x) => x.id === sel.value);
  if (l) teleport(l.lat, l.lon, l.h);
};
const dropMap = new DropInMap(
  (lat, lon, h) => {
    sel.value = 'custom';
    teleport(lat, lon, h);
  },
  () => planes.list(),
);
const openMap = () => frame && dropMap.toggle(frame.lat, frame.lon, observerH);
$('mapbtn').onclick = openMap;

$('go').onclick = () => {
  sel.value = 'custom';
  teleport(parseFloat($('lat').value), parseFloat($('lon').value), parseFloat($('h').value) || 0);
};

// ---------- layers ----------
const bindLayer = (id, fn) => {
  $(id).onchange = (e) => fn(e.target.checked);
};
bindLayer('lyr-buildings', (v) => (buildings.group.visible = v));
bindLayer('lyr-ground', (v) => (ground.visible = v));
bindLayer('lyr-planes', (v) => (planes.group.visible = v));
bindLayer('lyr-sats', (v) => (sats.group.visible = v));
bindLayer('lyr-stars', (v) => (sky.group.visible = v));
bindLayer('lyr-const', (v) => {
  sky.showConstellations = v;
  lastSkyUpdate = 0;
});

// ---------- desktop look controls ----------
let yaw = 0;
let pitch = -0.12;
let dragging = false;
renderer.domElement.addEventListener('pointerdown', (e) => {
  dragging = true;
  renderer.domElement.setPointerCapture(e.pointerId);
});
renderer.domElement.addEventListener('pointerup', () => (dragging = false));
renderer.domElement.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const k = 0.0035 * (camera.fov / 70);
  yaw += e.movementX * k;
  pitch = Math.max(-1.55, Math.min(1.55, pitch + e.movementY * k));
});
renderer.domElement.addEventListener('wheel', (e) => {
  camera.fov = Math.max(5, Math.min(100, camera.fov * (e.deltaY > 0 ? 1.1 : 0.9)));
  camera.updateProjectionMatrix();
});
const keys = new Set();
addEventListener('keydown', (e) => {
  if (e.target.closest?.('input, select, textarea')) return; // typing, not flying
  const k = e.key.toLowerCase();
  keys.add(k);
  if (k === 'h') $('hud').classList.toggle('hidden');
  if (k === 'm') openMap();
  if (k === 'escape' && dropMap.isOpen) dropMap.close();
});
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------- AR ----------
const arBtn = $('ar');
async function setupAR() {
  const ok = navigator.xr && (await navigator.xr.isSessionSupported('immersive-ar').catch(() => false));
  if (!ok) {
    arBtn.textContent = window.isSecureContext ? 'AR NOT AVAILABLE (OPEN ON QUEST)' : 'AR NEEDS HTTPS';
    return;
  }
  arBtn.disabled = false;
  arBtn.textContent = 'ENTER X-RAY VISION';
  arBtn.onclick = async () => {
    const session = await navigator.xr.requestSession('immersive-ar', { optionalFeatures: ['local-floor'] });
    scene.background = null; // let passthrough show through
    session.addEventListener('end', () => {
      scene.background = DESKTOP_BG;
      camera.position.set(0, 1.7, 0);
    });
    await renderer.xr.setSession(session);
  };
}
setupAR();

function readSticks(dt) {
  const session = renderer.xr.getSession();
  if (!session) return;
  for (const src of session.inputSources) {
    const ax = src.gamepad?.axes;
    if (!ax || ax.length < 4) continue;
    const x = Math.abs(ax[2]) > 0.15 ? ax[2] : 0;
    const y = Math.abs(ax[3]) > 0.15 ? ax[3] : 0;
    if (src.handedness === 'right') root.rotation.y -= x * dt * 0.6;
    if (src.handedness === 'left' && y) {
      observerH = Math.max(0, observerH - y * dt * 20 * (1 + observerH / 50));
      world.position.y = -observerH;
    }
  }
}

// ---------- loop ----------
const camPos = new THREE.Vector3();
const clock = new THREE.Clock();
let lastSkyUpdate = 0;
let lastStatus = 0;

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1);
  const now = performance.now();

  if (!renderer.xr.isPresenting) {
    if (keys.has('q')) root.rotation.y += dt * 0.6;
    if (keys.has('e')) root.rotation.y -= dt * 0.6;
    camera.rotation.set(-pitch, -yaw, 0);
  } else {
    readSticks(dt);
  }
  camera.getWorldPosition(camPos);

  if (frame) {
    const date = new Date();
    if (now - lastSkyUpdate > 5000) {
      sky.update(date, frame.lat, frame.lon, observerH);
      lastSkyUpdate = now;
    }
    sky.frame(camPos, renderer);
    if (sats.group.visible) sats.update(date, frame.lat, frame.lon, observerH, camPos);
    planes.update(camPos, dt);
    buildings.frame(camPos);
  }

  if (now - lastStatus > 1000) {
    lastStatus = now;
    const north = (((-root.rotation.y * 180) / Math.PI) % 360 + 360) % 360;
    const sunAlt = sky.sunAltitude ?? NaN;
    $('status').textContent =
      `planes: ${planes.count} (${planes.status})\n` +
      `buildings: ${buildings.count} (${buildings.status})\n` +
      `satellites overhead: ${sats.visibleCount} (${sats.status})\n` +
      `sun: ${Number.isFinite(sunAlt) ? sunAlt.toFixed(1) + '° ' + (sunAlt > 0 ? '(day)' : '(night)') : '…'}\n` +
      `height: ${Math.round(observerH)} m · north offset: ${north.toFixed(0)}°`;
  }

  renderer.render(scene, camera);
});

// ---------- boot ----------
await Promise.all([sky.load(), sats.load()]);
const qp = new URLSearchParams(location.search);
if (qp.has('lat') && qp.has('lon')) {
  sel.value = 'custom';
  teleport(parseFloat(qp.get('lat')), parseFloat(qp.get('lon')), parseFloat(qp.get('h')) || 0);
} else {
  sel.value = LOCATIONS[0].id;
  sel.onchange();
}
