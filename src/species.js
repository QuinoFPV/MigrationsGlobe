import * as THREE from 'three';
import { SphereRoute, keyframeU, latLonToVec, rng, gauss, clamp, smooth, fract, lerp } from './geo.js';
import { PointCloud, Ribbon, sampleRoute } from './gfx.js';
import { phaseAt } from './data.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _f = { p: new THREE.Vector3(), t: new THREE.Vector3(), s: new THREE.Vector3(), n: new THREE.Vector3() };

class Migration {
  constructor(sp) {
    this.sp = sp;
    this.group = new THREE.Group();
    this.route = new SphereRoute(sp.route, { closed: !sp.open });
    this.head = new THREE.Vector3();
    this.u = 0; this.vel = 0; this.mv = 0; this.dir = 1;
    this.focus = 0; this.dim = 0; this.hi = 0; this.reveal = 0;
    this.ribbons = [];
    this.clouds = [];
  }
  addRouteLine(opts = {}, rFn) {
    const { pts, us } = sampleRoute(this.route, 700, rFn);
    const r = new Ribbon(pts, us, { color: this.sp.color, loop: !this.sp.open, ...opts });
    this.group.add(r.mesh);
    this.ribbons.push(r);
    return r;
  }
  uAt(t) { return keyframeU(this.sp.keys, t); }
  baseUpdate(st) {
    const sp = this.sp;
    const u = this.uAt(st.t);
    const du = (this.uAt(st.t + 0.05) - this.uAt(st.t - 0.05)) / 0.1; // loop-units per month
    this.u = u;
    this.vel = du;
    this.mv = THREE.MathUtils.lerp(this.mv, smooth(clamp(Math.abs(du) / 0.06)), 1 - Math.exp(-st.dt * 4));
    if (Math.abs(du) > 0.004) this.dir = Math.sign(du);
    this.route.at(sp.open ? clamp(u) : u, this.head);
    this.phase = phaseAt(sp, st.t);
    this.focus = st.focus; this.dim = st.dim; this.reveal = st.reveal; this.hi = st.hi;
    // tiny-scale species fade at distance: sub-pixel bundles shimmer and pump the bloom
    // the focused species is always shown at full strength
    const near = Math.max(smooth(clamp((2.4 - (st.camDist ?? 0)) / 1.6)), st.focus ?? 0);
    const far = this.farFade ?? 0.5;
    const vis = (1 - this.dim * 0.82) * this.reveal * lerp(far, 1, near);
    this.visibility = vis;
    for (const r of this.ribbons) {
      r.uniforms.uHead.value = sp.open ? clamp(u) : fract(u);
      r.uniforms.uDir.value = this.dir;
      r.uniforms.uOpacity.value = vis;
      r.uniforms.uDraw.value = smooth(clamp(this.reveal * 1.15)) * 1.01;
      r.uniforms.uHi.value = Math.max(this.hi, this.focus);
    }
    for (const c of this.clouds) c.uniforms.uOpacity.value = vis;
  }
  /** fraction of the documented route covered this season */
  progress() {
    const u = this.sp.open ? clamp(this.u) : fract(this.u);
    return u;
  }
}

/* ───────────────────────────── Humpback whales ───────────────────────────── */
const whaleFrag = /* glsl */ `
uniform float uTime; uniform vec3 uColor; uniform float uOpacity;
varying vec2 vUv; varying float vSeed; varying float vSurf;
float seg(vec2 p, vec2 a, vec2 b, float r) {
  vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - r;
}
void main() {
  vec2 p = vUv; p.y = (p.y - 0.5);
  float beat = sin(uTime * 2.2 + vSeed * 6.0);
  // body: tapered capsule along x
  float x = clamp((p.x - 0.08) / 0.86, 0.0, 1.0);
  float w = 0.105 * pow(sin(3.14159 * pow(x, 0.75)), 0.7);
  float body = abs(p.y) - w;
  body = max(body, max(0.08 - p.x, p.x - 0.95));
  // long pectoral fins — the humpback's signature
  float fl = 0.34 + 0.03 * sin(uTime * 0.9 + vSeed * 3.0);
  float pec = min(seg(p, vec2(0.66, 0.06), vec2(0.5, fl), 0.022), seg(p, vec2(0.66, -0.06), vec2(0.5, -fl), 0.022));
  // flukes
  float fy = 0.15 * (0.75 + 0.25 * beat);
  float fluke = min(seg(p, vec2(0.13, 0.0), vec2(0.03, fy), 0.028), seg(p, vec2(0.13, 0.0), vec2(0.03, -fy), 0.028));
  float d = min(min(body, pec), fluke);
  float shape = 1.0 - smoothstep(-0.004, 0.012, d);
  float halo = exp(-max(d, 0.0) * 30.0) * 0.14;
  float spine = exp(-abs(p.y) * 60.0) * step(0.2, p.x) * step(p.x, 0.9) * 0.6;
  float a = (shape * (0.32 + spine * 0.5) + halo) * (0.3 + 0.7 * vSurf);
  gl_FragColor = vec4(uColor * a * uOpacity, 1.0);
}`;

const ringFrag = /* glsl */ `
uniform vec3 uColor; uniform float uOpacity;
varying vec2 vUv; varying float vAge;
void main() {
  float r = length(vUv - 0.5) * 2.0;
  float a = 0.0;
  for (int i = 0; i < 3; i++) {
    float rr = vAge - float(i) * 0.12;
    if (rr > 0.0) a += exp(-pow((r - rr) / 0.006, 2.0)) * (1.0 - rr) * (1.0 - float(i) * 0.3);
  }
  a *= smoothstep(1.0, 0.85, vAge);
  gl_FragColor = vec4(uColor * a * 0.45 * uOpacity, 1.0);
}`;

