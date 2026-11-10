import * as THREE from 'three';
import { makeLabel, keepAngularSize } from './labels.js';

// Hologram city: OpenStreetMap building footprints extruded to their real heights.
// Rendered as glowing edges plus faint translucent walls, the "X-ray" look.

const DEFAULT_H = 12;
const LEVEL_H = 3.4;
const NAMED_MIN_H = 120; // label landmark towers taller than this

function parseHeight(tags) {
  const h = parseFloat(String(tags.height || '').replace(',', '.'));
  if (Number.isFinite(h) && h > 0) return h;
  const lv = parseFloat(tags['building:levels']);
  if (Number.isFinite(lv) && lv > 0) return lv * LEVEL_H;
  return DEFAULT_H;
}

export class Buildings {
  constructor(parent) {
    this.group = new THREE.Group();
    parent.add(this.group);
    this.status = 'idle';
    this.count = 0;
    this.labels = [];
  }

  clear() {
    for (const c of [...this.group.children]) {
      this.group.remove(c);
      c.geometry?.dispose();
      c.material?.dispose();
    }
    this.labels = [];
    this.count = 0;
  }

  async load(frame, radiusM = 900) {
    this.clear();
    this.status = 'loading';
    const q = `[out:json][timeout:60];way["building"](around:${radiusM},${frame.lat},${frame.lon});out tags geom;`;
    try {
      const r = await fetch('/api/overpass?data=' + encodeURIComponent(q));
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const data = await r.json();
      this._build(frame, data.elements || []);
      this.status = 'ready';
    } catch (e) {
      this.status = 'error: ' + e.message;
    }
  }

  _build(frame, elements) {
    const edges = []; // line segment vertices
    const walls = []; // triangle vertices
    const named = [];
    for (const el of elements) {
      if (!el.geometry || el.geometry.length < 3) continue;
      const tags = el.tags || {};
      const h = parseHeight(tags);
      const minH = parseFloat(tags.min_height) || 0;
      const pts = el.geometry.map((g) => frame.flat(g.lat, g.lon)); // [east, north]
      const n = pts.length - (pts[0][0] === pts.at(-1)[0] && pts[0][1] === pts.at(-1)[1] ? 1 : 0);
      const y0 = minH; // world group is shifted by your height, so stay street-relative here
      const y1 = h;
      for (let i = 0; i < n; i++) {
        const [ea, na] = pts[i];
        const [eb, nb] = pts[(i + 1) % n];
        // Bottom and top outlines + vertical corner edges.
        edges.push(ea, y0, -na, eb, y0, -nb, ea, y1, -na, eb, y1, -nb, ea, y0, -na, ea, y1, -na);
        // Wall quad as two triangles.
        walls.push(ea, y0, -na, eb, y0, -nb, eb, y1, -nb, ea, y0, -na, eb, y1, -nb, ea, y1, -na);
      }
      if (tags.name && h >= NAMED_MIN_H) {
        let cx = 0;
        let cn = 0;
        for (let i = 0; i < n; i++) {
          cx += pts[i][0];
          cn += pts[i][1];
        }
        named.push({ name: tags.name, x: cx / n, y: y1 + 4, z: -cn / n, h });
      }
      this.count++;
    }

    const eg = new THREE.BufferGeometry();
    eg.setAttribute('position', new THREE.Float32BufferAttribute(edges, 3));
    const lines = new THREE.LineSegments(
      eg,
      new THREE.LineBasicMaterial({ color: 0x33e0ff, transparent: true, opacity: 0.7, depthWrite: false }),
    );
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(walls, 3));
    const fill = new THREE.Mesh(
      wg,
      new THREE.MeshBasicMaterial({
        color: 0x0a4a66,
        transparent: true,
        opacity: 0.12,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    this.group.add(fill, lines);

    // De-duplicate names (towers are often split into several ways) and keep the tallest.
    const best = new Map();
    for (const b of named) if (!best.has(b.name) || best.get(b.name).h < b.h) best.set(b.name, b);
    for (const b of best.values()) {
      const label = makeLabel(b.name, { color: '#9fefff', size: 24 });
      label.position.set(b.x, b.y, b.z);
      label.userData.angular = 0.014;
      this.group.add(label);
      this.labels.push(label);
    }
  }

  frame(cameraPos) {
    for (const l of this.labels) keepAngularSize(l, cameraPos);
  }
}
