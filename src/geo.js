import * as THREE from 'three';

export const DEG = Math.PI / 180;
export const EARTH_KM = 6371;

/** lat/lon (degrees) → point on sphere. lon 0 faces +Z, north is +Y. */
export function latLonToVec(lat, lon, r = 1, out = new THREE.Vector3()) {
  const la = lat * DEG, lo = lon * DEG;
  const c = Math.cos(la);
  return out.set(r * c * Math.sin(lo), r * Math.sin(la), r * c * Math.cos(lo));
}

export function vecToLatLon(v) {
  const r = v.length();
  return { lat: Math.asin(v.y / r) / DEG, lon: Math.atan2(v.x, v.z) / DEG };
}

export function fmtLat(lat) {
  return `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'}`;
}
export function fmtLon(lon) {
  lon = ((lon + 540) % 360) - 180;
  return `${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'}`;
}

export const smooth = (x) => x * x * (3 - 2 * x);
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const fract = (x) => x - Math.floor(x);

/**
 * A route on the unit sphere built from [lat, lon] waypoints.
 * Smoothed with a centripetal Catmull–Rom then re-projected to the sphere,
 * and re-parameterised by arc length so u∈[0,1] is uniform distance.
 */
export class SphereRoute {
  constructor(points, { closed = true, samples = 1024 } = {}) {
    this.closed = closed;
    const ctrl = points.map(([la, lo]) => latLonToVec(la, lo));
    const curve = new THREE.CatmullRomCurve3(ctrl, closed, 'centripetal', 0.5);
    const raw = curve.getSpacedPoints(samples).map((p) => p.normalize());
    if (closed) raw[raw.length - 1] = raw[0].clone();
    this.pts = raw;
    this.cum = [0];
    for (let i = 1; i < raw.length; i++) this.cum.push(this.cum[i - 1] + raw[i].angleTo(raw[i - 1]));
    this.length = this.cum[this.cum.length - 1];
    this.km = this.length * EARTH_KM;
    this._t = new THREE.Vector3();
    // uniform-in-arc-length lookup table of frames for O(1) queries
    const M = (this.M = 2048);
    this.tp = new Float32Array((M + 1) * 3);
    this.tt = new Float32Array((M + 1) * 3);
    const p = new THREE.Vector3(), q = new THREE.Vector3(), r = new THREE.Vector3();
    for (let i = 0; i <= M; i++) {
      this._slowAt(i / M, p);
      this.tp.set([p.x, p.y, p.z], i * 3);
    }
    for (let i = 0; i <= M; i++) {
      const a = closed ? (i - 1 + M) % M : Math.max(0, i - 1);
      const b = closed ? (i + 1) % M : Math.min(M, i + 1);
      q.fromArray(this.tp, a * 3); r.fromArray(this.tp, b * 3);
      r.sub(q).normalize();
      this.tt.set([r.x, r.y, r.z], i * 3);
    }
  }
  _slowAt(u, out) {
    const [a, b, f] = this._locate(u);
    return out.copy(this.pts[a]).lerp(this.pts[b], f).normalize();
  }
  _lut(arr, u, out) {
    u = this.closed ? fract(u) : clamp(u);
    const x = u * this.M, i = Math.min(this.M - 1, Math.floor(x)), f = x - i, k = i * 3;
    return out.set(
      arr[k] + (arr[k + 3] - arr[k]) * f,
      arr[k + 1] + (arr[k + 4] - arr[k + 1]) * f,
      arr[k + 2] + (arr[k + 5] - arr[k + 2]) * f,
    );
  }
  /** binary search arc-length → index */
  _locate(u) {
    u = this.closed ? fract(u) : clamp(u);
    const target = u * this.length, cum = this.cum;
    let lo = 0, hi = cum.length - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (cum[m] < target) lo = m; else hi = m;
    }
    const seg = cum[hi] - cum[lo] || 1;
    return [lo, hi, (target - cum[lo]) / seg];
  }
  at(u, out = new THREE.Vector3()) {
    return this._lut(this.tp, u, out).normalize();
  }
  tangent(u, out = new THREE.Vector3()) {
    return this._lut(this.tt, u, out).normalize();
  }
  /** returns an orthonormal frame {p, t (forward), s (side), n (up)} */
  frame(u, f = { p: new THREE.Vector3(), t: new THREE.Vector3(), s: new THREE.Vector3(), n: new THREE.Vector3() }) {
    this.at(u, f.p);
    this.tangent(u, f.t);
    f.n.copy(f.p);
    f.t.addScaledVector(f.n, -f.t.dot(f.n)).normalize();
    f.s.crossVectors(f.t, f.n).normalize();
    return f;
  }
}

/** Piecewise ease between [month, u] keyframes; u may exceed 1 (wraps on loop). */
export function keyframeU(keys, t) {
  t = ((t % 12) + 12) % 12;
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, u0] = keys[i], [t1, u1] = keys[i + 1];
    if (t >= t0 && t <= t1) {
      const f = t1 === t0 ? 0 : (t - t0) / (t1 - t0);
      return u0 + (u1 - u0) * smooth(f);
    }
  }
  return keys[keys.length - 1][1];
}

/** deterministic PRNG */
export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function gauss(r) {
  return Math.sqrt(-2 * Math.log(Math.max(1e-6, r()))) * Math.cos(2 * Math.PI * r());
}