export class Whales extends Migration {
  constructor(sp) {
    super(sp);
    this.addRouteLine({ width: 1.4, base: 0.1, trail: 0.22, dash: 220, dashSpeed: 1.5 }, () => 1.0012);
    this.farFade = 1;
    this.n = 7;
    const r = rng(11);
    this.pod = Array.from({ length: this.n }, (_, i) => ({
      along: i === 6 ? 0.004 : r() * 0.03, side: gauss(r) * 0.01, seed: r(), size: i === 6 ? 0.55 : 0.85 + r() * 0.3,
      pos: new THREE.Vector3(), fwd: new THREE.Vector3(1, 0, 0), init: false,
    }));
    const quad = new THREE.PlaneGeometry(1, 1);
    const seeds = new Float32Array(this.n), surf = new Float32Array(this.n);
    this.aSurf = new THREE.InstancedBufferAttribute(surf, 1);
    quad.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds.map((_, i) => this.pod[i].seed), 1));
    quad.setAttribute('aSurf', this.aSurf);
    this.wu = { uTime: Ribbon.time, uColor: { value: new THREE.Vector3(...sp.color) }, uOpacity: { value: 1 } };
    this.mesh = new THREE.InstancedMesh(quad, new THREE.ShaderMaterial({
      uniforms: this.wu,
      vertexShader: /* glsl */ `
        attribute float aSeed; attribute float aSurf; varying vec2 vUv; varying float vSeed; varying float vSurf;
        void main(){ vUv = uv; vSeed = aSeed; vSurf = aSurf; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position,1.0);} `,
      fragmentShader: whaleFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }), this.n);
    this.mesh.frustumCulled = false;
    this.group.add(this.mesh);

    // song rings
    this.ringN = 10;
    const rq = new THREE.PlaneGeometry(1, 1);
    this.aAge = new THREE.InstancedBufferAttribute(new Float32Array(this.ringN).fill(2), 1);
    rq.setAttribute('aAge', this.aAge);
    this.ru = { uColor: { value: new THREE.Vector3(...sp.color) }, uOpacity: { value: 1 } };
    this.rings = new THREE.InstancedMesh(rq, new THREE.ShaderMaterial({
      uniforms: this.ru,
      vertexShader: /* glsl */ `attribute float aAge; varying vec2 vUv; varying float vAge;
        void main(){ vUv = uv; vAge = aAge; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position,1.0);} `,
      fragmentShader: ringFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }), this.ringN);
    this.rings.frustumCulled = false;
    this.ringData = Array.from({ length: this.ringN }, () => ({ age: 2, pos: new THREE.Vector3(), scale: 0.05 }));
    this.ringTimer = 0; this.ringIdx = 0;
    this.group.add(this.rings);

    // wakes + bubble nets
    this.wakeLen = 36;
    this.wake = new PointCloud(this.n * this.wakeLen + 600, { minPx: 1 });
    this.hist = this.pod.map(() => []);
    this.group.add(this.wake.points);
    this.clouds.push(this.wake);
    this.bub = Array.from({ length: 600 }, () => ({ a: Math.random() * 6.28, r: Math.random(), life: Math.random() }));
    this.m4 = new THREE.Matrix4(); this.basis = new THREE.Matrix4();
  }
  update(st) {
    this.baseUpdate(st);
    const vis = this.visibility;
    this.wu.uOpacity.value = vis; this.ru.uOpacity.value = vis;
    const u = this.u, time = st.time;
    const breeding = this.phase[2] === 'Breeding', feeding = this.phase[2] === 'Feeding';
    const center = this.route.frame(u, _f);
    const cP = center.p.clone(), cT = center.t.clone(), cS = center.s.clone(), cN = center.n.clone();
    const sc = 0.021;
    this.pod.forEach((w, i) => {
      // travelling formation along the route…
      this.route.frame(u - w.along * this.dir, _f);
      const travel = _f.p.clone().addScaledVector(_f.s, w.side + Math.sin(time * 0.5 + w.seed * 9) * 0.0025);
      // …or a bubble-net spiral / slow breeding drift when stationary
      const ang = time * (feeding ? 0.55 : 0.12) * (i % 2 ? 1 : -1) + w.seed * 6.28;
      const rad = feeding ? 0.011 + 0.004 * Math.sin(time * 0.3 + i) : 0.008 + w.seed * 0.014;
      const circle = cP.clone().addScaledVector(cT, Math.cos(ang) * rad).addScaledVector(cS, Math.sin(ang) * rad);
      const target = circle.lerp(travel, this.mv).normalize().multiplyScalar(1.0015);
      if (!w.init) { w.pos.copy(target); w.init = true; }
      const prev = w.pos.clone();
      w.pos.lerp(target, 1 - Math.exp(-st.dt * 5));
      const mvDir = w.pos.clone().sub(prev);
      const n = w.pos.clone().normalize();
      if (mvDir.lengthSq() > 1e-12) w.fwd.lerp(mvDir.normalize(), 0.15);
      w.fwd.addScaledVector(n, -w.fwd.dot(n)).normalize();
      const side = new THREE.Vector3().crossVectors(n, w.fwd);
      this.basis.makeBasis(w.fwd, side, n);
      const s = sc * w.size;
      this.m4.copy(this.basis).scale(_v.set(s, s, 1)).setPosition(w.pos);
      this.mesh.setMatrixAt(i, this.m4);
      this.aSurf.array[i] = 0.5 + 0.5 * Math.sin(time * 0.4 + w.seed * 20);
      // wake history
      const h = this.hist[i];
      if (!h.length || h[0].distanceToSquared(w.pos) > 0.000002) { h.unshift(w.pos.clone()); if (h.length > this.wakeLen) h.pop(); }
      for (let k = 0; k < this.wakeLen; k++) {
        const p = h[Math.min(k, h.length - 1)] || w.pos;
        const f = 1 - k / this.wakeLen;
        this.wake.set(i * this.wakeLen + k, p, 0.0022 * (0.5 + f), 0.25 * f * f, 0.5, 0.95, 1);
      }
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    this.aSurf.needsUpdate = true;

    // bubble nets rise in spirals when feeding
    const base = this.n * this.wakeLen;
    this.bub.forEach((b, k) => {
      b.life += st.dt * 0.25;
      if (b.life > 1) { b.life = 0; b.a = Math.random() * 6.28; b.r = Math.random(); }
      const rr = (0.004 + b.r * 0.014) * (1 - b.life * 0.3);
      const a = b.a + b.life * 2;
      _v.copy(cP).addScaledVector(cT, Math.cos(a) * rr).addScaledVector(cS, Math.sin(a) * rr).normalize().multiplyScalar(1.0016);
      const on = feeding ? (1 - this.mv) : 0;
      this.wake.set(base + k, _v, 0.0009, on * 0.6 * Math.sin(b.life * Math.PI), 0.8, 1, 1);
    });
    this.wake.commit();

    // song rings
    this.ringTimer -= st.dt;
    if (this.ringTimer <= 0 && vis > 0.05) {
      this.ringTimer = breeding ? 0.9 + Math.random() * 0.6 : 2.8 + Math.random() * 2;
      const r = this.ringData[this.ringIdx++ % this.ringN];
      r.age = 0; r.pos.copy(this.pod[Math.floor(Math.random() * this.n)].pos); r.scale = breeding ? 0.16 : 0.1;
    }
    this.ringData.forEach((r, i) => {
      r.age += st.dt * 0.32;
      const n = r.pos.clone().normalize();
      const t = new THREE.Vector3(0, 1, 0).cross(n).normalize();
      const b = new THREE.Vector3().crossVectors(n, t);
      this.basis.makeBasis(t, b, n);
      this.m4.copy(this.basis).scale(_v.set(r.scale, r.scale, 1)).setPosition(r.pos.clone().multiplyScalar(1.0008 / r.pos.length()));
      this.rings.setMatrixAt(i, this.m4);
      this.aAge.array[i] = r.age;
    });
    this.rings.instanceMatrix.needsUpdate = true;
    this.aAge.needsUpdate = true;
  }
}

/* ───────────────────────────── Arctic terns ───────────────────────────── */
export class Terns extends Migration {
  constructor(sp) {
    super(sp);
    this.alt = (u) => 1.006 + 0.006 * Math.sin(u * Math.PI * 2 * 3) ** 2;
    this.routeR = this.alt;
    this.farFade = 1;
    this.addRouteLine({ width: 1.1, base: 0.07, trail: 0.12, dash: 900, dashSpeed: 6 }, (u) => this.alt(u));
    this.N = 2600;
    const r = rng(23);
    this.p = Array.from({ length: this.N }, () => ({ s: r(), g: gauss(r), v: gauss(r), ph: r(), sp: 0.6 + r() * 0.8 }));
    this.cloud = new PointCloud(this.N, { minPx: 1.1 });
    this.group.add(this.cloud.points);
    this.clouds.push(this.cloud);
  }
  update(st) {
    this.baseUpdate(st);
    const u = this.u, time = st.time, mv = this.mv, dir = this.dir;
    const span = 0.045;
    const fh = this.route.frame(u, { p: new THREE.Vector3(), t: new THREE.Vector3(), s: new THREE.Vector3(), n: new THREE.Vector3() });
    for (let i = 0; i < this.N; i++) {
      const q = this.p[i];
      // streaming comet: particles flow toward the head and respawn at the tail
      const s = fract(q.s + time * 0.06 * q.sp);
      const back = Math.pow(1 - s, 1.7) * span;
      const uu = u - back * dir;
      this.route.frame(uu, _f);
      const width = 0.0025 + 0.012 * (1 - s);
      _v.copy(_f.p).addScaledVector(_f.s, q.g * width + Math.sin(time * 1.3 + q.ph * 40) * 0.0012)
        .normalize().multiplyScalar(this.alt(uu) + q.v * 0.0012);
      // murmuration when resting
      const a = time * (0.5 + q.sp * 0.6) + q.ph * 6.283;
      const rad = 0.006 + Math.abs(q.g) * 0.008 + Math.sin(time * 0.7 + q.s * 12) * 0.003;
      const tilt = Math.sin(q.ph * 12 + time * 0.2);
      _w.copy(fh.p).addScaledVector(fh.t, Math.cos(a) * rad).addScaledVector(fh.s, Math.sin(a) * rad * (0.6 + 0.4 * tilt))
        .normalize().multiplyScalar(1.008 + Math.sin(a * 2 + q.v) * 0.002 + q.v * 0.001);
      _v.lerp(_w, 1 - mv);
      const bright = 0.35 + 0.65 * (mv > 0.5 ? s : 0.7);
      this.cloud.set(i, _v, 0.0016 * (0.6 + 0.6 * s), bright, 0.9, 0.95, 1.0);
    }
    this.cloud.commit();
  }
}

/* ───────────────────────────── Wildebeest ───────────────────────────── */
const MARA = latLonToVec(-1.58, 34.86, 1.0006);
const GRUMETI = latLonToVec(-2.15, 34.4, 1.0006);

export class Wildebeest extends Migration {
  constructor(sp) {
    super(sp);
    this.addRouteLine({ width: 1.2, base: 0.12, trail: 0.3, dash: 60, dashSpeed: 0.6 }, () => 1.0004);
    this.farFade = 0.35;
    this.N = 7500;
    const r = rng(37);
    this.p = Array.from({ length: this.N }, (_, i) => ({ s: Math.min(1, -Math.log(1 - r() * 0.98) * 0.28), lane: (i % 9) - 4, g: gauss(r), ph: r() * 100, c: r() }));
    this.herd = new PointCloud(this.N, { minPx: 0.8, shape: 'hard', blending: THREE.NormalBlending });
    this.dustN = 500;
    this.dust = new PointCloud(this.dustN, { minPx: 1 });
    this.dp = Array.from({ length: this.dustN }, () => ({ s: r(), g: gauss(r), ph: r() * 10 }));
    this.splashN = 260;
    this.splash = new PointCloud(this.splashN, { minPx: 1 });
    this.sp2 = Array.from({ length: this.splashN }, () => ({ life: Math.random(), a: Math.random() * 6.28, r: Math.random() }));
    this.group.add(this.dust.points, this.herd.points, this.splash.points);
    this.clouds.push(this.herd, this.dust, this.splash);
  }
  update(st) {
    this.baseUpdate(st);
    const u = this.u, time = st.time, mv = this.mv, dir = this.dir;
    const len = lerp(0.045, 0.15, mv);
    const spread = lerp(3.2, 1, mv);
    for (let i = 0; i < this.N; i++) {
      const q = this.p[i];
      const uu = u - q.s * len * dir;
      this.route.frame(uu, _f);
      const braid = Math.sin(q.s * 50 + q.lane * 1.7 + time * 0.15) * 0.0007;
      const lat = (q.lane * 0.0011 + q.g * 0.0006) * spread + braid;
      const graze = Math.sin(time * 0.4 + q.ph) * 0.00025 * (1.2 - mv);
      _v.copy(_f.p).addScaledVector(_f.s, lat + graze).addScaledVector(_f.t, Math.cos(time * 0.3 + q.ph) * 0.0003 * (1.2 - mv))
        .normalize().multiplyScalar(1.0004);
      const dens = 1 - q.s * 0.6;
      // mostly dark bodies, a few catching the low sun
      const glint = q.c > 0.82;
      if (glint) this.herd.set(i, _v, 0.00012, 0.95 * dens, 0.95, 0.66, 0.34);
      else this.herd.set(i, _v, 0.0001, 0.88 * dens, 0.075 + q.c * 0.05, 0.05 + q.c * 0.03, 0.03);
    }
    this.herd.commit();
    for (let i = 0; i < this.dustN; i++) {
      const d = this.dp[i];
      const age = fract(d.s + time * 0.05);
      const uu = u - (0.2 + age * 0.8) * len * dir;
      this.route.frame(uu, _f);
      _v.copy(_f.p).addScaledVector(_f.s, d.g * 0.006 * spread * (0.5 + age)).normalize().multiplyScalar(1.0008 + age * 0.0015);
      this.dust.set(i, _v, 0.0005 + age * 0.0008, 0.022 * Math.sin(age * Math.PI) * (0.25 + mv), 0.9, 0.7, 0.5);
    }
    this.dust.commit();
    // river crossings: splashes at the Mara (Jul–Sep) and Grumeti (Jun)
    const nearMara = smooth(clamp(1 - Math.abs(fract(u) - 0.57) / 0.06));
    const nearGrum = smooth(clamp(1 - Math.abs(fract(u) - 0.27) / 0.04)) * 0.6;
    const on = Math.max(nearMara, nearGrum);
    const site = nearMara >= nearGrum ? MARA : GRUMETI;
    const n = site.clone().normalize(), t = new THREE.Vector3(0, 1, 0).cross(n).normalize(), b = new THREE.Vector3().crossVectors(n, t);
    for (let i = 0; i < this.splashN; i++) {
      const s = this.sp2[i];
      s.life += st.dt * (0.8 + s.r);
      if (s.life > 1) { s.life = 0; s.a = Math.random() * 6.28; s.r = Math.random(); }
      const rr = s.life * 0.0025 * (0.4 + s.r);
      _v.copy(site).addScaledVector(t, Math.cos(s.a) * rr + (s.r - 0.5) * 0.004).addScaledVector(b, Math.sin(s.a) * rr * 0.5)
        .normalize().multiplyScalar(1.0006 + Math.sin(s.life * Math.PI) * 0.0006);
      this.splash.set(i, _v, 0.00014, on * (1 - s.life) * 0.9, 0.85, 0.95, 1);
    }
    this.splash.commit();
  }
}

/* ───────────────────────────── Monarchs ───────────────────────────── */
const SITES = [[19.6, -100.25], [19.68, -100.3], [19.54, -100.22], [19.35, -100.15]];
const GEN = [[1.0, 0.22, 0.02], [1.0, 0.34, 0.04], [1.0, 0.48, 0.08], [1.0, 0.36, 0.04]];

export class Monarchs extends Migration {
  constructor(sp) {
    super(sp);
    this.addRouteLine({ width: 1.2, base: 0.06, trail: 0, dash: 120, dashSpeed: 1.2 }, () => 1.0015);
    this.N = 3600;
    const r = rng(53);
    this.p = Array.from({ length: this.N }, () => {
      // summer range weighted to the Corn Belt and Great Lakes
      const lat = 37 + r() * 11 + gauss(r) * 1.2;
      const lon = -97 + Math.pow(r(), 0.8) * 27;
      const site = SITES[Math.floor(r() * SITES.length)];
      return {
        P0: latLonToVec(lat, lon),
        P1: latLonToVec(31 + gauss(r) * 2.2, -97.8 + gauss(r) * 2.5),
        P2: latLonToVec(site[0] + gauss(r) * 0.05, site[1] + gauss(r) * 0.05),
        d: r() * 0.28, ph: r() * 100, flap: 7 + r() * 5, w: gauss(r),
      };
    });
    this.cloud = new PointCloud(this.N, { minPx: 1 });
    this.group.add(this.cloud.points);
    this.clouds.push(this.cloud);
    this.a = new THREE.Vector3(); this.b = new THREE.Vector3();
  }
  update(st) {
    this.baseUpdate(st);
    const u = clamp(this.u), time = st.time;
    const spring = st.t > 2 && st.t < 7;
    for (let i = 0; i < this.N; i++) {
      const q = this.p[i];
      const ui = smooth(clamp((u - q.d) / 0.72));
      this.a.copy(q.P0).lerp(q.P1, ui);
      this.b.copy(q.P1).lerp(q.P2, ui);
      _v.copy(this.a).lerp(this.b, ui);
      const flying = Math.sin(ui * Math.PI);
      const flut = 0.0035 * flying + 0.0012;
      _v.x += Math.sin(time * 0.9 + q.ph) * flut; _v.y += Math.cos(time * 0.7 + q.ph * 1.3) * flut * 0.6; _v.z += Math.sin(time * 0.8 + q.ph * 0.7) * flut;
      // overwintering clusters: dense, shimmering on sunny afternoons
      const roost = smooth(clamp((ui - 0.93) / 0.07));
      const sunny = Math.max(0, Math.sin(time * 0.25 + q.ph)) ** 6;
      _v.normalize().multiplyScalar(1.0012 + flying * 0.004 + roost * sunny * 0.002);
      const flap = Math.abs(Math.sin(time * q.flap + q.ph));
      const gen = spring ? Math.min(3, Math.floor((1 - ui) * 3.2)) : 3;
      const c = GEN[gen];
      const alpha = (0.7 + 0.35 * flap) * (roost > 0.5 ? 0.55 + sunny * 0.6 : 1.0);
      this.cloud.set(i, _v, 0.0019 * (0.75 + 0.25 * flap), alpha, c[0], c[1], c[2]);
    }
    this.cloud.commit();
  }
}

/* ───────────────────────────── Caribou ───────────────────────────── */
export class Caribou extends Migration {
  constructor(sp) {
    super(sp);
    this.strands = 16;
    this.farFade = 0.12;
    this.off = (j, u) => (j - 7.5) * 0.0011 + 0.0028 * Math.sin(u * Math.PI * 2 * 9 + j * 1.3) + 0.0016 * Math.sin(u * Math.PI * 2 * 23 + j * 2.1);
    for (let j = 0; j < this.strands; j++) {
      const pts = [], us = [];
      for (let i = 0; i <= 900; i++) {
        const u = i / 900;
        this.route.frame(u, _f);
        pts.push(_f.p.clone().addScaledVector(_f.s, this.off(j, u)).normalize().multiplyScalar(1.0005));
        us.push(u);
      }
      const r = new Ribbon(pts, us, { color: [1.0, 0.76, 0.45], width: 1.3, base: 0.035, trail: 0.42, loop: true, glow: 0.9 });
      this.group.add(r.mesh);
      this.ribbons.push(r);
    }
    this.N = 3000;
    const r = rng(71);
    this.p = Array.from({ length: this.N }, (_, i) => ({ j: i % this.strands, s: Math.min(1, -Math.log(1 - r() * 0.97) * 0.3), g: gauss(r), ph: r() * 50 }));
    this.cloud = new PointCloud(this.N, { minPx: 0.8, shape: 'hard', blending: THREE.NormalBlending });
    this.group.add(this.cloud.points);
    this.clouds.push(this.cloud);
  }
  update(st) {
    this.baseUpdate(st);
    const u = this.u, time = st.time, mv = this.mv, dir = this.dir;
    const len = lerp(0.035, 0.13, mv);
    const spread = lerp(3.6, 1.2, mv);
    for (let i = 0; i < this.N; i++) {
      const q = this.p[i];
      const uu = u - q.s * len * dir;
      this.route.frame(uu, _f);
      const lat = this.off(q.j, fract(uu)) * spread + q.g * 0.0006 * spread;
      _v.copy(_f.p).addScaledVector(_f.s, lat + Math.sin(time * 0.3 + q.ph) * 0.0003 * (1.1 - mv))
        .addScaledVector(_f.t, Math.cos(time * 0.25 + q.ph) * 0.0004 * (1.1 - mv)).normalize().multiplyScalar(1.0006);
      this.cloud.set(i, _v, 0.00036, 0.95 * (1 - q.s * 0.4), 0.09 + (i % 7) * 0.012, 0.075 + (i % 5) * 0.008, 0.065);
    }
    this.cloud.commit();
  }
}


/* ───────────────────────────── Barn swallows ───────────────────────────── */
export class Swallows extends Migration {
  constructor(sp) {
    super(sp);
    this.addRouteLine({ width: 1.1, base: 0.06, trail: 0.16, dash: 500, dashSpeed: 3 }, () => 1.003);
    this.farFade = 0.3;
    this.N = 1100;
    this.T = 3; // head + two trailing samples give each bird a short streak
    const r = rng(83);
    this.p = Array.from({ length: this.N }, () => ({ s: r(), g: gauss(r), h: gauss(r), ph: r() * 100, sp: 0.7 + r() * 0.6 }));
    this.cloud = new PointCloud(this.N * this.T, { minPx: 1 });
    this.group.add(this.cloud.points);
    this.clouds.push(this.cloud);
    this.c = { p: new THREE.Vector3(), t: new THREE.Vector3(), s: new THREE.Vector3(), n: new THREE.Vector3() };
  }
  pos(q, time, out) {
    const u = this.u, mv = this.mv, dir = this.dir;
    // broad-front travel with darting, zig-zag hunting flight
    const uu = u - q.s * 0.12 * dir + Math.sin(time * 2.3 * q.sp + q.ph) * 0.003;
    this.route.frame(uu, _f);
    out.copy(_f.p).addScaledVector(_f.s, q.g * 0.022 + Math.sin(time * 3.1 * q.sp + q.ph * 7) * 0.005);
    // at rest: figure-of-eight loops around farms or a winter roost
    const f = this.route.frame(u, this.c);
    const a = time * 1.6 * q.sp + q.ph;
    const rr = 0.004 + Math.abs(q.h) * 0.002;
    _w.copy(f.p).addScaledVector(f.s, q.g * 0.018 + Math.sin(a) * rr).addScaledVector(f.t, q.h * 0.018 + Math.sin(a * 2) * rr * 0.5);
    out.lerp(_w, 1 - mv);
    return out.normalize().multiplyScalar(1.003 + Math.sin(a * 1.3) * 0.0008);
  }
  update(st) {
    this.baseUpdate(st);
    const time = st.time, T = this.T;
    const tail = [1, 0.45, 0.2];
    for (let i = 0; i < this.N; i++) {
      const q = this.p[i];
      for (let k = 0; k < T; k++) {
        this.pos(q, time - k * 0.045, _v);
        this.cloud.set(i * T + k, _v, 0.0017 - k * 0.0003, 1.0 * tail[k], 0.66, 0.74, 1.0);
      }
    }
    this.cloud.commit();
  }
}

/* ───────────────────────────── Bluefin tuna ───────────────────────────── */
export class Tuna extends Migration {
  constructor(sp) {
    super(sp);
    this.addRouteLine({ width: 1.2, base: 0.08, trail: 0.12, dash: 300, dashSpeed: 2.2 }, () => 1.0012);
    this.schools = 12; this.per = 72;
    const r = rng(97);
    this.fish = Array.from({ length: this.schools * this.per }, (_, i) => ({ k: Math.floor(i / this.per), a: r() * 6.283, r: Math.sqrt(r()), x: r() - 0.5, y: gauss(r), ph: r() * 10 }));
    this.cloud = new PointCloud(this.fish.length, { minPx: 1 });
    this.group.add(this.cloud.points);
    this.clouds.push(this.cloud);
  }
  update(st) {
    this.baseUpdate(st);
    const u = this.u, time = st.time, mv = this.mv, dir = this.dir;
    const cf = { p: new THREE.Vector3(), t: new THREE.Vector3(), s: new THREE.Vector3(), n: new THREE.Vector3() };
    for (let i = 0; i < this.fish.length; i++) {
      const q = this.fish[i], k = q.k;
      // schools strung along the route when travelling, spread over the spawning ground at rest
      const uk = u - k * 0.008 * dir * mv + (k / this.schools - 0.5) * 0.07 * (1 - mv);
      this.route.frame(uk, cf);
      const breathe = 1 + 0.25 * Math.sin(time * 0.7 + k);
      // milling ring at rest…
      const a = q.a + time * (0.8 + (k % 3) * 0.15) * (k % 2 ? 1 : -1);
      const rr = (0.002 + 0.0042 * q.r) * breathe;
      const mx = Math.cos(a) * rr, my = Math.sin(a) * rr;
      // …polarised, stretched along the swim direction when moving
      const px = q.x * 0.011, py = q.y * 0.0018 + Math.sin(time * 2 + q.x * 30 + k) * 0.0003;
      const ox = lerp(mx, px, mv), oy = lerp(my, py, mv);
      _v.copy(cf.p).addScaledVector(cf.t, ox).addScaledVector(cf.s, oy).normalize().multiplyScalar(1.0012);
      // silver flashes sweep across the school as the fish turn
      const flash = Math.pow(Math.max(0, Math.sin(time * 2.6 - (ox + oy) * 900 + k * 1.7)), 14);
      this.cloud.set(i, _v, 0.0014 + flash * 0.0008, 0.6 + flash * 0.9, lerp(1.0, 1.0, flash), lerp(0.36, 0.95, flash), lerp(0.48, 1.0, flash));
    }
    this.cloud.commit();
  }
}

/* ───────────────────────────── Honey buzzards ───────────────────────────── */
export class Buzzards extends Migration {
  constructor(sp) {
    super(sp);
    this.addRouteLine({ width: 1.1, base: 0.07, trail: 0.14, dash: 160, dashSpeed: 0.8 }, () => 1.003);
    this.farFade = 0.45;
    this.N = 760;
    const r = rng(113);
    this.p = Array.from({ length: this.N }, () => ({ s: r(), g: gauss(r), h: gauss(r), ph: r() * 6.283, cw: r() > 0.5 ? 1 : -1 }));
    this.cloud = new PointCloud(this.N, { minPx: 1 });
    this.group.add(this.cloud.points);
    this.clouds.push(this.cloud);
    this.D = 0.016; // spacing between thermals along the flyway
    this.ka = new THREE.Vector3(); this.kb = new THREE.Vector3();
    this.n0 = new THREE.Vector3(); this.tA = new THREE.Vector3(); this.tB = new THREE.Vector3();
  }
  kettle(k, out) {
    // thermal centres sit slightly off the route line, deterministic per index
    this.route.frame(k * this.D, _f);
    const j = Math.sin(k * 127.1) * 43758.5453;
    return out.copy(_f.p).addScaledVector(_f.s, (j - Math.floor(j) - 0.5) * 0.008);
  }
  update(st) {
    this.baseUpdate(st);
    const u = this.u, time = st.time, mv = this.mv, dir = this.dir;
    const head = this.route.frame(u, { p: new THREE.Vector3(), t: new THREE.Vector3(), s: new THREE.Vector3(), n: new THREE.Vector3() });
    for (let i = 0; i < this.N; i++) {
      const q = this.p[i];
      const ui = u - q.s * 0.06 * dir;
      const x = ui / this.D, k = Math.floor(x), f = x - k;
      let alt;
      if (f < 0.55) {
        // climb in a tightening spiral
        const c = f / 0.55;
        this.kettle(k, this.ka);
        const n = this.n0.copy(this.ka).normalize();
        const tA = this.tA.set(0, 1, 0).cross(n).normalize(), tB = this.tB.crossVectors(n, tA);
        const a = q.ph + time * 1.5 * q.cw;
        const rr = 0.0058 * (1 - c * 0.6) + Math.abs(q.g) * 0.001;
        _v.copy(this.ka).addScaledVector(tA, Math.cos(a) * rr).addScaledVector(tB, Math.sin(a) * rr);
        alt = 1.003 + c * 0.006;
      } else {
        // glide out of the top of the thermal to the next one
        const g = (f - 0.55) / 0.45;
        this.kettle(k, this.ka); this.kettle(k + 1, this.kb);
        _v.copy(this.ka).lerp(this.kb, g).addScaledVector(head.s, q.g * 0.0015);
        alt = 1.009 - g * 0.006;
      }
      // at rest: scattered birds circling their own local thermals
      const a2 = q.ph + time * 1.1 * q.cw;
      _w.copy(head.p).addScaledVector(head.s, q.g * 0.02 + Math.cos(a2) * 0.003).addScaledVector(head.t, q.h * 0.02 + Math.sin(a2) * 0.003);
      _v.normalize().multiplyScalar(alt).lerp(_w.normalize().multiplyScalar(1.004 + Math.sin(a2 * 0.5) * 0.001), 1 - mv);
      this.cloud.set(i, _v, 0.0017, 0.85, 0.95, 0.83, 0.42);
    }
    this.cloud.commit();
  }
}

/* ───────────────────────────── House martins ───────────────────────────── */
const COLONIES = [[43.77, 11.25], [44.49, 11.34], [41.9, 12.5], [43.11, 12.39], [40.85, 14.27], [45.07, 7.69], [45.46, 9.19], [45.44, 12.33], [38.12, 13.36]];

export class HouseMartins extends Migration {
  constructor(sp) {
    super(sp);
    this.addRouteLine({ width: 1.1, base: 0.06, trail: 0.15, dash: 420, dashSpeed: 2.6 }, () => 1.006);
    this.farFade = 0.45;
    this.N = 1000;
    const r = rng(131);
    this.p = Array.from({ length: this.N }, (_, i) => {
      const c = COLONIES[i % COLONIES.length];
      return { s: r(), g: gauss(r), h: gauss(r), ph: r() * 100, sp: 0.7 + r() * 0.6, home: latLonToVec(c[0], c[1]), a0: r() * 6.283 };
    });
    this.cloud = new PointCloud(this.N, { minPx: 1 });
    this.group.add(this.cloud.points);
    this.clouds.push(this.cloud);
    this.hf = { p: new THREE.Vector3(), t: new THREE.Vector3(), s: new THREE.Vector3(), n: new THREE.Vector3() };
    this.tA = new THREE.Vector3(); this.tB = new THREE.Vector3(); this.c = new THREE.Vector3();
  }
  update(st) {
    this.baseUpdate(st);
    const u = this.u, time = st.time, mv = this.mv, dir = this.dir;
    const fu = fract(u);
    const atColonies = smooth(clamp(1 - Math.min(fu, 1 - fu) / 0.06));
    const head = this.route.frame(u, this.hf);
    for (let i = 0; i < this.N; i++) {
      const q = this.p[i];
      // migration: loose, high flock
      this.route.frame(u - q.s * 0.09 * dir, _f);
      _v.copy(_f.p).addScaledVector(_f.s, q.g * 0.016 + Math.sin(time * 1.7 * q.sp + q.ph) * 0.003)
        .normalize().multiplyScalar(1.0065 + Math.sin(time * 0.9 + q.ph) * 0.0012);
      // breeding: short sorties out from the nest and back again
      const n = q.home;
      this.tA.set(0, 1, 0).cross(n).normalize(); this.tB.crossVectors(n, this.tA);
      const sortie = Math.abs(Math.sin(time * 0.9 * q.sp + q.ph)) * (0.0025 + Math.abs(q.g) * 0.002);
      const ang = q.a0 + time * 0.15;
      this.c.copy(n).addScaledVector(this.tA, Math.cos(ang) * sortie).addScaledVector(this.tB, Math.sin(ang) * sortie)
        .normalize().multiplyScalar(1.0015 + sortie * 0.4);
      // winter: a high, thin cloud over the forest canopy
      _w.copy(head.p).addScaledVector(head.s, q.g * 0.03 + Math.sin(time * 0.2 + q.ph) * 0.004).addScaledVector(head.t, q.h * 0.03 + Math.cos(time * 0.17 + q.ph) * 0.004)
        .normalize().multiplyScalar(1.009 + Math.sin(q.ph) * 0.0015);
      _w.lerp(this.c, atColonies);
      _v.lerp(_w, 1 - mv);
      // the white rump flashes as birds bank
      const flash = Math.pow(Math.max(0, Math.sin(time * 6 * q.sp + q.ph)), 10);
      const winterDim = lerp(1, 0.55, (1 - atColonies) * (1 - mv));
      this.cloud.set(i, _v, 0.0014, (0.6 + flash * 0.6) * winterDim, lerp(0.66, 1, flash), lerp(0.94, 1, flash), lerp(0.62, 1, flash));
    }
    this.cloud.commit();
  }
}

/* ───────────────────────────── Great white egrets ───────────────────────────── */
const EGRET_HOME = [[47.8, 16.75], [46.6, 19.4], [45.6, 18.85]];
const EGRET_WINTER = [[37.0, -6.4], [34.85, -6.3], [40.7, 0.75], [43.5, 4.6], [43.38, -2.68], [44.95, 12.4]];

export class Egrets extends Migration {
  constructor(sp) {
    super(sp);
    this.addRouteLine({ width: 1.1, base: 0.07, trail: 0.2, dash: 140, dashSpeed: 0.5 }, () => 1.004);
    this.flocks = 14; this.per = 7;
    this.N = this.flocks * this.per;
    const r = rng(149);
    this.f = Array.from({ length: this.flocks }, () => ({ g: gauss(r), off: r() }));
    this.b = Array.from({ length: this.N }, (_, i) => ({
      k: Math.floor(i / this.per), j: i % this.per,
      home: latLonToVec(...EGRET_HOME[i % EGRET_HOME.length]),
      winter: latLonToVec(...EGRET_WINTER[i % EGRET_WINTER.length]),
      gx: gauss(r), gy: gauss(r), ph: r() * 100,
    }));
    this.cloud = new PointCloud(this.N, { minPx: 1.2 });
    this.group.add(this.cloud.points);
    this.clouds.push(this.cloud);
    this.tA = new THREE.Vector3(); this.tB = new THREE.Vector3(); this.c = new THREE.Vector3();
  }
  update(st) {
    this.baseUpdate(st);
    const u = this.u, time = st.time, mv = this.mv, dir = this.dir;
    const fu = fract(u);
    const atHome = smooth(clamp(1 - Math.min(fu, 1 - fu) / 0.08));
    const sp = 0.0026; // spacing inside the V
    for (let i = 0; i < this.N; i++) {
      const q = this.b[i], fl = this.f[q.k];
      // slow V-skeins strung along the flyway
      this.route.frame(u - (q.k * 0.022 + fl.off * 0.006) * dir, _f);
      const c = (this.per - 1) / 2, d = q.j - c;
      _v.copy(_f.p).addScaledVector(_f.t, -Math.abs(d) * sp * dir).addScaledVector(_f.s, d * sp * 1.1 + fl.g * 0.009)
        .normalize().multiplyScalar(1.004 + Math.sin(time * 0.6 + q.k) * 0.0008);
      // at rest: egrets standing in shallow water at wetland sites
      const site = atHome > 0.5 ? q.home : q.winter;
      const n = site;
      this.tA.set(0, 1, 0).cross(n).normalize(); this.tB.crossVectors(n, this.tA);
      const hop = Math.max(0, Math.sin(time * 0.15 + q.ph)) ** 20 * 0.0015; // the odd short hop to a new pool
      this.c.copy(n).addScaledVector(this.tA, q.gx * 0.004 + hop).addScaledVector(this.tB, q.gy * 0.004)
        .normalize().multiplyScalar(1.0006 + hop * 0.5);
      _v.lerp(this.c, 1 - mv);
      // a slow wave of wingbeats travels down each skein
      const beat = 0.5 + 0.5 * Math.sin(time * 2.4 - Math.abs(d) * 0.7 + q.k);
      const a = lerp(0.85, 0.6 + 0.4 * beat, mv);
      this.cloud.set(i, _v, lerp(0.0013, 0.0021 + beat * 0.0004, mv), a, 1.0, 0.96, 0.84);
    }
    this.cloud.commit();
  }
}

/* ───────────────────────────── Starlings of Rome ───────────────────────────── */
const ROME = latLonToVec(41.9, 12.5);

export class Starlings extends Migration {
  constructor(sp) {
    super(sp);
    this.addRouteLine({ width: 1.1, base: 0.06, trail: 0.2, dash: 160, dashSpeed: 1.2 }, () => 1.003);
    this.N = 4200; this.flocks = 30;
    const r = rng(163);
    this.p = Array.from({ length: this.N }, (_, i) => ({ k: i % this.flocks, a: r() * 2 - 1, b: r() * 2 - 1, g: gauss(r), h: gauss(r), ph: r() * 100, c: r() }));
    this.fg = Array.from({ length: this.flocks }, () => gauss(r));
    this.cloud = new PointCloud(this.N, { minPx: 1 });
    this.group.add(this.cloud.points);
    this.clouds.push(this.cloud);
    this.tA = new THREE.Vector3(); this.tB = new THREE.Vector3(); this.c = new THREE.Vector3(); this.hf = { p: new THREE.Vector3(), t: new THREE.Vector3(), s: new THREE.Vector3(), n: new THREE.Vector3() };
    const n = ROME.clone().normalize();
    this.rA = new THREE.Vector3(0, 1, 0).cross(n).normalize(); this.rB = new THREE.Vector3().crossVectors(n, this.rA);
  }
  update(st) {
    this.baseUpdate(st);
    const u = this.u, t = st.time, mv = this.mv, dir = this.dir;
    const fu = fract(u);
    const atRome = smooth(clamp(1 - Math.abs(fu - 0.48) / 0.05));
    const head = this.route.frame(u, this.hf);
    // the murmuration: a deforming sheet that folds, flattens and turns
    const Rx = 0.017, Ry = 0.0075;
    const rot = t * 0.15 + 0.7 * Math.sin(t * 0.21);
    const cr = Math.cos(rot), sr = Math.sin(rot);
    const squash = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * 0.37));
    const wx = Math.sin(t * 0.11) * 0.006, wy = Math.cos(t * 0.09) * 0.004;
    for (let i = 0; i < this.N; i++) {
      const q = this.p[i];
      // migration: dense flocks strung along the flyway
      this.route.frame(u - q.k * 0.012 * dir, _f);
      _v.copy(_f.p).addScaledVector(_f.s, this.fg[q.k] * 0.008 + q.g * 0.0016).addScaledVector(_f.t, q.h * 0.0016 + Math.sin(t * 1.3 + q.ph) * 0.0005)
        .normalize().multiplyScalar(1.003);
      // breeding: pairs scattered across the Baltic countryside
      _w.copy(head.p).addScaledVector(head.s, q.g * 0.03).addScaledVector(head.t, q.h * 0.03).normalize().multiplyScalar(1.001);
      // winter: one body over Rome
      const x0 = q.a * Rx * (1 + 0.35 * Math.sin(t * 0.53 + q.b * 2.1)) + 0.4 * Rx * Math.sin(t * 0.31 + q.b * 1.7);
      const y0 = q.b * Ry * squash * (1 + 0.35 * Math.cos(t * 0.47 + q.a * 1.9)) + 0.3 * Ry * Math.sin(t * 0.27 + q.a * 2.3);
      // bend the sheet into an S that travels along it, and pinch it into a waist
      const bend = 0.9 * Ry * Math.sin((x0 / Rx) * 2.2 + t * 0.6) * (1.1 + Math.sin(t * 0.23));
      const pinch = 0.55 + 0.45 * Math.abs(Math.sin((x0 / Rx) * 1.6 - t * 0.4));
      const y1 = y0 * pinch + bend;
      const x = x0 * cr - y1 * sr + wx, y = x0 * sr + y1 * cr + wy;
      this.c.copy(ROME).addScaledVector(this.rA, x).addScaledVector(this.rB, y).normalize()
        .multiplyScalar(1.003 + 0.002 * Math.sin(q.a * 3 + t * 0.8));
      _w.lerp(this.c, atRome);
      _v.lerp(_w, 1 - mv);
      // a travelling density wave lights up the body; the odd iridescent glint
      const wave = 0.5 + 0.5 * Math.sin(q.a * 6 - t * 3 + q.b * 2);
      const glint = q.c > 0.93 ? 1 : 0;
      const murm = atRome * (1 - mv);
      const alpha = lerp(0.5, 0.08 + 0.55 * wave * wave * wave, murm);
      if (glint) this.cloud.set(i, _v, 0.0011, alpha + 0.3, 0.85, 0.75, 1.0);
      else this.cloud.set(i, _v, lerp(0.001, 0.0012, murm), alpha, 0.5 + q.c * 0.15, 0.36 + q.c * 0.1, 0.85);
    }
    this.cloud.commit();
  }
}

