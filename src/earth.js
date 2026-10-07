import * as THREE from 'three';
import { NOISE } from './shaders/noise.js';

const PI = Math.PI;

const earthVert = /* glsl */ `
varying vec3 vPos;
void main() {
  vPos = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const earthFrag = /* glsl */ `
#define PI 3.14159265
uniform sampler2D uLand;
uniform sampler2D uClimate;
uniform sampler2D uPatch;
uniform vec4 uPatchBounds;
uniform float uPatchOn;
uniform vec3 uSun;
uniform vec3 uCam;
uniform float uTime;
uniform float uMonth;
uniform vec3 uPointer;
uniform float uPointerAmt;
uniform float uReveal;
uniform float uNightGrid;
varying vec3 vPos;
${NOISE}

float gridDots(vec2 c, float cell, float radius) {
  vec2 g = fract(c / cell) - 0.5;
  return 1.0 - smoothstep(radius - 0.12, radius + 0.12, length(g) / 0.5);
}

void main() {
  vec3 n = normalize(vPos);
  float lat = asin(clamp(n.y, -1.0, 1.0));
  float lon = atan(n.x, n.z);
  vec2 uv = vec2(lon / (2.0 * PI) + 0.5, lat / PI + 0.5);
  float latD = degrees(lat), lonD = degrees(lon);

  // pixel footprint (radians on sphere) — drives level-of-detail everywhere
  float fp = length(fwidth(vPos));
  float close = 1.0 - smoothstep(0.0004, 0.004, fp);

  vec4 L = texture2D(uLand, uv);
  vec2 puv = (vec2(lonD, latD) - uPatchBounds.xy) / (uPatchBounds.zw - uPatchBounds.xy);
  float pin = uPatchOn * smoothstep(0.0, 0.05, puv.x) * smoothstep(1.0, 0.95, puv.x) * smoothstep(0.0, 0.05, puv.y) * smoothstep(1.0, 0.95, puv.y);
  vec4 P = texture2D(uPatch, clamp(puv, 0.0, 1.0));
  float sharp = mix(L.r, P.r, pin);
  float shelf = mix(L.g, P.g, pin);
  float cont = L.b;

  vec4 C = texture2D(uClimate, uv);
  float micro = fbmAA(n * 60.0, fp * 60.0, 8);
  // fractal coastline detail when we're close
  float detail = close > 0.001 ? fbmAA(n * 260.0, fp * 260.0, 5) : 0.5;
  sharp += (micro - 0.5) * 0.12 + (detail - 0.5) * 0.3 * close;
  float aa = fwidth(sharp) + 0.01;
  float land = smoothstep(0.5 - aa, 0.5 + aa, sharp);

  // season helpers (0..1)
  float m = uMonth;
  float winterN = 0.5 + 0.5 * cos(2.0 * PI * (m - 0.5) / 12.0);
  float iceN = 0.5 + 0.5 * cos(2.0 * PI * (m - 2.5) / 12.0);
  float iceS = 0.5 + 0.5 * cos(2.0 * PI * (m - 8.7) / 12.0);
  float greenN = 0.5 + 0.5 * cos(2.0 * PI * (m - 6.5) / 12.0);
  float green = latD > 0.0 ? greenN : 1.0 - greenN;

  // ---- land palette (linear) ----
  float aL = abs(latD);
  float macro = C.a;
  float tropic = 1.0 - smoothstep(10.0, 26.0, aL);
  float dry = smoothstep(0.25, 0.75, C.r + (macro - 0.5) * 0.5);
  float wet = smoothstep(0.2, 0.7, C.g + (macro - 0.5) * 0.4);
  vec3 forest = vec3(0.012, 0.042, 0.012);
  vec3 savanna = vec3(0.11, 0.085, 0.032);
  vec3 desert = vec3(0.32, 0.2, 0.09);
  vec3 temperate = mix(vec3(0.08, 0.07, 0.035), vec3(0.025, 0.06, 0.02), green);
  vec3 tundra = vec3(0.1, 0.09, 0.07);
  vec3 col = mix(temperate, mix(savanna, forest, wet), tropic);
  col = mix(col, forest * 1.2, wet * (1.0 - tropic) * 0.6);
  col = mix(col, tundra, smoothstep(52.0, 64.0, aL));
  col = mix(col, desert, dry);
  col *= mix(0.75 + 0.5 * micro, 0.5 + 1.0 * micro, close);
  // woodland, kopjes and drainage lines that only resolve up close
  if (close > 0.001 && land > 0.0) {
    float trees = smoothstep(0.6, 0.7, fbmAA(n * 1800.0, fp * 1800.0, 4));
    float drain = 1.0 - smoothstep(0.0, 0.03, abs(fbmAA(n * 500.0, fp * 500.0, 5) - 0.5));
    col = mix(col, vec3(0.02, 0.04, 0.015), (trees * 0.55 + drain * 0.35) * close * (1.0 - dry));
  }
  // terrain: ridged ranges where mountains are, rolling hills elsewhere
  float mtn = C.b * smoothstep(0.3, 0.6, macro + 0.25);
  float rid = 0.0;
  if (mtn > 0.004) rid = 1.0 - abs(2.0 * fbmAA(n * 46.0, fp * 46.0, 7) - 1.0);
  float hills = micro;
  float h = mtn * (rid * rid * 0.85 + hills * 0.15) + (1.0 - mtn) * hills * 0.18;
  // derivative bump mapping (height in world units, exaggerated)
  vec3 dpdx = dFdx(vPos), dpdy = dFdy(vPos);
  float hb = h * 0.006 * land * mix(1.0, 0.22, close);
  float dhdx = dFdx(hb), dhdy = dFdy(hb);
  vec3 r1 = cross(dpdy, n), r2 = cross(n, dpdx);
  float det = dot(dpdx, r1);
  vec3 nb = normalize(abs(det) * n - sign(det) * (dhdx * r1 + dhdy * r2));
  if (det == 0.0) nb = n;
  col = mix(col, vec3(0.09, 0.08, 0.07), mtn * rid * 0.5);

  // snow & ice
  float snowLine = mix(71.0, 47.0, winterN) + (macro - 0.5) * 10.0;
  float snow = smoothstep(snowLine - 3.0, snowLine + 3.0, latD);
  snow = max(snow, smoothstep(-58.0, -63.0, latD));
  float greenland = step(59.0, latD) * step(-58.0, lonD) * step(lonD, -18.0) * smoothstep(0.35, 0.55, cont);
  snow = max(snow, greenland);
  snow = max(snow, smoothstep(0.74, 0.88, h - (green - 0.5) * 0.24 + smoothstep(35.0, 60.0, aL) * 0.06 - tropic * 0.14 - (1.0 - smoothstep(38.0, 46.0, aL)) * 0.06) * mtn * smoothstep(14.0, 28.0, aL));
  col = mix(col, vec3(0.4, 0.43, 0.48) * (0.85 + 0.25 * micro), snow);

  // ---- ocean ----
  vec3 deep = vec3(0.004, 0.02, 0.05);
  vec3 shallow = vec3(0.008, 0.065, 0.085);
  vec3 ocean = mix(deep, shallow, smoothstep(0.08, 0.7, shelf) * 0.9);
  float seaIceN = smoothstep(mix(81.0, 68.0, iceN) - 2.0, mix(81.0, 68.0, iceN) + 2.0, latD + (micro - 0.5) * 6.0);
  float seaIceS = smoothstep(-mix(68.0, 58.0, iceS) + 2.0, -mix(68.0, 58.0, iceS) - 2.0, latD + (micro - 0.5) * 6.0);
  // Hudson Bay: freezes outward from Churchill in November, melts last in the south-west in July
  vec2 hBay = vec2((latD - 58.6) / 7.8, (lonD + 85.0) / 12.0);
  float inBay = 1.0 - smoothstep(0.82, 1.0, length(hBay));
  float bayFrz = m < 8.5 ? 1.0 - smoothstep(5.4, 7.2, m) : smoothstep(10.6, 11.7, m);
  float cosL = cos(lat);
  float gNW = distance(vec2(lonD * cosL, latD), vec2(-94.0 * cosL, 59.0)) / 11.0;
  float gSW = distance(vec2(lonD * cosL, latD), vec2(-90.0 * cosL, 56.0)) / 12.0;
  float iceFront = m < 8.5 ? gSW : gNW;
  float iceH = inBay * smoothstep(iceFront - 0.08, iceFront + 0.02, bayFrz * 1.25 + (micro - 0.5) * 0.25);
  float seaIce = max(max(seaIceN, seaIceS), iceH);
  ocean = mix(ocean, vec3(0.36, 0.42, 0.5) * (0.7 + 0.4 * micro), seaIce * 0.9);

  vec3 surf = mix(ocean, col, land);

  // ---- lighting ----
  vec3 V = normalize(uCam - vPos);
  float NdL = dot(n, uSun);
  float day = smoothstep(-0.08, 0.22, NdL);
  vec3 nL = normalize(mix(n, nb, land));
  float NdLb = dot(nL, uSun);
  float diff = max(0.0, NdLb * 0.92 + 0.08) * smoothstep(-0.15, 0.05, NdL);
  vec3 sunCol = vec3(1.0, 0.95, 0.88);
  vec3 sky = vec3(0.12, 0.18, 0.3) * 0.25 * day;             // blue skylight fills the shadows
  vec3 lit = surf * (sunCol * diff * 1.9 + sky);
  lit = mix(lit, lit * vec3(0.8, 0.9, 1.2), snow * land * (1.0 - smoothstep(0.0, 0.5, NdLb)));

  // ocean glint with wave-perturbed normal
  float waves = vnoise(n * 400.0 + uTime * 0.25) + vnoise(n * 900.0 - uTime * 0.3) * 0.5;
  vec3 wn = normalize(n + (vec3(vnoise(n * 520.0 + uTime * 0.2), vnoise(n * 520.0 + 17.0 - uTime * 0.2), vnoise(n * 520.0 + 41.0)) - 0.5) * 0.06 * (1.0 - land) + (waves - 0.75) * 0.0);
  vec3 H = normalize(uSun + V);
  float spec = pow(max(dot(wn, H), 0.0), 1200.0) * 0.55 + pow(max(dot(n, H), 0.0), 80.0) * 0.04;
  lit += (1.0 - land) * (1.0 - seaIce) * spec * sunCol * day;

  // terminator glow and day-side scattering haze
  float term = exp(-pow(NdL / 0.09, 2.0));
  lit += vec3(0.5, 0.2, 0.06) * term * 0.12 * (0.4 + land);
  float fres = pow(1.0 - max(dot(n, V), 0.0), 3.0);
  lit += vec3(0.1, 0.26, 0.7) * fres * 0.38 * smoothstep(-0.1, 0.6, NdL);

  // ---- night: halftone cartography ----
  float px = fwidth(latD) + 1e-5;
  float level = log2(px * 9.0);
  float c1 = exp2(floor(level));
  float lf = fract(level);
  vec2 gc = vec2(lonD * cos(lat), latD);
  float dotsLand = mix(gridDots(gc, c1, 0.55), gridDots(gc, c1 * 2.0, 0.55), lf);
  float dotsSea = mix(gridDots(gc, c1 * 2.0, 0.18), gridDots(gc, c1 * 4.0, 0.18), lf);
  float coastLine = 1.0 - smoothstep(0.0, aa * 2.5 + 0.02, abs(sharp - 0.5));
  vec3 cyan = vec3(0.25, 0.75, 1.0);
  vec3 night = cyan * (dotsLand * land * 0.11 + dotsSea * (1.0 - land) * 0.025 + coastLine * 0.22);
  night += vec3(0.6, 0.75, 1.0) * snow * 0.012 * land;
  // graticule
  float gStep = 15.0;
  vec2 gg = abs(fract(vec2(latD, lonD) / gStep + 0.5) - 0.5) * gStep;
  vec2 gw = fwidth(vec2(latD, lonD)) * 0.8;
  float grat = max(1.0 - smoothstep(0.0, gw.x, gg.x), 1.0 - smoothstep(0.0, gw.y, gg.y));
  float eq = 1.0 - smoothstep(0.0, gw.x * 1.5, abs(latD));
  float tropics = 1.0 - smoothstep(0.0, gw.x, abs(aL - 23.44));
  night += cyan * (grat * 0.04 + eq * 0.07 + tropics * 0.04);

  vec3 color = mix(night * uNightGrid, lit, day);
  color += cyan * grat * 0.012 * day; // faint survey grid by day

  // pointer reticle
  float pd = distance(n, uPointer);
  float halo = exp(-pd * pd / 0.0035) * uPointerAmt;
  float ring = (1.0 - smoothstep(0.0, fp * 1.5, abs(pd - 0.055))) * uPointerAmt;
  float ring2 = (1.0 - smoothstep(0.0, fp * 1.2, abs(pd - 0.075))) * uPointerAmt * step(0.5, fract(atan(n.y - uPointer.y, n.x - uPointer.x) * 6.0 / PI));
  color += vec3(1.0, 0.85, 0.6) * halo * 0.12 + cyan * (ring * 0.5 + ring2 * 0.25);

  color *= uReveal;
  gl_FragColor = vec4(color, 1.0);
}`;

const cloudFrag = /* glsl */ `
#define PI 3.14159265
uniform vec3 uSun;
uniform float uTime;
uniform float uAmt;
varying vec3 vPos;
${NOISE}
void main() {
  vec3 n = normalize(vPos);
  float lat = asin(n.y);
  float t = uTime * 0.004;
  // differential rotation by latitude band
  float band = sin(lat * 3.0);
  float a = t * (1.0 + band * 0.6);
  mat2 R = mat2(cos(a), -sin(a), sin(a), cos(a));
  vec3 p = n; p.xz = R * p.xz;
  if (uAmt < 0.004) discard;
  vec3 q = vec3(fbm3(p * 2.2 + t), fbm3(p * 2.2 + vec3(5.2, 1.3, 2.8) - t), fbm3(p * 2.2 + vec3(1.7, 9.2, 4.1) + t * 0.5));
  float c = fbm(p * 7.0 + (q - 0.5) * 1.8);
  c += (vnoise(p * 26.0 + q * 3.0) - 0.5) * 0.12;
  float itcz = exp(-pow(degrees(lat) / 7.0, 2.0)) * 0.1;
  float storm = exp(-pow((abs(degrees(lat)) - 52.0) / 12.0, 2.0)) * 0.12;
  float cover = smoothstep(0.57, 0.8, c + itcz + storm) * (0.6 + 0.4 * smoothstep(0.3, 0.7, q.x));
  float NdL = dot(n, uSun);
  float day = smoothstep(-0.1, 0.25, NdL);
  vec3 col = vec3(1.0, 0.97, 0.93) * (0.25 + 1.05 * max(NdL, 0.0));
  col = mix(col, vec3(1.0, 0.55, 0.3), exp(-pow(NdL / 0.12, 2.0)) * 0.5);
  float alpha = cover * uAmt * mix(0.02, 0.5, day);
  gl_FragColor = vec4(col * day + vec3(0.02, 0.04, 0.08) * (1.0 - day), alpha);
}`;

const atmoVert = /* glsl */ `
varying vec3 vPos;
void main() { vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const atmoFrag = /* glsl */ `
uniform vec3 uSun;
uniform vec3 uCam;
uniform float uIntensity;
uniform vec3 uPointer;
uniform float uPointerAmt;
varying vec3 vPos;
void main() {
  vec3 d = normalize(vPos - uCam);
  float t = -dot(uCam, d);
  vec3 closest = uCam + d * t;
  float b = length(closest);
  if (b < 1.0) discard;
  vec3 limb = normalize(closest);
  float l = dot(limb, uSun);
  float thin = exp(-(b - 1.0) / 0.022);
  float wide = exp(-(b - 1.0) / 0.09) * 0.35;
  vec3 dayCol = vec3(0.22, 0.52, 1.0);
  vec3 duskCol = vec3(1.0, 0.42, 0.18);
  vec3 col = mix(duskCol, dayCol, smoothstep(-0.05, 0.4, l));
  float lit = smoothstep(-0.35, 0.15, l);
  float fwd = pow(max(dot(d, uSun), 0.0), 12.0) * 1.1;  // backlit forward scattering
  float touch = exp(-pow(distance(limb, uPointer) / 0.35, 2.0)) * uPointerAmt * 0.6;
  float I = (thin + wide * 0.8) * (lit * 0.8 + fwd + touch);
  gl_FragColor = vec4(col * I * uIntensity, 1.0);
}`;


const climateFrag = /* glsl */ `
#define PI 3.14159265
varying vec2 vUv;
${NOISE}
// hand-placed climate regions: (lat, lon, radiusLat, radiusLon)
const vec4 DESERTS[10] = vec4[10](
  vec4(23.0, 10.0, 9.0, 26.0), vec4(23.0, 47.0, 8.0, 12.0), vec4(30.0, 63.0, 6.0, 10.0), vec4(41.0, 95.0, 5.0, 18.0),
  vec4(-23.0, 20.0, 6.0, 7.0), vec4(-25.0, 131.0, 8.0, 13.0), vec4(-22.0, -69.5, 6.0, 2.0), vec4(32.0, -112.0, 5.0, 6.0),
  vec4(-45.0, -68.0, 6.0, 3.5), vec4(44.0, 62.0, 4.0, 12.0));
const vec4 FORESTS[7] = vec4[7](
  vec4(-5.0, -62.0, 10.0, 14.0), vec4(0.0, 21.0, 6.0, 10.0), vec4(2.0, 110.0, 9.0, 18.0), vec4(13.0, -87.0, 6.0, 6.0),
  vec4(-3.0, 140.0, 6.0, 10.0), vec4(-20.0, -45.0, 6.0, 6.0), vec4(-10.5, 105.6, 1.2, 1.2));
float region(vec4 r, float la, float lo) {
  float dlo = mod(lo - r.y + 540.0, 360.0) - 180.0;
  vec2 d = vec2((la - r.x) / r.z, dlo / r.w);
  return exp(-dot(d, d) * 1.6);
}

// mountain ranges as segments: (lat1, lon1, lat2, lon2)
const int NSEG = 30;
const vec4 RANGES[30] = vec4[30](
  vec4(10.0, -73.0, -5.0, -79.0), vec4(-5.0, -79.0, -18.0, -69.0), vec4(-18.0, -69.0, -35.0, -70.0), vec4(-35.0, -70.0, -52.0, -73.0),
  vec4(62.0, -135.0, 52.0, -120.0), vec4(52.0, -120.0, 42.0, -110.0), vec4(42.0, -110.0, 33.0, -106.0),
  vec4(68.2, -162.0, 68.5, -150.0), vec4(68.5, -150.0, 68.9, -142.0), vec4(68.9, -142.0, 68.6, -137.0),
  vec4(62.0, -153.0, 63.3, -147.0), vec4(63.3, -147.0, 61.5, -140.0), vec4(65.3, -141.0, 64.6, -135.5),
  vec4(35.5, 73.0, 29.0, 84.0), vec4(29.0, 84.0, 27.6, 93.0), vec4(36.0, 70.0, 39.0, 76.0),
  vec4(44.0, 6.0, 46.6, 11.0), vec4(46.6, 11.0, 47.2, 15.0), vec4(31.0, -8.0, 36.0, 4.0),
  vec4(-4.4, 36.0, -2.9, 36.5), vec4(-2.9, 36.5, -0.4, 36.4), vec4(-0.4, 36.2, 1.2, 37.4), vec4(8.0, 37.5, 13.0, 39.0),
  vec4(59.0, 6.0, 68.0, 16.0), vec4(50.0, 59.0, 67.0, 64.0), vec4(-37.5, 148.5, -17.0, 145.5),
  vec4(26.0, -106.0, 20.5, -103.5), vec4(19.6, -104.5, 19.2, -97.0), vec4(42.5, 41.0, 41.0, 48.0), vec4(36.0, -82.0, 42.0, -75.0));
float mountainMask(float la, float lo) {
  float m = 0.0;
  float c = cos(radians(la));
  for (int i = 0; i < NSEG; i++) {
    vec4 s = RANGES[i];
    vec2 a = vec2(s.y * c, s.x), b = vec2(s.w * c, s.z), p = vec2(lo * c, la);
    vec2 pa = p - a, ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    float d = length(pa - ba * h);
    m = max(m, exp(-d * d / 6.0) * (i == 29 ? 0.4 : 1.0));
  }
  return m;
}


void main() {
  float latD = (vUv.y - 0.5) * 180.0, lonD = (vUv.x - 0.5) * 360.0;
  float la = radians(latD), lo = radians(lonD);
  vec3 n = vec3(cos(la) * sin(lo), sin(la), cos(la) * cos(lo));
  float dry = 0.0, wet = 0.0;
  for (int i = 0; i < 10; i++) dry = max(dry, region(DESERTS[i], latD, lonD));
  for (int i = 0; i < 7; i++) wet = max(wet, region(FORESTS[i], latD, lonD));
  gl_FragColor = vec4(dry, wet, mountainMask(latD, lonD), fbm(n * 5.0));
}`;

/** One-off GPU bake of static climate fields into an equirectangular texture. */
function bakeClimate(renderer) {
  const rt = new THREE.WebGLRenderTarget(2048, 1024, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false, wrapS: THREE.RepeatWrapping });
  rt.texture.wrapS = THREE.RepeatWrapping;
  const sc = new THREE.Scene();
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const mat = new THREE.ShaderMaterial({
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: climateFrag,
  });
  sc.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
  const prev = renderer.getRenderTarget();
  renderer.setRenderTarget(rt);
  renderer.render(sc, cam);
  renderer.setRenderTarget(prev);
  mat.dispose();
  return rt.texture;
}

