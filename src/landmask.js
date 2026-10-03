import * as THREE from 'three';
import { geoEquirectangular, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import land50 from 'world-atlas/land-50m.json';

// Lakes & rivers that matter for the routes (world-atlas land has none).
const LAKES = [
  // Victoria
  [[31.6, -1.0], [31.8, -0.2], [32.4, 0.2], [33.0, 0.35], [33.6, 0.25], [34.1, 0.0], [34.75, -0.2], [34.3, -0.4], [34.0, -0.9], [33.9, -1.6], [33.65, -2.1], [33.9, -2.35], [33.1, -2.4], [32.9, -2.65], [32.2, -2.6], [31.75, -2.3], [31.65, -1.6]],
  // Great Lakes
  [[-92.1, 46.7], [-90.5, 46.6], [-88.4, 47.3], [-87.0, 46.5], [-84.6, 46.5], [-84.8, 47.6], [-86.0, 48.7], [-88.3, 48.8], [-89.5, 48.0], [-90.8, 47.6]],
  [[-87.9, 41.7], [-87.8, 43.0], [-87.6, 44.5], [-86.9, 45.6], [-85.4, 45.8], [-85.6, 44.9], [-86.3, 44.0], [-86.4, 42.9], [-87.0, 41.8]],
  [[-84.5, 45.9], [-83.5, 46.2], [-81.6, 46.0], [-80.6, 45.8], [-80.0, 44.7], [-81.4, 44.3], [-81.7, 43.3], [-82.4, 43.0], [-82.6, 43.9], [-83.4, 44.0], [-83.3, 45.0]],
  [[-83.4, 41.7], [-82.4, 41.5], [-81.0, 41.9], [-79.0, 42.8], [-79.8, 42.9], [-81.5, 42.6], [-82.7, 42.0]],
  [[-79.8, 43.3], [-78.0, 43.4], [-76.3, 43.5], [-76.2, 44.2], [-77.5, 44.1], [-79.4, 43.7]],
  // Great Bear & Great Slave (northern texture)
  [[-125.2, 65.2], [-123.5, 66.6], [-120.5, 66.3], [-118.3, 65.8], [-121.0, 64.9], [-123.4, 64.8]],
  [[-117.0, 61.2], [-114.0, 62.4], [-111.0, 62.8], [-112.5, 61.8], [-115.5, 61.0]],
];
const RIVERS = [
  { w: 0.012, pts: [[35.55, -0.75], [35.3, -1.1], [35.1, -1.35], [34.98, -1.5], [34.85, -1.58], [34.6, -1.55], [34.3, -1.5], [34.0, -1.52], [33.85, -1.5]] }, // Mara
  { w: 0.008, pts: [[34.75, -2.05], [34.45, -2.15], [34.15, -2.2], [33.85, -2.15]] }, // Grumeti
  { w: 0.03, pts: [[-139.4, 67.6], [-140.6, 67.2], [-142.4, 67.0], [-144.6, 66.9], [-146.0, 66.6]] }, // Porcupine
  { w: 0.08, pts: [[-90.1, 47.0], [-91.2, 43.6], [-90.4, 38.9], [-89.6, 36.5], [-91.1, 33.0], [-91.2, 30.8], [-89.6, 29.3]] }, // Mississippi
];

const landGeo = feature(land50, land50.objects.land);

function drawWorld(ctx, path, project, lineScale) {
  ctx.fillStyle = '#fff';
  ctx.beginPath(); path(landGeo); ctx.fill();
  ctx.fillStyle = '#000';
  for (const lake of LAKES) {
    // smooth closed curve through the waypoints
    const P = lake.map(project), n = P.length;
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    ctx.beginPath();
    let m0 = mid(P[n - 1], P[0]);
    ctx.moveTo(m0[0], m0[1]);
    for (let i = 0; i < n; i++) {
      const m = mid(P[i], P[(i + 1) % n]);
      ctx.quadraticCurveTo(P[i][0], P[i][1], m[0], m[1]);
    }
    ctx.closePath(); ctx.fill();
  }
  ctx.strokeStyle = '#000'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const r of RIVERS) {
    ctx.lineWidth = Math.max(0.6, r.w * lineScale);
    ctx.beginPath();
    r.pts.forEach((p, i) => { const [x, y] = project(p); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.stroke();
  }
}

function channelCanvas(src, blur) {
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
  if (blur) g.filter = `blur(${blur}px)`;
  g.drawImage(src, 0, 0);
  return g.getImageData(0, 0, c.width, c.height).data;
}

function pack(W, H, chans) {
  const out = new Uint8Array(W * H * 4);
  const [r, g, b] = chans;
  for (let i = 0, n = W * H; i < n; i++) {
    out[i * 4] = r[i * 4];
    out[i * 4 + 1] = g ? g[i * 4] : 0;
    out[i * 4 + 2] = b ? b[i * 4] : 0;
    out[i * 4 + 3] = 255;
  }
  return out;
}

function makeTex(data, W, H) {
  const t = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
  t.flipY = false; // we build rows south→north below
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.wrapS = THREE.RepeatWrapping;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

function flipRows(data, W, H) {
  const row = W * 4, out = new Uint8Array(data.length);
  for (let y = 0; y < H; y++) out.set(data.subarray(y * row, (y + 1) * row), (H - 1 - y) * row);
  return out;
}

/** Global equirectangular land field: R sharp, G coastal shelf, B continentality. */
export function buildGlobalMask(W = 4096) {
  const H = W / 2;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  const proj = geoEquirectangular().scale(W / (2 * Math.PI)).translate([W / 2, H / 2]).precision(0.1);
  drawWorld(ctx, geoPath(proj, ctx), proj, W / 360);
  const data = pack(W, H, [channelCanvas(cv, 0), channelCanvas(cv, W / 700), channelCanvas(cv, W / 90)]);
  return makeTex(flipRows(data, W, H), W, H);
}

/** High-res regional patch for close-ups. bounds = [lonMin, latMin, lonMax, latMax]. */
export function buildPatch(bounds, W = 2048) {
  const [x0, y0, x1, y1] = bounds;
  const midLat = ((y0 + y1) / 2) * Math.PI / 180;
  const lonSpan = x1 - x0, latSpan = y1 - y0;
  const H = Math.min(2048, Math.round(W * latSpan / (lonSpan * Math.cos(midLat))));
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  const s = W / (lonSpan * Math.PI / 180);
  const proj = geoEquirectangular().scale(s).translate([-s * x0 * Math.PI / 180, s * y1 * Math.PI / 180]).precision(0.05);
  const rawH = s * latSpan * Math.PI / 180;
  ctx.save();
  ctx.scale(1, H / rawH);
  drawWorld(ctx, geoPath(proj, ctx), proj, W / lonSpan);
  ctx.restore();
  const data = pack(W, H, [channelCanvas(cv, 0), channelCanvas(cv, 4)]);
  const tex = makeTex(flipRows(data, W, H), W, H);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  return tex;
}