/* ───────────────────────────── European eels ───────────────────────────── */
export class Eels extends Migration {
  constructor(sp) {
    super(sp);
    this.addRouteLine({ width: 1.1, base: 0.06, trail: 0.12, dash: 600, dashSpeed: 1.6 }, () => 1.0012);
    const r = rng(181);
    this.NL = 1400;
    this.l = Array.from({ length: this.NL }, () => ({ s: r(), g: gauss(r), ph: r() * 100 }));
    this.larvae = new PointCloud(this.NL, { minPx: 1 });
    this.E = 60; this.seg = 10;
    this.e = Array.from({ length: this.E }, () => ({ s: r(), g: gauss(r), ph: r() * 6.283, sp: 0.8 + r() * 0.4 }));
    this.silver = new PointCloud(this.E * this.seg, { minPx: 1 });
    this.group.add(this.larvae.points, this.silver.points);
    this.clouds.push(this.larvae, this.silver);
    this.hf = { p: new THREE.Vector3(), t: new THREE.Vector3(), s: new THREE.Vector3(), n: new THREE.Vector3() };
  }
  update(st) {
    this.baseUpdate(st);
    const u = this.u, t = st.time, mv = this.mv;
    const fu = fract(u);
    // which life stage the year is in
    const silverW = smooth(clamp((fu - 0.58) / 0.02)) * smooth(clamp((0.998 - fu) / 0.02));
    const atSargasso = smooth(clamp(1 - Math.min(fu, 1 - fu) / 0.02));
    const inRiver = smooth(clamp(1 - Math.abs(fu - 0.577) / 0.012));
    const glass = smooth(clamp((fu - 0.4) / 0.06)) * (1 - silverW);
    const larvaW = (1 - silverW) * (1 - inRiver * 0.85);
    const head = this.route.frame(u, this.hf);
    // larvae → glass eels: a long, pale drifting band that sharpens into sparkles
    for (let i = 0; i < this.NL; i++) {
      const q = this.l[i];
      const span = lerp(0.12, 0.04, glass);
      this.route.frame(u - q.s * span, _f);
      const drift = Math.sin(t * 0.4 + q.ph) * 0.002;
      _v.copy(_f.p).addScaledVector(_f.s, q.g * lerp(0.02, 0.006, glass) + drift).normalize().multiplyScalar(1.0012);
      _w.copy(head.p).addScaledVector(head.s, q.g * 0.004).addScaledVector(head.t, (q.s - 0.5) * 0.006).normalize().multiplyScalar(1.0012);
      _v.lerp(_w, inRiver);
      const tw = Math.pow(Math.max(0, Math.sin(t * 3 + q.ph)), 6);
      const a = larvaW * lerp(0.5, 0.35 + tw * 0.9, glass);
      this.larvae.set(i, _v, lerp(0.0019, 0.0014, glass), a, lerp(0.55, 0.85, glass), lerp(0.95, 1, glass), lerp(0.85, 1, glass));
    }
    this.larvae.commit();
    // silver eels: undulating bodies swimming home, a slow spawning swirl at the end
    for (let k = 0; k < this.E; k++) {
      const q = this.e[k];
      for (let j = 0; j < this.seg; j++) {
        const along = q.s * 0.06 + j * 0.0024;
        this.route.frame(u - along, _f);
        const und = Math.sin(j * 0.9 - t * 4 * q.sp + q.ph) * 0.0024 * (j / this.seg + 0.3);
        _v.copy(_f.p).addScaledVector(_f.s, q.g * 0.014 + und).normalize().multiplyScalar(1.0012);
        const a2 = q.ph + t * 0.4 - j * 0.12;
        const rr = 0.004 + Math.abs(q.g) * 0.003;
        _w.copy(head.p).addScaledVector(head.s, Math.cos(a2) * rr).addScaledVector(head.t, Math.sin(a2) * rr).normalize().multiplyScalar(1.0012);
        _v.lerp(_w, atSargasso * (1 - mv));
        const fade = 1 - j / this.seg;
        this.silver.set(k * this.seg + j, _v, 0.002 * (0.6 + 0.4 * fade), Math.max(silverW, atSargasso) * (0.4 + 0.6 * fade), 0.82, 0.95, 1.0);
      }
    }
    this.silver.commit();
  }
}

