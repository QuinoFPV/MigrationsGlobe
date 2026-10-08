import * as THREE from 'three';
import { SPECIES } from './data.js';
import { buildGlobalMask, buildPatch, loadLand10m } from './landmask.js';
import { createEarth, createStars, createSunGlare } from './earth.js';
import { CLASSES } from './species.js';
import { PointCloud, Ribbon } from './gfx.js';
import { createPost } from './post.js';
import { Hud } from './hud.js';
import { DEG, latLonToVec, vecToLatLon, fmtLat, fmtLon, clamp, lerp, smooth, fract } from './geo.js';

/* ───────────── renderer & scene ───────────── */
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.setClearColor(0x010205, 1);
let dpr = Math.min(devicePixelRatio, 1.5);
renderer.setPixelRatio(dpr);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.004, 300);
const globe = new THREE.Group();
scene.add(globe);

const landTex = buildGlobalMask(4096);
const E = createEarth(landTex, renderer);
globe.add(E.group);
const stars = createStars();
scene.add(stars);
const glare = createSunGlare();
scene.add(glare);

const migs = SPECIES.map((sp) => {
  const m = new CLASSES[sp.id](sp);
  globe.add(m.group);
  return m;
});
const byId = Object.fromEntries(migs.map((m) => [m.sp.id, m]));

const post = createPost(renderer, scene, camera);

/* high-res terrain patches for the close-ups, built lazily */
const PATCH_BOUNDS = { wildebeest: [31.2, -4.6, 38.4, 0.9], caribou: [-156, 63.2, -128, 71.8], bear: [-97.5, 54.5, -78, 64.5], crab: [105.45, -10.66, 105.84, -10.33] };
const HIRES = { crab: true }; // tiny islands need the 1:10m coastline
const patches = {};
function ensurePatch(id) {
  if (!PATCH_BOUNDS[id]) return null;
  if (!patches[id]) {
    if (HIRES[id]) {
      patches[id] = 'loading';
      loadLand10m().then((geo) => {
        patches[id] = buildPatch(PATCH_BOUNDS[id], 2048, geo);
        byId[id]?.setCoast?.(patches[id].isLand);
        if (S.focusId === id) { E.uniforms.uPatch.value = patches[id]; E.uniforms.uPatchBounds.value.set(...PATCH_BOUNDS[id]); S.patchId = id; }
      });
      return null;
    }
    patches[id] = buildPatch(PATCH_BOUNDS[id], 2048);
  }
  return patches[id] === 'loading' ? null : patches[id];
}

/* ───────────── state ───────────── */
const now0 = new Date();
const startT = now0.getUTCMonth() + (now0.getUTCDate() - 1) / 31;
const S = {
  t: startT, playing: true, rate: 1 / 6, warp: 0, warping: false,
  focusId: null, hoverId: null, reveal: 0, started: false, time: 0,
  sunLon: -20, cloudAmt: 0.85, patchOn: 0, patchId: null, focusMix: 0,
  scrubbing: false, lastInteract: 0,
};
const cam = { yaw: 52 * DEG, pitch: 18 * DEG, alt: 9, k: 0, tilt: 0, fov: 30, offX: 0 };
const vel = { yaw: 0, pitch: 0 };
const breathe = { x: 0, y: 0 };
let anim = null;
let W = innerWidth, H = innerHeight;

function fitAlt() {
  const fov = 30 * DEG;
  const rho = W < H ? Math.min(0.86, (W / H) * 0.86) : 0.74; // globe radius as fraction of half-height
  return Math.sqrt(1 + 1 / Math.pow(rho * Math.tan(fov / 2), 2));
}
const overviewPose = () => ({ yaw: cam.yaw, pitch: 16 * DEG, alt: fitAlt(), k: 0, tilt: 0, fov: 30, offX: 0 });
const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const easeIO3 = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const easeIO4 = (x) => (x < 0.5 ? 8 * x ** 4 : 1 - Math.pow(-2 * x + 2, 4) / 2);

