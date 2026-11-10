import * as THREE from 'three';
import * as Astronomy from 'astronomy-engine';
import { azAltToScene, DEG } from './geo.js';
import { makeLabel, keepAngularSize } from './labels.js';

// Stars, constellations, sun, moon and planets at their true positions right now.
// Everything sits on a huge sphere, so it acts like "infinitely far away".

const R = 8e6; // sky sphere radius (m); beyond satellites, inside the far plane

// astronomy-engine horizontal frame: x = north, y = west, z = zenith.
function horToScene(v, r) {
  return [-v.y * r, v.z * r, -v.x * r];
}

function eqjVector(raDeg, decDeg, t) {
  const ra = raDeg * DEG;
  const dec = decDeg * DEG;
  return new Astronomy.Vector(Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec), t);
}

function bvToColor(bv) {
  // Rough B-V colour index -> RGB.
  const t = Math.max(-0.4, Math.min(2.0, Number(bv) || 0.6));
  if (t < 0) return [0.7, 0.8, 1.0];
  if (t < 0.5) return [0.9, 0.93, 1.0];
  if (t < 1.0) return [1.0, 0.95, 0.82];
  if (t < 1.5) return [1.0, 0.82, 0.6];
  return [1.0, 0.7, 0.5];
}

export class Sky {
  constructor(parent) {
    this.group = new THREE.Group();
    parent.add(this.group);
    this.stars = [];
    this.lines = [];
    this.labels = [];
    this.bodies = [];
    this.showConstellations = true;
    this._buildCardinals();
  }

