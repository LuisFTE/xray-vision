// Coordinate helpers.
// Scene convention (three.js): +X = east, +Y = up, -Z = north. 1 unit = 1 metre.

const A = 6378137.0; // WGS84 semi-major axis
const F = 1 / 298.257223563;
const E2 = F * (2 - F);
const DEG = Math.PI / 180;

export function geodeticToEcef(latDeg, lonDeg, h) {
  const lat = latDeg * DEG;
  const lon = lonDeg * DEG;
  const sinLat = Math.sin(lat);
  const N = A / Math.sqrt(1 - E2 * sinLat * sinLat);
  return [
    (N + h) * Math.cos(lat) * Math.cos(lon),
    (N + h) * Math.cos(lat) * Math.sin(lon),
    (N * (1 - E2) + h) * sinLat,
  ];
}

/** Local east/north/up frame around an observer. */
export class LocalFrame {
  constructor(latDeg, lonDeg, h = 0) {
    this.lat = latDeg;
    this.lon = lonDeg;
    this.h = h;
    this.origin = geodeticToEcef(latDeg, lonDeg, h);
    const lat = latDeg * DEG;
    const lon = lonDeg * DEG;
    this.sinLat = Math.sin(lat);
    this.cosLat = Math.cos(lat);
    this.sinLon = Math.sin(lon);
    this.cosLon = Math.cos(lon);
    // Metres per degree, for the fast flat approximation used for buildings.
    this.mPerDegLat = 111132.92 - 559.82 * Math.cos(2 * lat) + 1.175 * Math.cos(4 * lat);
    this.mPerDegLon = 111412.84 * Math.cos(lat) - 93.5 * Math.cos(3 * lat);
  }

  /** Exact ENU in metres for a geodetic point. */
  enu(latDeg, lonDeg, h) {
    const p = geodeticToEcef(latDeg, lonDeg, h);
    const dx = p[0] - this.origin[0];
    const dy = p[1] - this.origin[1];
    const dz = p[2] - this.origin[2];
    const e = -this.sinLon * dx + this.cosLon * dy;
    const n = -this.sinLat * this.cosLon * dx - this.sinLat * this.sinLon * dy + this.cosLat * dz;
    const u = this.cosLat * this.cosLon * dx + this.cosLat * this.sinLon * dy + this.sinLat * dz;
    return [e, n, u];
  }

  /** Flat-earth east/north in metres. Accurate to centimetres within ~2 km. */
  flat(latDeg, lonDeg) {
    return [(lonDeg - this.lon) * this.mPerDegLon, (latDeg - this.lat) * this.mPerDegLat];
  }

  /** Geodetic -> scene position array [x, y, z]. */
  scene(latDeg, lonDeg, h) {
    const [e, n, u] = this.enu(latDeg, lonDeg, h);
    return [e, u, -n];
  }
}

/** Azimuth (deg, clockwise from north) + altitude (deg) -> unit scene vector. */
export function azAltToScene(azDeg, altDeg, r = 1) {
  const az = azDeg * DEG;
  const alt = altDeg * DEG;
  const e = Math.cos(alt) * Math.sin(az);
  const n = Math.cos(alt) * Math.cos(az);
  const u = Math.sin(alt);
  return [e * r, u * r, -n * r];
}

export const FT = 0.3048;
export const KNOT = 0.514444;
export { DEG };