function moveTo(to, dur = 3.2, bump = 0.22) {
  to = { ...to, yaw: cam.yaw + wrapPi(to.yaw - cam.yaw) };
  // big changes of scale (orbit → a 19 km island) get more time so the eye can follow the dive
  const ratio = Math.max(cam.alt, to.alt) / Math.max(1e-4, Math.min(cam.alt, to.alt));
  dur += Math.max(0, Math.log(ratio) - 3) * 0.8;
  anim = { from: { ...cam }, to, t0: S.time, dur, bump };
  vel.yaw = vel.pitch = 0;
}

/* ───────────── app API (used by HUD) ───────────── */
const app = {
  select(id) {
    if (!S.started) return;
    const sp = SPECIES.find((s) => s.id === id);
    if (!sp) return;
    if (S.focusId === id) return;
    const wasFocused = !!S.focusId;
    S.focusId = id;
    document.body.classList.add('focused');
    hud.enterFocus(sp);
    const f = sp.focus;
    const mobile = W < 820;
    moveTo({ yaw: -f.lon * DEG, pitch: f.lat * DEG, alt: f.alt * (mobile ? 1.35 : 1), k: f.k, tilt: f.tilt * DEG, fov: f.fov, offX: mobile ? 0 : 0.15 }, wasFocused ? 3.4 : 3.2, wasFocused ? 0.5 : 0.22);
    const p = ensurePatch(id);
    if (p) { E.uniforms.uPatch.value = p; E.uniforms.uPatchBounds.value.set(...PATCH_BOUNDS[id]); S.patchId = id; }
    else S.patchId = null;
  },
  deselect() {
    if (!S.focusId) return;
    S.focusId = null;
    document.body.classList.remove('focused');
    hud.leaveFocus();
    moveTo(overviewPose(), 2.8, 0.12);
  },
  step(d) {
    const i = SPECIES.findIndex((s) => s.id === S.focusId);
    app.select(SPECIES[(i + d + SPECIES.length) % SPECIES.length].id);
  },
  setHover(id) { S.hoverId = id; },
  togglePlay() { S.playing = !S.playing; },
};
const hud = new Hud(app);
migs.forEach((m) => {
  m.sample = () => {
    const c = m.clouds.find((c) => c.N > 200) || m.clouds[0];
    const i = Math.floor(Math.random() * c.N);
    return new THREE.Vector3(c.pos[i * 3], c.pos[i * 3 + 1], c.pos[i * 3 + 2]);
  };
});

/* ───────────── resize ───────────── */
function resize() {
  W = innerWidth; H = innerHeight;
  renderer.setPixelRatio(dpr);
  renderer.setSize(W, H, false);
  post.composer.setPixelRatio(dpr);
  post.composer.setSize(W, H);
  post.u.uRes.value.set(W * dpr, H * dpr);
  post.bloom.resolution.set(W / 2, H / 2);
  camera.aspect = W / H;
  Ribbon.res.value.set(W * dpr, H * dpr);
  PointCloud.dpr.value = dpr;
  stars.material.uniforms.uDpr.value = dpr;
  hud.resize(W, H);
  if (!anim && !S.focusId && S.started) cam.alt = fitAlt();
}
addEventListener('resize', resize);
resize();

/* ───────────── pointer: grab, spin, breathe, hold-to-time-lapse ───────────── */
const ndc = new THREE.Vector2(0, 0);
const ray = new THREE.Raycaster();
const sphere = new THREE.Sphere(new THREE.Vector3(), 1);
const hitW = new THREE.Vector3();
let ptr = null;
const cursorEl = document.getElementById('cursor-read');
const warpEl = document.getElementById('warp');