/* ───────────────────────────── Blackbirds (night migrants) ───────────────────────────── */
export class Blackbirds extends Migration {
  constructor(sp) {
    super(sp);
    this.addRouteLine({ width: 1.1, base: 0.06, trail: 0.16, dash: 200, dashSpeed: 0.9 }, () => 1.003);
    const r = rng(197);
    this.N = 900; this.B = 260;
    this.p = Array.from({ length: this.N }, () => ({ s: r(), g: gauss(r), h: gauss(r), ph: r() * 100 }));
    this.q = Array.from({ length: this.B }, () => ({ s: r(), g: gauss(r), ph: r() * 6.283 }));
    this.birds = new PointCloud(this.N, { minPx: 1 });
    this.echo = new PointCloud(this.B, { minPx: 2 });
    this.group.add(this.echo.points, this.birds.points);
    this.clouds.push(this.birds, this.echo);
    this.hf = { p: new THREE.Vector3(), t: new THREE.Vector3(), s: new THREE.Vector3(), n: new THREE.Vector3() };
    this.sun = new THREE.Vector3(1, 0, 0);
  }
  update(st) {
    this.baseUpdate(st);
    const u = this.u, t = st.time, mv = this.mv, dir = this.dir;
    if (st.sun) this.sun.copy(st.sun);
    const head = this.route.frame(u, this.hf);
    const night = (v) => smooth(clamp((0.08 - v.dot(this.sun)) / 0.25)); // 1 on the night side
    // birds: a broad front by night, scattered in gardens and woods by day or at rest
    for (let i = 0; i < this.N; i++) {
      const q = this.p[i];
      this.route.frame(u - q.s * 0.1 * dir, _f);
      _v.copy(_f.p).addScaledVector(_f.s, q.g * 0.028 + Math.sin(t * 0.7 + q.ph) * 0.002).normalize().multiplyScalar(1.004);
      const hop = Math.max(0, Math.sin(t * 0.8 + q.ph)) ** 12 * 0.0012;
      _w.copy(head.p).addScaledVector(head.s, q.g * 0.034 + hop).addScaledVector(head.t, q.h * 0.034).normalize().multiplyScalar(1.0012);
      _v.lerp(_w, 1 - mv);
      const nf = night(_v) * mv;
      this.birds.set(i, _v, 0.0015, 0.25 + 0.85 * nf, 1.0, lerp(0.75, 0.9, nf), lerp(0.2, 0.4, nf));
    }
    this.birds.commit();
    // weather-radar echoes: soft blooms that light up only where the passage is at night
    for (let k = 0; k < this.B; k++) {
      const q = this.q[k];
      this.route.frame(u - q.s * 0.1 * dir, _f);
      _v.copy(_f.p).addScaledVector(_f.s, q.g * 0.024).normalize().multiplyScalar(1.004);
      const sweep = 0.55 + 0.45 * Math.sin(t * 1.4 - q.s * 9 + q.ph);
      const a = night(_v) * mv * 0.26 * sweep;
      this.echo.set(k, _v, 0.009 + q.s * 0.006, a, 1.0, 0.85, 0.35);
    }
    this.echo.commit();
  }
}

export const CLASSES = { whale: Whales, tern: Terns, wildebeest: Wildebeest, monarch: Monarchs, caribou: Caribou, swallow: Swallows, tuna: Tuna, buzzard: Buzzards, martin: HouseMartins, egret: Egrets, starling: Starlings, eel: Eels, blackbird: Blackbirds };