  async load() {
    const [stars, lines, names] = await Promise.all([
      fetch('/data/stars.6.json').then((r) => r.json()),
      fetch('/data/constellations.lines.json').then((r) => r.json()),
      fetch('/data/constellations.json').then((r) => r.json()),
    ]);

    // d3-celestial stores RA as longitude in [-180, 180].
    this.stars = stars.features
      .filter((f) => f.properties.mag <= 5.5)
      .map((f) => ({
        ra: (f.geometry.coordinates[0] + 360) % 360,
        dec: f.geometry.coordinates[1],
        mag: f.properties.mag,
        color: bvToColor(f.properties.bv),
      }));

    const n = this.stars.length;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const sizes = new Float32Array(n);
    this.stars.forEach((s, i) => (s.size = sizes[i] = Math.max(1.5, 7 - s.mag * 1.1)));
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      vertexColors: true,
      uniforms: { pixelRatio: { value: 1 } },
      vertexShader: `
        attribute float size;
        varying vec3 vColor;
        uniform float pixelRatio;
        #include <common>
        #include <logdepthbuf_pars_vertex>
        void main() {
          vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = size * pixelRatio;
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: `
        varying vec3 vColor;
        #include <logdepthbuf_pars_fragment>
        void main() {
          #include <logdepthbuf_fragment>
          float d = length(gl_PointCoord - 0.5);
          if (d > 0.5) discard;
          gl_FragColor = vec4(vColor, smoothstep(0.5, 0.1, d));
        }`,
    });
    this.starPoints = new THREE.Points(geo, mat);
    this.starPoints.frustumCulled = false;
    this.group.add(this.starPoints);

    // Constellation stick figures.
    this.lineSegs = [];
    for (const f of lines.features) {
      const polys = f.geometry.type === 'MultiLineString' ? f.geometry.coordinates : [f.geometry.coordinates];
      for (const poly of polys) {
        for (let i = 0; i < poly.length - 1; i++) {
          this.lineSegs.push([(poly[i][0] + 360) % 360, poly[i][1], (poly[i + 1][0] + 360) % 360, poly[i + 1][1]]);
        }
      }
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.lineSegs.length * 6), 3));
    this.constLines = new THREE.LineSegments(
      lg,
      new THREE.LineBasicMaterial({ color: 0x4a6a9a, transparent: true, opacity: 0.55, depthWrite: false }),
    );
    this.constLines.frustumCulled = false;
    this.group.add(this.constLines);

    // Constellation names.
    this.constNames = names.features.map((f) => {
      const label = makeLabel(f.properties.name, { color: '#8fb0e0', size: 22, bg: null });
      label.userData.angular = 0.014;
      this.group.add(label);
      return { ra: (f.geometry.coordinates[0] + 360) % 360, dec: f.geometry.coordinates[1], label };
    });

    // Sun, moon, planets.
    const defs = [
      ['Sun', Astronomy.Body.Sun, 0xffe066, 0.05],
      ['Moon', Astronomy.Body.Moon, 0xf2f2f2, 0.04],
      ['Mercury', Astronomy.Body.Mercury, 0xffb3e6, 0.012],
      ['Venus', Astronomy.Body.Venus, 0xffb3e6, 0.016],
      ['Mars', Astronomy.Body.Mars, 0xff9966, 0.014],
      ['Jupiter', Astronomy.Body.Jupiter, 0xffb3e6, 0.016],
      ['Saturn', Astronomy.Body.Saturn, 0xffb3e6, 0.014],
    ];
    for (const [name, body, color, angular] of defs) {
      const disc = new THREE.Mesh(
        new THREE.SphereGeometry(1, 24, 12),
        new THREE.MeshBasicMaterial({ color, depthWrite: false, transparent: true }),
      );
      disc.userData.angular = angular / 2;
      const label = makeLabel(name, { color: '#' + color.toString(16).padStart(6, '0'), size: 24, bg: null });
      label.userData.angular = 0.016;
      this.group.add(disc, label);
      this.bodies.push({ name, body, disc, label });
    }
  }

  _buildCardinals() {
    // N/E/S/W markers on the horizon plus a faint horizon ring.
    this.cardinals = [];
    const dirs = [
      ['N', 0], ['NE', 45], ['E', 90], ['SE', 135], ['S', 180], ['SW', 225], ['W', 270], ['NW', 315],
    ];
    for (const [t, az] of dirs) {
      const label = makeLabel(t, { color: t === 'N' ? '#ff5555' : '#ffffff', size: t.length === 1 ? 40 : 26, bg: null });
      label.userData.angular = t.length === 1 ? 0.03 : 0.02;
      const p = azAltToScene(az, 0.5, 5000);
      label.position.set(...p);
      this.group.add(label);
      this.cardinals.push(label);
    }
    const ring = [];
    for (let i = 0; i <= 360; i += 2) ring.push(new THREE.Vector3(...azAltToScene(i, 0, 5000)));
    this.horizon = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(ring),
      new THREE.LineBasicMaterial({ color: 0x335566, transparent: true, opacity: 0.6 }),
    );
    this.group.add(this.horizon);
  }

  /** Recompute sky for a time + place. Cheap enough to call every few seconds. */
  update(date, lat, lon, heightM) {
    if (!this.starPoints) return;
    const t = Astronomy.MakeTime(date);
    const obs = new Astronomy.Observer(lat, lon, heightM);
    const rot = Astronomy.Rotation_EQJ_HOR(t, obs);

    // Sun altitude decides how bright the "daytime" stars should look.
    const sunEq = Astronomy.Equator(Astronomy.Body.Sun, t, obs, true, true);
    const sunHor = Astronomy.Horizon(t, obs, sunEq.ra, sunEq.dec, 'normal');
    this.sunAltitude = sunHor.altitude;

    const pos = this.starPoints.geometry.attributes.position.array;
    const col = this.starPoints.geometry.attributes.color.array;
    const size = this.starPoints.geometry.attributes.size.array;
    this.stars.forEach((s, i) => {
      const v = Astronomy.RotateVector(rot, eqjVector(s.ra, s.dec, t));
      pos.set(horToScene(v, R), i * 3);
      col.set(s.color, i * 3);
      // Sky only: stars below the horizon are not drawn at all.
      size[i] = v.z > 0 ? s.size : 0;
    });
    this.starPoints.geometry.attributes.position.needsUpdate = true;
    this.starPoints.geometry.attributes.color.needsUpdate = true;
    this.starPoints.geometry.attributes.size.needsUpdate = true;

    const lp = this.constLines.geometry.attributes.position.array;
    this.lineSegs.forEach((seg, i) => {
      const va = Astronomy.RotateVector(rot, eqjVector(seg[0], seg[1], t));
      const vb = Astronomy.RotateVector(rot, eqjVector(seg[2], seg[3], t));
      const a = horToScene(va, R);
      // A segment with either end below the horizon collapses to a point (invisible).
      const b = va.z > 0 && vb.z > 0 ? horToScene(vb, R) : a;
      lp.set(a, i * 6);
      lp.set(b, i * 6 + 3);
    });
    this.constLines.geometry.attributes.position.needsUpdate = true;
    this.constLines.visible = this.showConstellations;

    for (const c of this.constNames) {
      const v = Astronomy.RotateVector(rot, eqjVector(c.ra, c.dec, t));
      c.label.position.set(...horToScene(v, R * 0.99));
      c.label.visible = this.showConstellations && v.z > 0.05;
    }

    for (const b of this.bodies) {
      const eq = Astronomy.Equator(b.body, t, obs, true, true);
      const hor = Astronomy.Horizon(t, obs, eq.ra, eq.dec, 'normal');
      const p = azAltToScene(hor.azimuth, hor.altitude, R * 0.98);
      b.disc.position.set(...p);
      b.label.position.set(...azAltToScene(hor.azimuth + 0.8, hor.altitude + 0.8, R * 0.98));
      b.altitude = hor.altitude;
      b.azimuth = hor.azimuth;
      b.disc.visible = b.label.visible = hor.altitude > -0.5;
    }
  }

  frame(cameraPos, renderer) {
    if (this.starPoints) this.starPoints.material.uniforms.pixelRatio.value = renderer.getPixelRatio();
    for (const b of this.bodies) {
      keepAngularSize(b.disc, cameraPos);
      keepAngularSize(b.label, cameraPos);
    }
    for (const c of this.constNames || []) if (c.label.visible) keepAngularSize(c.label, cameraPos);
    for (const l of this.cardinals) keepAngularSize(l, cameraPos);
  }
}