function pointerOnGlobe(x, y) {
  ndc.set((x / W) * 2 - 1, -(y / H) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  return ray.ray.intersectSphere(sphere, hitW);
}
canvas.addEventListener('pointerdown', (e) => {
  if (!S.started) return;
  canvas.setPointerCapture(e.pointerId);
  S.lastInteract = S.time;
  if (hud.hitRing(e.clientX, e.clientY)) {
    ptr = { mode: 'scrub', x: e.clientX, y: e.clientY };
    S.scrubbing = true;
    canvas.classList.add('scrub');
    return;
  }
  ptr = { mode: 'pending', x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: S.time, lt: performance.now() };
  vel.yaw = vel.pitch = 0;
});
canvas.addEventListener('pointermove', (e) => {
  const x = e.clientX, y = e.clientY;
  S.mx = x; S.my = y;
  S.pointerNdc = [(x / W) * 2 - 1, -(y / H) * 2 + 1];
  if (!ptr) {
    canvas.classList.toggle('scrub', S.started && hud.hitRing(x, y));
    return;
  }
  S.lastInteract = S.time;
  const dx = x - ptr.x, dy = y - ptr.y;
  if (ptr.mode === 'scrub') {
    S.t = (S.t - dx / hud.pxPerMonth() + 12) % 12;
    ptr.x = x; ptr.y = y;
    return;
  }
  if (ptr.mode === 'pending' && Math.hypot(x - ptr.x0, y - ptr.y0) > 6) {
    ptr.mode = 'drag';
    canvas.classList.add('dragging');
    if (anim) anim = null;
  }
  if (ptr.mode === 'drag') {
    const nowT = performance.now();
    const dtp = Math.max(8, nowT - ptr.lt) / 1000;
    const surf = Math.max(0.05, camera.position.length() - 1);
    const k = 0.0042 * clamp(surf / 3.2, 0.03, 1.2) * (30 / cam.fov) ** 0;
    cam.yaw += dx * k;
    cam.pitch = clamp(cam.pitch + dy * k, -1.25, 1.25);
    vel.yaw = clamp(lerp(vel.yaw, (dx * k) / dtp, 0.5), -3, 3);
    vel.pitch = clamp(lerp(vel.pitch, (dy * k) / dtp, 0.5), -2, 2);
    ptr.x = x; ptr.y = y; ptr.lt = nowT;
  }
});
function endPointer() {
  if (!ptr) return;
  if (ptr.mode === 'scrub') S.scrubbing = false;
  if (ptr.mode === 'drag' && performance.now() - ptr.lt > 90) vel.yaw = vel.pitch = 0; // held still before letting go
  if (ptr.mode === 'pending' && performance.now() - ptr.lt < 1000 && !S.warping) {
    // a plain click on a route head selects it
    const hit = nearestBeacon(ptr.x0, ptr.y0);
    if (hit) app.select(hit);
  }
  ptr = null;
  S.warping = false;
  canvas.classList.remove('dragging', 'scrub');
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('pointerleave', () => { S.pointerNdc = null; });
canvas.addEventListener('wheel', (e) => {
  if (!S.started) return;
  e.preventDefault();
  S.lastInteract = S.time;
  if (hud.hitRing(e.clientX, e.clientY) || e.shiftKey) {
    S.t = (S.t + (e.deltaY + e.deltaX) * 0.004 + 12) % 12;
    return;
  }
  if (anim) return;
  const base = S.focusId ? SPECIES.find((s) => s.id === S.focusId).focus.alt : fitAlt();
  // in a close-up you can always pull back far enough to see the surroundings
  const maxAlt = S.focusId ? Math.max(base * 2.6, 1.4) : base * 1.5;
  cam.alt = clamp(cam.alt * Math.exp(e.deltaY * 0.0012), base * (S.focusId ? 0.55 : 0.62), maxAlt);
}, { passive: false });

function nearestBeacon(x, y) {
  let best = null, bd = 40;
  migs.forEach((m) => {
    const p = project(m.head);
    if (p.facing <= 0) return;
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < bd) { bd = d; best = m.sp.id; }
  });
  return best;
}

addEventListener('keydown', (e) => {
  if (!S.started) { start(); return; }
  if (e.key === 'Escape') app.deselect();
  else if (e.key === ' ') { e.preventDefault(); app.togglePlay(); }
  else if (e.key === 'ArrowRight') { S.monthTarget = Math.floor(S.t) + 1; }
  else if (e.key === 'ArrowLeft') { S.monthTarget = Math.ceil(S.t) - 1; }
  else if (/^[0-9]$/.test(e.key)) { const i = e.key === '0' ? 9 : +e.key - 1; if (SPECIES[i]) app.select(SPECIES[i].id); }
  else if (e.key === 'Tab' && S.focusId) { e.preventDefault(); app.step(e.shiftKey ? -1 : 1); }
});

/* ───────────── projection helper ───────────── */
const _pw = new THREE.Vector3(), _pn = new THREE.Vector3(), _pc = new THREE.Vector3();
function project(local) {
  _pw.copy(local).applyMatrix4(globe.matrixWorld);
  _pn.copy(_pw).normalize();
  _pc.copy(camera.position).sub(_pw).normalize();
  const facing = _pn.dot(_pc);
  _pw.project(camera);
  if (!isFinite(_pw.x) || !isFinite(_pw.y)) return { x: -9999, y: -9999, facing: -1, z: 1 };
  return { x: (_pw.x + 1) * 0.5 * W, y: (1 - _pw.y) * 0.5 * H, facing, z: _pw.z };
}

/* ───────────── intro ───────────── */
const introEl = document.getElementById('intro');
{
  const t = document.getElementById('intro-title');
  const words = ['The', 'Great', 'Migrations'];
  let i = 0;
  t.innerHTML = words.map((w, wi) => `<span style="white-space:nowrap;display:inline-block${wi === 2 ? ';font-style:italic' : ''}">${[...w].map((c) => `<span class="ch" style="--i:${i++}">${c}</span>`).join('')}</span>`).join('<span class="sp"></span>');
}
function start() {
  if (S.started) return;
  S.started = true;
  S.startTime = S.time;
  introEl.classList.add('gone');
  moveTo(overviewPose(), 5.2, 0.0);
  setTimeout(() => document.body.classList.add('ready'), 2600);
  // pre-build terrain patches when idle
  const idle = window.requestIdleCallback || ((f) => setTimeout(f, 1200));
  idle(() => ensurePatch('wildebeest'));
  idle(() => ensurePatch('caribou'));
}
introEl.addEventListener('click', start);
setTimeout(start, 9000);

/* ───────────── loop ───────────── */
const clock = new THREE.Clock();
let fpsAcc = 0, fpsN = 0, fpsChecked = 0;
const sunLocal = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const eul = new THREE.Euler(0, 0, 0, 'XYZ');

function frame(forced) {
  const dt = typeof forced === 'number' ? forced : Math.min(0.05, clock.getDelta());
  S.time += dt;
  const time = S.time;

  // adaptive resolution after the intro settles
  if (S.started && time - S.startTime > 6 && fpsChecked < 3 && document.visibilityState === 'visible') {
    fpsAcc += dt; fpsN++;
    if (fpsAcc > 2) {
      const fps = fpsN / fpsAcc;
      fpsAcc = 0; fpsN = 0; fpsChecked++;
      if (fps < 48 && dpr > 1) { dpr = Math.max(1, dpr - 0.375); resize(); }
    }
  }

  // ---- time ----
  if (ptr && ptr.mode === 'pending' && performance.now() - ptr.lt > 380) S.warping = true;
  S.warp = lerp(S.warp, S.warping ? 1 : 0, 1 - Math.exp(-dt * (S.warping ? 2.2 : 4)));
  if (S.monthTarget != null) {
    const d = S.monthTarget - S.t;
    S.t += d * (1 - Math.exp(-dt * 6));
    if (Math.abs(d) < 0.002) { S.t = S.monthTarget; S.monthTarget = null; }
  } else if (!S.scrubbing && (S.playing || S.warp > 0.01)) {
    S.t += dt * S.rate * ((S.playing ? 1 : 0) + S.warp * 18);
  }
  S.t = ((S.t % 12) + 12) % 12;
  if (S.monthTarget != null) S.monthTarget = S.monthTarget; // keep unwrapped target
  const t = S.t;

  // ---- reveal ----
  const since = S.started ? time - S.startTime : 0;
  S.reveal = S.started ? smooth(clamp((since - 0.4) / 2.6)) : 0;
  const routeReveal = S.started ? clamp((since - 1.6) / 2.8) : 0;
  S.focusMix = lerp(S.focusMix, S.focusId ? 1 : 0, 1 - Math.exp(-dt * 1.6));

  // ---- camera director ----
  if (anim) {
    const p = clamp((time - anim.t0) / anim.dur);
    const a = anim.from, b = anim.to;
    const e1 = easeIO3(clamp(p / 0.82));
    const e2 = easeIO3(clamp((p - 0.04) / 0.96));
    const e3 = easeIO3(clamp((p - 0.3) / 0.7));
    cam.yaw = lerp(a.yaw, b.yaw, e1);
    cam.pitch = lerp(a.pitch, b.pitch, e1);
    // zoom evenly in log space; skip the pull-back bump for very deep dives
    const deep = clamp(Math.log(Math.max(a.alt, b.alt) / Math.min(a.alt, b.alt)) / 4 - 0.5);
    cam.alt = Math.exp(lerp(Math.log(a.alt), Math.log(b.alt), e2)) * (1 + anim.bump * (1 - deep) * Math.sin(Math.PI * p));
    cam.k = lerp(a.k, b.k, e3);
    cam.tilt = lerp(a.tilt, b.tilt, e3);
    cam.fov = lerp(a.fov, b.fov, e2) + Math.sin(Math.PI * p) * 3.5;
    cam.offX = lerp(a.offX, b.offX, e3);
    S.moveP = p;
    if (p >= 1) anim = null;
  } else {
    S.moveP = 1;
    if (!ptr || ptr.mode !== 'drag') {
      cam.yaw += vel.yaw * dt;
      cam.pitch = clamp(cam.pitch + vel.pitch * dt, -1.25, 1.25);
      const damp = Math.exp(-dt * 1.6);
      vel.yaw *= damp; vel.pitch *= damp;
      // idle drift in overview
      if (!S.focusId && S.started && time - S.lastInteract > 4) vel.yaw = lerp(vel.yaw, 0.035, 1 - Math.exp(-dt * 0.4));
      if (!S.focusId && S.started && time - S.lastInteract > 6) cam.pitch = lerp(cam.pitch, 16 * DEG, 1 - Math.exp(-dt * 0.15));
    }
    if (!S.started) cam.yaw += dt * 0.02;
  }

  // breathing: the globe leans toward the pointer even when untouched
  const pn = S.pointerNdc || [0, 0];
  // the globe leans and breathes in proportion to how far away we are, so close-ups stay steady
  const surfDist = Math.max(0.0005, camera.position.length() - 1);
  const fxScale = clamp(surfDist / 2.5, 0.01, 1);
  const lean = (S.focusId ? 0.012 : 0.06) * fxScale;
  breathe.x = lerp(breathe.x, pn[0] * lean, 1 - Math.exp(-dt * 1.8));
  breathe.y = lerp(breathe.y, -pn[1] * lean * 0.7, 1 - Math.exp(-dt * 1.8));
  eul.set(cam.pitch + breathe.y + Math.sin(time * 0.31) * 0.004 * fxScale, cam.yaw + breathe.x, 0);
  globe.quaternion.setFromEuler(eul);
  globe.scale.setScalar(1 + Math.sin(time * 0.75) * 0.0035 * (1 - S.focusMix));
  globe.updateMatrixWorld(true);

  const tilt = cam.tilt;
  const target = new THREE.Vector3(0, 0, cam.k);
  camera.position.set(0, -Math.sin(tilt), Math.cos(tilt)).multiplyScalar(cam.alt).add(target);
  camera.up.set(0, 1, 0);
  camera.lookAt(target);
  camera.fov = cam.fov;
  camera.near = clamp((camera.position.length() - 1) * 0.08, 0.0003, 0.2);
  if (cam.offX > 0.001) camera.setViewOffset(W, H, cam.offX * W, 0, W, H); else camera.clearViewOffset();
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();

  // ---- the sun: seasons + a "director's sun" that side-lights the subject ----
  const doy = (t / 12) * 365;
  const decl = 23.44 * Math.sin((2 * Math.PI * (doy - 80)) / 365);
  const viewLon = -(cam.yaw) / DEG;
  let sunTarget;
  if (S.focusId) sunTarget = byId[S.focusId].sp.focus.lon + (byId[S.focusId].sp.focus.sun || 58);
  else sunTarget = viewLon + 62 + Math.sin(time * 0.045) * 30;
  if (!S.started) sunTarget = viewLon + 160;
  const sunLag = S.started && since < 5 ? 0.9 : S.focusId ? 0.7 : 0.18;
  S.sunLon += wrapPi((sunTarget - S.sunLon) * DEG) / DEG * (1 - Math.exp(-dt * sunLag));
  latLonToVec(decl, S.sunLon, 1, sunLocal);

  // ---- earth uniforms ----
  const U = E.uniforms;
  U.uSun.value.copy(sunLocal);
  U.uCam.value.copy(globe.worldToLocal(camera.position.clone()));
  U.uTime.value = time;
  U.uMonth.value = t;
  U.uReveal.value = S.started ? 0.04 + 0.96 * S.reveal : 0.04;
  const cloudTarget = S.focusId ? ({ whale: 0.35, tern: 0.45, wildebeest: 0.1, monarch: 0.3, caribou: 0.12, swallow: 0.3, tuna: 0.3, buzzard: 0.32, martin: 0.3, egret: 0.28, starling: 0.25, eel: 0.4, blackbird: 0.3, bear: 0.2, crab: 0.12 }[S.focusId] ?? 0.3) : 0.85;
  S.cloudAmt = lerp(S.cloudAmt, cloudTarget, 1 - Math.exp(-dt * 1.2));
  E.cloudUniforms.uAmt.value = S.cloudAmt * (0.3 + 0.7 * S.reveal);
  E.atmoUniforms.uIntensity.value = (S.started ? 0.25 + 0.75 * S.reveal : 0.25) * (1 + Math.sin(time * 0.8) * 0.06);
  S.patchOn = lerp(S.patchOn, S.patchId && S.focusId === S.patchId ? 1 : 0, 1 - Math.exp(-dt * 2));
  U.uPatchOn.value = S.patchOn;

  // pointer reticle on the surface
  let pAmt = 0;
  if (S.pointerNdc && S.started && (!ptr || ptr.mode !== 'scrub')) {
    const hit = pointerOnGlobe(S.mx, S.my);
    if (hit) {
      const local = globe.worldToLocal(hitW.clone()).normalize();
      // ease toward the hit point; if the halfway point collapses (jump to the far side) or
      // anything went non-finite, snap instead of normalising a zero vector into NaN
      const P = U.uPointer.value;
      P.lerp(local, 0.5);
      if (P.lengthSq() < 1e-6 || !Number.isFinite(P.x + P.y + P.z)) P.copy(local); else P.normalize();
      pAmt = 1;
      const ll = vecToLatLon(local);
      const dayside = local.dot(sunLocal) > 0;
      cursorEl.textContent = `${fmtLat(ll.lat)}  ${fmtLon(ll.lon)}  ${dayside ? '☀' : '☾'}`;
      cursorEl.style.transform = `translate(${S.mx + 18}px, ${S.my + 14}px)`;
    }
  }
  U.uPointerScale.value = clamp((camera.position.length() - 1) / 3.6, 0.003, 1);
  U.uPointerAmt.value = lerp(U.uPointerAmt.value, pAmt * (ptr && ptr.mode === 'drag' ? 0.5 : 1), 1 - Math.exp(-dt * 6));
  cursorEl.classList.toggle('on', pAmt > 0 && !S.warping);
  warpEl.classList.toggle('on', S.warp > 0.05);
  if (S.warp > 0.05 && S.mx != null) {
    warpEl.style.transform = `translate(${S.mx - 20}px, ${S.my - 20}px)`;
    warpEl.style.setProperty('--p', S.warp.toFixed(3));
    warpEl.querySelector('span').textContent = `Time-lapse ×${Math.round(1 + S.warp * 18)}`;
  }

  // ---- stars & glare ----
  stars.material.uniforms.uTime.value = time;
  stars.material.uniforms.uFade.value = S.started ? 0.5 + 0.5 * smooth(clamp(since / 2)) : clamp(time / 2) * 0.5;
  stars.rotation.y = cam.yaw * 0.06; stars.rotation.x = cam.pitch * 0.04;
  const sunW = sunLocal.clone().applyQuaternion(globe.quaternion);
  glare.position.copy(sunW).multiplyScalar(120);
  glare.lookAt(camera.position);
  glare.material.uniforms.uFade.value = S.reveal;

  // ---- species ----
  PointCloud.scale.value = (H * dpr) / (2 * Math.tan((camera.fov * DEG) / 2));
  Ribbon.time.value = time;
  migs.forEach((m, i) => {
    const sel = S.focusId === m.sp.id;
    m.hiS = lerp(m.hiS || 0, (S.hoverId === m.sp.id ? 1 : 0), 1 - Math.exp(-dt * 6));
    const stagger = clamp(routeReveal * 1.6 - (i / Math.max(1, migs.length - 1)) * 0.6); // staggered reveal, always reaches 1
    const camDist = camera.position.distanceTo(_pw.copy(m.head).applyMatrix4(globe.matrixWorld));
    m.update({ t, dt, time, camDist, sun: sunLocal, focus: sel ? S.focusMix : 0, dim: S.focusId && !sel ? S.focusMix : 0, reveal: stagger, hi: m.hiS });
  });

  // ---- HUD ----
  const gC = project(new THREE.Vector3(0, 0, 0));
  const d = camera.position.length();
  const gR = (Math.tan(Math.asin(Math.min(0.9999, 1 / d))) / Math.tan((camera.fov * DEG) / 2)) * (H / 2);
  hud.update({
    t, dt, time, reveal: S.reveal, focusMix: S.focusMix, focusId: S.focusId, hoverId: S.hoverId,
    migs, project, globe: { x: gC.x, y: gC.y, r: gR }, decl, sunLon: S.sunLon, playing: S.playing, scrubbing: S.scrubbing || S.monthTarget != null, warp: S.warp,
  });

  // ---- post ----
  const fu = post.u;
  let fx = gC.x / W, fy = 1 - gC.y / H, fr = 0.46, blur = 0.28;
  if (S.focusId) {
    const hp = project(byId[S.focusId].head);
    fx = lerp(fx, hp.x / W, S.focusMix); fy = lerp(fy, 1 - hp.y / H, S.focusMix);
    fr = lerp(fr, 0.3, S.focusMix); blur = lerp(blur, 0.4, S.focusMix);
  }
  const rack = anim ? Math.sin(Math.PI * clamp((time - anim.t0) / anim.dur)) : 0;
  fu.uFocus.value.lerp(new THREE.Vector2(fx, fy), 1 - Math.exp(-dt * 5));
  fu.uFocusR.value = lerp(fu.uFocusR.value, fr * (1 - rack * 0.5), 1 - Math.exp(-dt * 4));
  fu.uBlur.value = lerp(fu.uBlur.value, blur + rack * 0.55, 1 - Math.exp(-dt * 4));
  fu.uWarp.value = S.warp;
  fu.uTime.value = time;
  fu.uFade.value = S.started ? clamp(0.35 + since * 0.6) : clamp(time * 0.3) * 0.35;
  post.bloom.strength = 0.95 + S.warp * 0.5;

  post.composer.render(dt);
}
function tick() { frame(); requestAnimationFrame(tick); }
requestAnimationFrame(tick);

// expose for the curious who open dev tools
window.__migrations = { S, cam, migs, app, scene, camera, renderer, post, E, start, step: (sec = 1, fps = 30) => { for (let i = 0; i < sec * fps; i++) frame(1 / fps); } };
console.log('%cThe Great Migrations', 'font: italic 24px serif; color:#cfe4ff', '\nwindow.__migrations exposes the live state. Try __migrations.app.select("tern").');