export function createEarth(landTex, renderer) {
  const group = new THREE.Group();
  const patchTex = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  patchTex.needsUpdate = true;

  const uniforms = {
    uLand: { value: landTex },
    uClimate: { value: bakeClimate(renderer) },
    uPatch: { value: patchTex },
    uPatchBounds: { value: new THREE.Vector4(0, 0, 1, 1) },
    uPatchOn: { value: 0 },
    uSun: { value: new THREE.Vector3(1, 0, 0) },
    uCam: { value: new THREE.Vector3() },
    uTime: { value: 0 },
    uMonth: { value: 0 },
    uPointer: { value: new THREE.Vector3(0, 0, 1) },
    uPointerAmt: { value: 0 },
    uReveal: { value: 0 },
    uNightGrid: { value: 1 },
  };
  const earth = new THREE.Mesh(
    new THREE.SphereGeometry(1, 256, 192),
    new THREE.ShaderMaterial({ vertexShader: earthVert, fragmentShader: earthFrag, uniforms })
  );
  group.add(earth);

  const cloudUniforms = { uSun: uniforms.uSun, uTime: uniforms.uTime, uAmt: { value: 0.9 } };
  const clouds = new THREE.Mesh(
    new THREE.SphereGeometry(1.007, 160, 120),
    new THREE.ShaderMaterial({ vertexShader: earthVert, fragmentShader: cloudFrag, uniforms: cloudUniforms, transparent: true, depthWrite: false })
  );
  clouds.renderOrder = 2;
  group.add(clouds);

  const atmoUniforms = { uSun: uniforms.uSun, uCam: uniforms.uCam, uIntensity: { value: 0 }, uPointer: uniforms.uPointer, uPointerAmt: uniforms.uPointerAmt };
  const atmo = new THREE.Mesh(
    new THREE.SphereGeometry(1.35, 128, 96),
    new THREE.ShaderMaterial({ vertexShader: atmoVert, fragmentShader: atmoFrag, uniforms: atmoUniforms, side: THREE.BackSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  atmo.renderOrder = 3;
  group.add(atmo);

  return { group, earth, uniforms, cloudUniforms, atmoUniforms };
}

export function createStars() {
  const N = 9000;
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), size = new Float32Array(N), ph = new Float32Array(N);
  const band = new THREE.Vector3(0.3, 0.85, -0.42).normalize();
  const v = new THREE.Vector3();
  for (let i = 0; i < N; i++) {
    // Milky Way: half the stars are pulled toward a great circle
    v.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize();
    if (i % 2 === 0) {
      const d = v.dot(band);
      v.addScaledVector(band, -d * (0.85 + Math.random() * 0.15)).normalize();
    }
    v.multiplyScalar(80);
    pos.set([v.x, v.y, v.z], i * 3);
    const t = Math.random();
    const c = t < 0.15 ? [1, 0.75, 0.55] : t < 0.35 ? [0.7, 0.8, 1] : [1, 0.97, 0.93];
    const b = Math.pow(Math.random(), 3.5) * 1.4 + 0.08;
    col.set([c[0] * b, c[1] * b, c[2] * b], i * 3);
    size[i] = 0.6 + Math.pow(Math.random(), 6) * 3.2;
    ph[i] = Math.random() * 100;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('size', new THREE.BufferAttribute(size, 1));
  g.setAttribute('phase', new THREE.BufferAttribute(ph, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uFade: { value: 0 }, uDpr: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute float size; attribute float phase; attribute vec3 color;
      uniform float uTime; uniform float uDpr; varying vec3 vCol;
      void main() {
        vCol = color * (0.75 + 0.25 * sin(uTime * (0.6 + fract(phase) * 2.0) + phase));
        gl_PointSize = size * uDpr;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uFade; varying vec3 vCol;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = exp(-d * d * 4.0);
        gl_FragColor = vec4(vCol * a * uFade, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(g, mat);
  pts.renderOrder = -1;
  return pts;
}

export function createSunGlare() {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uFade: { value: 0 } },
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);} `,
    fragmentShader: /* glsl */ `
      uniform float uFade; varying vec2 vUv;
      void main(){
        vec2 p = (vUv - 0.5) * 2.0; float r = length(p);
        float core = exp(-r * r * 90.0) * 6.0;
        float halo = exp(-r * 5.5) * 0.35;
        float spikes = (exp(-abs(p.y) * 160.0) + exp(-abs(p.x) * 160.0)) * exp(-r * 3.5) * 0.6;
        vec3 c = vec3(1.0, 0.9, 0.75) * (core + halo + spikes);
        gl_FragColor = vec4(c * uFade, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), mat);
  return m;
}

export { PI };
