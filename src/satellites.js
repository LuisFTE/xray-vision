import * as THREE from 'three';
import * as satellite from 'satellite.js';
import { azAltToScene, DEG } from './geo.js';
import { makeLabel, keepAngularSize } from './labels.js';

// Satellites from CelesTrak's public orbital elements (space stations + brightest objects).
// Positions are propagated locally every frame with SGP4, so no polling is needed.

const LABEL_ALWAYS = /ISS|TIANHE|CSS|HST|HUBBLE/i;

export class Satellites {
  constructor(parent) {
    this.group = new THREE.Group();
    parent.add(this.group);
    this.sats = [];
    this.status = 'loading';
    this.visibleCount = 0;
  }

  async load() {
    try {
      const groups = ['stations', 'visual'];
      const lists = await Promise.all(
        groups.map((g) => fetch(`/api/celestrak/NORAD/elements/gp.php?GROUP=${g}&FORMAT=json`).then((r) => r.json())),
      );
      const byId = new Map();
      for (const list of lists) for (const omm of list) byId.set(omm.NORAD_CAT_ID, omm);
      for (const omm of byId.values()) {
        let satrec;
        try {
          satrec = satellite.json2satrec(omm);
        } catch {
          continue;
        }
        const name = omm.OBJECT_NAME.trim();
        const important = LABEL_ALWAYS.test(name);
        const dot = new THREE.Mesh(
          new THREE.SphereGeometry(1, 8, 6),
          new THREE.MeshBasicMaterial({ color: important ? 0x66ffcc : 0x55cc88, transparent: true }),
        );
        dot.userData.angular = important ? 0.006 : 0.003;
        const label = makeLabel(name, { color: important ? '#66ffcc' : '#55cc88', size: important ? 26 : 20, bg: null });
        label.userData.angular = important ? 0.016 : 0.011;
        this.group.add(dot, label);
        this.sats.push({ name, satrec, dot, label, important });
      }
      this.status = 'live';
    } catch (e) {
      this.status = 'error: ' + e.message;
    }
  }

  update(date, lat, lon, heightM, cameraPos) {
    const gd = { latitude: lat * DEG, longitude: lon * DEG, height: heightM / 1000 };
    const gmst = satellite.gstime(date);
    let visible = 0;
    for (const s of this.sats) {
      const pv = satellite.propagate(s.satrec, date);
      if (!pv || !pv.position) {
        s.dot.visible = s.label.visible = false;
        continue;
      }
      const ecf = satellite.eciToEcf(pv.position, gmst);
      const look = satellite.ecfToLookAngles(gd, ecf);
      const el = look.elevation / DEG;
      const az = look.azimuth / DEG;
      const rangeM = look.rangeSat * 1000;
      const p = azAltToScene(az, el, rangeM);
      s.dot.position.set(...p);
      s.label.position.set(...p);
      // Sky only: satellites below the horizon are hidden.
      const up = el > 0;
      s.dot.visible = s.label.visible = up;
      if (!up) continue;
      visible++;
      keepAngularSize(s.dot, cameraPos);
      keepAngularSize(s.label, cameraPos);
    }
    this.visibleCount = visible;
  }
}
