import * as THREE from 'three';

/** CPU-driven point cloud with per-point size (world units), alpha and colour. */
export class PointCloud {
  constructor(N, { blending = THREE.AdditiveBlending, minPx = 1, shape = 'soft' } = {}) {
    const normal = blending === THREE.NormalBlending;
    this.N = N;
    this.pos = new Float32Array(N * 3);
    this.size = new Float32Array(N).fill(0.001);
    this.alpha = new Float32Array(N).fill(1);
    this.col = new Float32Array(N * 3).fill(1);
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    this.aAlpha = new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos);
    g.setAttribute('aSize', this.aSize);
    g.setAttribute('aAlpha', this.aAlpha);
    g.setAttribute('aCol', this.aCol);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 2);
    this.uniforms = { uScale: PointCloud.scale, uMinPx: { value: minPx }, uOpacity: { value: 1 }, uDpr: PointCloud.dpr };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `
        attribute float aSize; attribute float aAlpha; attribute vec3 aCol;
        uniform float uScale; uniform float uMinPx; uniform float uDpr;
        varying vec4 vC;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float px = aSize * uScale / -mv.z;
          float minPx = uMinPx * uDpr;
          float a = aAlpha * min(1.0, pow(px / minPx, 1.5));
          gl_PointSize = max(px, minPx);
          vC = vec4(aCol, a);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: shape === 'hard' ? /* glsl */ `
        uniform float uOpacity; varying vec4 vC;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float a = 1.0 - smoothstep(0.6, 1.0, d);
          ${normal ? 'gl_FragColor = vec4(vC.rgb, vC.a * a * uOpacity);' : 'gl_FragColor = vec4(vC.rgb * vC.a * a * uOpacity, 1.0);'}
        }` : /* glsl */ `
        uniform float uOpacity; varying vec4 vC;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float a = exp(-d * d * 3.5) * (1.0 - smoothstep(0.85, 1.0, d));
          gl_FragColor = vec4(vC.rgb * vC.a * a * uOpacity, 1.0);
        }`,
      transparent: true, depthWrite: false, blending,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
  }
  set(i, v, size, alpha, r, g, b) {
    const k = i * 3;
    this.pos[k] = v.x; this.pos[k + 1] = v.y; this.pos[k + 2] = v.z;
    this.size[i] = size; this.alpha[i] = alpha;
    this.col[k] = r; this.col[k + 1] = g; this.col[k + 2] = b;
  }
  commit() {
    this.aPos.needsUpdate = true; this.aSize.needsUpdate = true;
    this.aAlpha.needsUpdate = true; this.aCol.needsUpdate = true;
  }
}
PointCloud.scale = { value: 1000 };
PointCloud.dpr = { value: 1 };

/**
 * Screen-space ribbon along a polyline with per-vertex arc parameter u.
 * Fragment alpha = faint base + bright trail behind a moving head.
 */
export class Ribbon {
  constructor(points, us, { color = [1, 1, 1], width = 1.5, base = 0.15, trail = 0.1, loop = true, dash = 0, dashSpeed = 0.2, glow = 1 } = {}) {
    const n = points.length;
    const pos = new Float32Array(n * 2 * 3), prev = new Float32Array(n * 2 * 3), next = new Float32Array(n * 2 * 3);
    const side = new Float32Array(n * 2), uu = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      const p = points[i], a = points[Math.max(0, i - 1)], b = points[Math.min(n - 1, i + 1)];
      for (let s = 0; s < 2; s++) {
        const k = (i * 2 + s) * 3;
        pos.set([p.x, p.y, p.z], k); prev.set([a.x, a.y, a.z], k); next.set([b.x, b.y, b.z], k);
        side[i * 2 + s] = s ? 1 : -1;
        uu[i * 2 + s] = us[i];
      }
    }
    const idx = [];
    for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aPrev', new THREE.BufferAttribute(prev, 3));
    g.setAttribute('aNext', new THREE.BufferAttribute(next, 3));
    g.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
    g.setAttribute('aU', new THREE.BufferAttribute(uu, 1));
    g.setIndex(idx);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 2);
    this.uniforms = {
      uRes: Ribbon.res, uDpr: PointCloud.dpr,
      uColor: { value: new THREE.Vector3(...color) },
      uWidth: { value: width }, uBase: { value: base }, uTrail: { value: trail },
      uHead: { value: 0 }, uDir: { value: 1 }, uDraw: { value: 1 }, uOpacity: { value: 1 },
      uLoop: { value: loop ? 1 : 0 }, uDash: { value: dash }, uDashSpeed: { value: dashSpeed },
      uTime: Ribbon.time, uGlow: { value: glow }, uHi: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `
        attribute vec3 aPrev; attribute vec3 aNext; attribute float aSide; attribute float aU;
        uniform vec2 uRes; uniform float uWidth; uniform float uDpr; uniform float uHi;
        varying float vU; varying float vSide;
        void main() {
          mat4 mvp = projectionMatrix * modelViewMatrix;
          vec4 c = mvp * vec4(position, 1.0);
          vec4 a = mvp * vec4(aPrev, 1.0);
          vec4 b = mvp * vec4(aNext, 1.0);
          vec2 sa = a.xy / a.w * uRes, sb = b.xy / b.w * uRes;
          vec2 dir = normalize(sb - sa + 1e-6);
          vec2 nrm = vec2(-dir.y, dir.x);
          float w = uWidth * (1.0 + uHi * 0.8) * uDpr;
          c.xy += nrm * aSide * w / uRes * c.w;
          vU = aU; vSide = aSide;
          gl_Position = c;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; uniform float uBase; uniform float uTrail; uniform float uHead; uniform float uDir;
        uniform float uDraw; uniform float uOpacity; uniform float uLoop; uniform float uDash; uniform float uDashSpeed;
        uniform float uTime; uniform float uGlow; uniform float uHi;
        varying float vU; varying float vSide;
        void main() {
          float du = (uHead - vU) * uDir;
          if (uLoop > 0.5) du = fract(du);
          float tr = (du >= 0.0 && du < uTrail) ? pow(1.0 - du / uTrail, 1.6) : 0.0;
          float base = uBase * (1.0 + uHi * 2.5);
          if (uDash > 0.0) base *= 0.35 + 0.65 * step(0.45, fract(vU * uDash - uTime * uDashSpeed));
          float draw = smoothstep(uDraw, uDraw - 0.01, vU);
          float edge = 1.0 - abs(vSide);
          float a = (base + tr * uGlow) * draw * uOpacity * (0.35 + 0.65 * edge);
          gl_FragColor = vec4(uColor * a, 1.0);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
  }
}
Ribbon.res = { value: new THREE.Vector2(1, 1) };
Ribbon.time = { value: 0 };

/** sample a SphereRoute into points at radius r(u) */
export function sampleRoute(route, n, rFn = () => 1.001) {
  const pts = [], us = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    pts.push(route.at(u).multiplyScalar(rFn(u)));
    us.push(u);
  }
  return { pts, us };
}
