import * as THREE from 'three';
import { FT, KNOT, DEG } from './geo.js';
import { makeLabel, keepAngularSize, disposeLabel } from './labels.js';

// Live aircraft from the public adsb.lol network (via the local dev-server cache/proxy).
// Positions are dead-reckoned between polls so planes glide instead of jumping.

const POLL_MS = 5000;
const RADIUS_NM = 40;
const TRAIL_POINTS = 40;

const planeGeo = new THREE.OctahedronGeometry(1, 0);

export class Planes {
  constructor(parent) {
    this.group = new THREE.Group();
    parent.add(this.group);
    this.planes = new Map(); // hex -> state
    this.frame = null;
    this.status = 'waiting';
    this.count = 0;
    this._timer = null;
  }

  setFrame(frame) {
    this.frame = frame;
    for (const p of this.planes.values()) this._remove(p);
    this.planes.clear();
    this.poll();
    clearInterval(this._timer);
    this._timer = setInterval(() => this.poll(), POLL_MS);
  }

  async poll() {
    if (!this.frame || this._inflight) return;
    this._inflight = true;
    const f = this.frame;
    try {
      const r = await fetch(`/api/adsb/v2/point/${f.lat.toFixed(4)}/${f.lon.toFixed(4)}/${RADIUS_NM}`);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const data = await r.json();
      if (f !== this.frame) return; // teleported mid-request
      this._ingest(data.ac || [], data.now || Date.now());
      this.status = 'live';
    } catch (e) {
      this.status = 'error: ' + e.message;
    } finally {
      this._inflight = false;
    }
  }

  _ingest(list, nowMs) {
    const seen = new Set();
    const t = performance.now();
    for (const a of list) {
      if (a.lat == null || a.lon == null) continue;
      const onGround = a.alt_baro === 'ground';
      const altFt = onGround ? 0 : (a.alt_geom ?? a.alt_baro);
      if (typeof altFt !== 'number') continue;
      seen.add(a.hex);
      const ageS = a.seen_pos ?? 0;
      // Geometric altitude is height above the WGS84 ellipsoid (NYC street ~ -28 m);
      // barometric is roughly above sea level (NYC street ~ +10 m).
      const ground = a.alt_geom != null && !onGround ? -28 : 10;
      const [x, y, z] = this.frame.scene(a.lat, a.lon, onGround ? 0 : altFt * FT - ground);
      const yy = y; // street-relative; the world group handles your height
      let p = this.planes.get(a.hex);
      if (!p) {
        p = this._create(a);
        this.planes.set(a.hex, p);
        p.pos.set(x, yy, z);
      }
      // Velocity in scene space from ground speed, track and vertical rate.
      const gs = (a.gs ?? 0) * KNOT;
      const trk = (a.track ?? 0) * DEG;
      p.vel.set(Math.sin(trk) * gs, ((a.geom_rate ?? a.baro_rate ?? 0) * FT) / 60, -Math.cos(trk) * gs);
      p.target.set(x, yy, z).addScaledVector(p.vel, ageS);
      p.targetTime = t;
      p.onGround = onGround;
      p.lat = a.lat;
      p.lon = a.lon;
      p.call = (a.flight || a.r || a.hex).trim();
      p.lastSeen = t;
      const label = this._labelText(a);
      if (label.join('|') !== p.labelKey) {
        this.group.remove(p.label);
        disposeLabel(p.label);
        p.label = makeLabel(label, { color: onGround ? '#88aa99' : '#ffd166', size: 26 });
        p.labelKey = label.join('|');
        this.group.add(p.label);
      }
      p.trail.push(p.target.clone());
      if (p.trail.length > TRAIL_POINTS) p.trail.shift();
    }
    for (const [hex, p] of this.planes) {
      if (!seen.has(hex) && t - p.lastSeen > 30000) {
        this._remove(p);
        this.planes.delete(hex);
      }
    }
    this.count = this.planes.size;
  }

  _labelText(a) {
    const call = (a.flight || a.r || a.hex).trim();
    const alt = a.alt_baro === 'ground' ? 'on ground' : `${Math.round((a.alt_baro ?? 0) / 100) * 100} ft`;
    const type = a.t ? ` ${a.t}` : '';
    return [`${call}${type}`, `${alt} · ${Math.round(a.gs ?? 0)} kt`];
  }

  _create(a) {
    const mesh = new THREE.Mesh(
      planeGeo,
      new THREE.MeshBasicMaterial({ color: a.alt_baro === 'ground' ? 0x88aa99 : 0xffd166 }),
    );
    mesh.userData.angular = 0.006;
    const label = makeLabel(this._labelText(a), { color: '#ffd166', size: 26 });
    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_POINTS * 3), 3));
    const trailLine = new THREE.Line(
      trailGeo,
      new THREE.LineBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.45 }),
    );
    trailLine.frustumCulled = false;
    this.group.add(mesh, label, trailLine);
    return {
      mesh,
      label,
      labelKey: '',
      trailLine,
      trail: [],
      pos: new THREE.Vector3(),
      target: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      targetTime: performance.now(),
      lastSeen: performance.now(),
    };
  }

  _remove(p) {
    this.group.remove(p.mesh, p.label, p.trailLine);
    p.mesh.material.dispose();
    p.trailLine.geometry.dispose();
    p.trailLine.material.dispose();
    disposeLabel(p.label);
  }

  /** Plain list for the 2D map. */
  list() {
    return [...this.planes.values()].map((p) => ({ lat: p.lat, lon: p.lon, label: p.call }));
  }

  update(cameraPos, dt) {
    const t = performance.now();
    for (const p of this.planes.values()) {
      // Where the plane should be now: last fix + velocity * elapsed.
      const elapsed = (t - p.targetTime) / 1000;
      const want = p.target.clone().addScaledVector(p.vel, Math.min(elapsed, 20));
      p.pos.lerp(want, Math.min(1, dt * 2));
      p.mesh.position.copy(p.pos);
      keepAngularSize(p.mesh, cameraPos);
      p.label.position.copy(p.pos);
      keepAngularSize(p.label, cameraPos);

      const arr = p.trailLine.geometry.attributes.position.array;
      p.trail.forEach((v, i) => arr.set([v.x, v.y, v.z], i * 3));
      p.trailLine.geometry.setDrawRange(0, p.trail.length);
      p.trailLine.geometry.attributes.position.needsUpdate = true;
    }
  }
}
