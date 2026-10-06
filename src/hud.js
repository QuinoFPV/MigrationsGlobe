import * as THREE from 'three';
import { SPECIES, MONTHS, MON3, STATUS_SCALE, STATUS_NAME, conditionsAt, phaseAt } from './data.js';
import { vecToLatLon, fmtLat, fmtLon, clamp, lerp, smooth, fract, latLonToVec } from './geo.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const $ = (id) => document.getElementById(id);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const sv = (tag, attrs = {}, parent) => { const e = document.createElementNS(SVGNS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; };
const TAU = Math.PI * 2;
const nf = new Intl.NumberFormat('en-US');
const easeOutExpo = (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x));

function splitChars(node, text) {
  node.innerHTML = '';
  let i = 0;
  for (const word of text.split(' ')) {
    if (i) node.appendChild(el('span', 'sp'));
    const w = el('span', 'w'); w.style.whiteSpace = 'nowrap'; w.style.display = 'inline-block';
    for (const c of word) { const s = el('span', 'ch', c); s.style.setProperty('--i', i++); w.appendChild(s); }
    node.appendChild(w);
  }
}

export class Hud {
  constructor(app) {
    this.app = app;
    this.W = innerWidth; this.H = innerHeight;
    this.ring = { cx: 0, cy: 0, R: 300, phi: 1.3, f: 1400 };
    this.focusMix = 0;
    this.throttle = 0;
    this.lastMonth = -1;
    this.pings = [];
    this.tickerItems = [];
    this.tickerScroll = 0;
    this.routeScroll = 0;
    this.buildIndex();
    this.buildLabels();
    this.buildRing();
    this.buildCallouts();
    this.bindButtons();
  }

  /* ───────────── construction ───────────── */
  buildIndex() {
    const nav = $('index');
    this.idx = SPECIES.map((sp, i) => {
      const b = el('button', 'idx-item');
      b.style.setProperty('--i', i); b.style.setProperty('--c', sp.css);
      b.innerHTML = `<span class="idx-num">${sp.index}</span><span class="idx-name">${sp.name}</span>
        <span class="idx-meta"><span class="idx-bar"><i></i><b></b></span><span class="idx-phase"></span></span>`;
      b.addEventListener('mouseenter', () => this.app.setHover(sp.id));
      b.addEventListener('mouseleave', () => this.app.setHover(null));
      b.addEventListener('click', () => this.app.select(sp.id));
      nav.appendChild(b);
      return { b, bar: b.querySelector('.idx-bar i'), dot: b.querySelector('.idx-bar b'), phase: b.querySelector('.idx-phase') };
    });
  }
  buildLabels() {
    const wrap = $('labels'), beac = $('beacons');
    this.labels = SPECIES.map((sp) => {
      const l = el('div', 'label');
      l.style.setProperty('--c', sp.css);
      l.innerHTML = `<div class="l-num">${sp.index}</div><div class="l-name">${sp.name}</div><div class="l-meta"></div>`;
      l.addEventListener('mouseenter', () => this.app.setHover(sp.id));
      l.addEventListener('mouseleave', () => this.app.setHover(null));
      l.addEventListener('click', () => this.app.select(sp.id));
      wrap.appendChild(l);
      const g = sv('g', { style: `color:${sp.css}` }, beac);
      const ring = sv('circle', { class: 'beacon-ring', r: 6 }, g);
      const ring2 = sv('circle', { class: 'beacon-ring', r: 6 }, g);
      const core = sv('circle', { class: 'beacon-core', r: 2.2 }, g);
      const lead = sv('path', { class: 'leader' }, g);
      return { sp, l, g, ring, ring2, core, lead, meta: l.querySelector('.l-meta'), x: 0, y: 0, a: 0 };
    });
  }
  buildRing() {
    const back = $('ring-back'), front = $('ring-front');
    this.rb = {
      line: sv('path', { class: 'ring-line', opacity: 0.16 }, back),
      line2: sv('path', { class: 'ring-line', opacity: 0.07 }, back),
      ticks: sv('path', { class: 'ring-tick', opacity: 0.12 }, back),
      bands: SPECIES.map((sp) => sv('path', { class: 'ring-band', stroke: sp.css, 'stroke-width': 1.5, opacity: 0.22 }, back)),
    };
    this.rf = {
      line: sv('path', { class: 'ring-line', opacity: 0.5 }, front),
      line2: sv('path', { class: 'ring-line', opacity: 0.16 }, front),
      ticks: sv('path', { class: 'ring-tick', opacity: 0.45 }, front),
      bands: SPECIES.map((sp) => sv('path', { class: 'ring-band', stroke: sp.css, 'stroke-width': 1.6, opacity: 0.85 }, front)),
      playhead: sv('path', { class: 'playhead', opacity: 0.7 }, front),
      bead: sv('circle', { class: 'sun-bead', r: 3.5, filter: 'url(#glow)' }, front),
      beadRing: sv('circle', { class: 'beacon-ring', r: 9, stroke: '#fff3dd', opacity: 0.5 }, front),
    };
    this.months = MON3.map((m) => sv('text', { class: 'ring-month' }, front));
    this.months.forEach((t, i) => (t.textContent = m3(i)));
    function m3(i) { return MON3[i]; }
    // ticker
    const defs = document.querySelector('#hud-svg defs');
    const mask = sv('mask', { id: 'ticker-mask', maskUnits: 'userSpaceOnUse' }, defs);
    this.tickerMaskRect = sv('rect', { x: 0, y: 0, width: 10, height: 10, fill: 'url(#ticker-fade)' }, mask);
    $('ticker').setAttribute('mask', 'url(#ticker-mask)');
    $('ticker').setAttribute('style', 'fill:#fff');
    this.tickerTP = $('ticker-textpath');
    this.fadeGrad = $('ticker-fade');
    this.routeTP = $('route-textpath');
    this.bandTP = $('band-textpath');
    this.nowEl = $('now');
  }
  buildCallouts() {
    const wrap = $('callouts'), lead = $('leaders');
    const mk = (cls = '') => {
      const c = el('div', 'callout ' + cls);
      wrap.appendChild(c);
      const p = sv('path', { class: 'leader' }, lead);
      const d = sv('circle', { class: 'leader-dot', r: 2 }, lead);
      return { c, p, d, x: 0, y: 0, init: false };
    };
    this.co = { pos: mk(), env: mk(), endA: mk(), endB: mk() };
    // targeting brackets around the head
    this.reticle = sv('path', { class: 'leader', opacity: 0, 'stroke-width': 1.2 }, lead);
  }
  bindButtons() {
    $('btn-back').addEventListener('click', () => this.app.deselect());
    $('btn-prev').addEventListener('click', () => this.app.step(-1));
    $('btn-next').addEventListener('click', () => this.app.step(1));
    $('btn-play').addEventListener('click', () => this.app.togglePlay());
  }

  resize(W, H) { this.W = W; this.H = H; }

  /* ───────────── focus assemble ───────────── */
  enterFocus(sp, i) {
    document.body.style.setProperty('--c', sp.css);
    $('focus').style.setProperty('--c', sp.css);
    $('callouts').style.setProperty('--c', sp.css);
    $('f-index').textContent = `${sp.index} — ${sp.verb} · ${sp.medium === 'sea' ? 'Pelagic' : sp.medium === 'air' ? 'Aerial' : 'Overland'} migration`;
    splitChars($('f-name'), sp.name);
    $('f-latin').textContent = sp.latin;
    $('f-stock').textContent = sp.stock;
    $('f-blurb').textContent = sp.blurb;
    $('f-count').textContent = `${sp.index} / ${String(SPECIES.length).padStart(2, '0')}`;
    const img = $('portrait-img');
    img.src = sp.portrait;
    $('portrait-cap').textContent = `Plate ${sp.index} · ${sp.name} · generated image, illustrative`;
    const data = $('f-data');
    const si = STATUS_SCALE.indexOf(sp.status);
    data.innerHTML = `
      <div class="d-block" style="--i:0"><div class="d-k"><span>Distance</span><span>${sp.distanceNote.split('·')[0].trim()}</span></div>
        <div class="d-v"><span data-count="${sp.distanceKm}">0</span><small>KM</small></div><div class="d-n">${sp.distanceNote.split('·')[1]?.trim() || ''}</div></div>
      <div class="d-block" style="--i:1"><div class="d-k"><span>Population</span><span class="d-trend">${sp.trend}</span></div>
        <div class="d-v"><span data-count="${sp.population}" data-compact="1">0</span></div><div class="d-n">${sp.popNote}</div></div>
      <div class="d-block status-b" style="--i:2"><div class="d-k"><span>IUCN status</span><span>${STATUS_NAME[sp.status]}</span></div>
        <div class="iucn">${STATUS_SCALE.map((s, k) => `<span class="${k === si ? 'on' : ''}">${s}</span>`).join('')}</div><div class="d-n">${sp.statusNote}</div></div>
      <div class="d-block threats-b" style="--i:3"><div class="d-k"><span>Threats on the path</span><span>${sp.threats.length}</span></div>
        <ol class="threats">${sp.threats.map((t) => `<li>${t}</li>`).join('')}</ol></div>`;
    this.counters = [...data.querySelectorAll('[data-count]')].map((n, k) => ({ n, to: +n.dataset.count, compact: !!n.dataset.compact, t0: performance.now() + 1500 + k * 120 }));
    for (const c of Object.values(this.co)) { c.init = false; c.c.classList.remove('on'); }
    const sc = this.co;
    sc.pos.c.innerHTML = `<div class="c-k">Current position</div><div class="c-v mono sm" data-r="ll"></div><div class="c-phase" data-r="phase"></div><div class="c-x" data-r="prog"></div>`;
    sc.env.c.innerHTML = `<div class="c-k" data-r="lab"></div><div class="c-v" data-r="val"></div><div class="c-x" data-r="ext"></div>`;
    sp.ends.forEach((e, k) => {
      const c = k ? sc.endB : sc.endA;
      c.c.innerHTML = `<div class="c-k">${e.title}</div><div class="c-v sm">${e.place}</div><div class="c-x">${e.window}</div>`;
    });
    this.focusSp = sp;
    this.focusStart = performance.now();
    const rt = `${sp.name} · ${nf.format(sp.distanceKm)} km · ${sp.ends[0].place} ⟶ ${sp.ends[1].place} · `;
    this.routeTP.textContent = rt.repeat(8);
    $('route-text').style.fill = sp.css;
    document.body.classList.remove('leaving');
    $('route-text').classList.add('on');
    $('band-text').classList.add('on');
  }
  leaveFocus() {
    document.body.classList.add('leaving');
    for (const c of Object.values(this.co)) c.c.classList.remove('on');
    $('route-text').classList.remove('on');
    $('band-text').classList.remove('on');
    this.focusSp = null;
    clearTimeout(this._lt);
    this._lt = setTimeout(() => document.body.classList.remove('leaving'), 900);
  }

  /* ───────────── ring geometry ───────────── */
  ringPt(theta, rs = 1) {
    const { cx, cy, R, phi, f } = this.ring;
    const X = R * rs * Math.cos(theta), Y = R * rs * Math.sin(theta);
    const y2 = Y * Math.cos(phi), z = Y * Math.sin(phi);
    const s = f / (f - z);
    return [cx + X * s, cy + y2 * s, z, s];
  }
  thetaOf(m, t) { return Math.PI / 2 - (m - t) * (TAU / 12); }
  arcPath(rs, a0, a1, n = 90) {
    let d = '';
    for (let i = 0; i <= n; i++) {
      const [x, y] = this.ringPt(a0 + (a1 - a0) * (i / n), rs);
      d += (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
    }
    return d;
  }
  hitRing(x, y) {
    let best = 1e9;
    for (let i = 0; i <= 48; i++) {
      const [px, py] = this.ringPt(Math.PI * (i / 48), 1);
      best = Math.min(best, Math.hypot(px - x, py - y));
    }
    return best < 38;
  }
  pxPerMonth() { return this.ring.R * (TAU / 12) * (this.ring.f / (this.ring.f - this.ring.R * Math.sin(this.ring.phi))); }

  /* ───────────── per-frame ───────────── */
  update(f) {
    const { W, H } = this;
    if (!isFinite(f.globe.x) || !isFinite(f.globe.y) || !isFinite(f.globe.r)) return;
    const fm = (this.focusMix = f.focusMix);
    // ring placement: Saturn-like around the globe → low orbit band in focus
    const gx = f.globe.x, gy = f.globe.y, gr = f.globe.r;
    const mobile = W < 820;
    const oR = Math.min(gr * 1.36, W * 0.47), oCy = gy + gr * 0.12;
    const fR = mobile ? W * 0.46 : Math.min(W * 0.3, 470), fCy = H - (mobile ? 64 : 84);
    const fCx = mobile ? W / 2 : W * 0.42;
    const e = smooth(fm);
    this.ring.cx = lerp(gx, fCx, e);
    this.ring.cy = lerp(oCy, fCy, e);
    this.ring.R = lerp(oR, fR, e);
    this.ring.phi = lerp(1.27, 1.41, e);
    this.ring.f = this.ring.R * 4;
    const t = f.t;

    // globe mask
    const mc = $('globe-mask-circle');
    mc.setAttribute('cx', gx.toFixed(1)); mc.setAttribute('cy', gy.toFixed(1)); mc.setAttribute('r', (gr * 1.005).toFixed(1));

    // ring lines
    this.rb.line.setAttribute('d', this.arcPath(1, Math.PI, TAU));
    this.rf.line.setAttribute('d', this.arcPath(1, 0, Math.PI));
    this.rb.line2.setAttribute('d', this.arcPath(1.22, Math.PI, TAU));
    this.rf.line2.setAttribute('d', this.arcPath(1.22, 0, Math.PI));
    // ticks: weekly minor, monthly major
    let dF = '', dB = '';
    for (let k = 0; k < 52; k++) {
      const m = (k / 52) * 12;
      const th = this.thetaOf(m, t);
      const major = Math.abs(m - Math.round(m)) < 0.12;
      const [x0, y0, z] = this.ringPt(th, 1);
      const [x1, y1] = this.ringPt(th, major ? 1.07 : 1.03);
      const s = `M${x0.toFixed(1)} ${y0.toFixed(1)}L${x1.toFixed(1)} ${y1.toFixed(1)}`;
      if (Math.sin(th) >= 0) dF += s; else dB += s;
    }
    this.rf.ticks.setAttribute('d', dF); this.rb.ticks.setAttribute('d', dB);
    // month labels
    const fontBase = mobile ? 9 : 11;
    this.months.forEach((tx, i) => {
      const th = this.thetaOf(i + 0.5, t);
      const [x, y, z, s] = this.ringPt(th, 1.14);
      const front = Math.sin(th);
      const inside = Math.hypot(x - gx, y - gy) < gr && front < 0;
      tx.setAttribute('x', x.toFixed(1)); tx.setAttribute('y', y.toFixed(1));
      tx.setAttribute('font-size', (fontBase * s).toFixed(2));
      const near = 1 - clamp(Math.abs(fract((i + 0.5 - t) / 12 + 0.5) - 0.5) * 12 / 1.2);
      tx.setAttribute('opacity', (inside ? 0.05 : front >= 0 ? 0.35 + 0.65 * front : 0.16 + 0.1 * (1 + front)).toFixed(2));
      tx.style.fill = near > 0.3 ? '#fff3dd' : '';
    });
    // species season bands (where each species is in transit)
    SPECIES.forEach((sp, k) => {
      const mig = f.migs[k];
      const sel = f.focusId === sp.id;
      const show = f.focusId ? (sel ? 1 : 0) : 1;
      const rs = sel ? 0.9 : 0.93 - k * 0.026;
      let dFront = '', dBack = '';
      let penF = false, penB = false;
      for (let i = 0; i <= 120; i++) {
        const m = (i / 120) * 12;
        const v = Math.abs(mig.uAt(m + 0.05) - mig.uAt(m - 0.05)) / 0.1;
        const th = this.thetaOf(m, t);
        const on = v > 0.025;
        const [x, y] = this.ringPt(th, rs);
        const fr = Math.sin(th) >= 0;
        const seg = `${x.toFixed(1)} ${y.toFixed(1)}`;
        if (on && fr) { dFront += (penF ? 'L' : 'M') + seg; penF = true; } else penF = false;
        if (on && !fr) { dBack += (penB ? 'L' : 'M') + seg; penB = true; } else penB = false;
      }
      const hi = f.hoverId === sp.id ? 1 : 0;
      this.rf.bands[k].setAttribute('d', dFront);
      this.rb.bands[k].setAttribute('d', dBack);
      this.rf.bands[k].setAttribute('opacity', (show * (0.55 + hi * 0.45) * f.reveal).toFixed(2));
      this.rb.bands[k].setAttribute('opacity', (show * 0.2 * f.reveal).toFixed(2));
      this.rf.bands[k].setAttribute('stroke-width', sel ? 3 : hi ? 2.4 : 1.4);
    });
    // playhead + sun bead at the front
    const [px0, py0] = this.ringPt(Math.PI / 2, 0.84);
    const [px1, py1] = this.ringPt(Math.PI / 2, 1.3);
    const [bx, by] = this.ringPt(Math.PI / 2, 1);
    this.rf.playhead.setAttribute('d', `M${px0} ${py0}L${px1} ${py1}`);
    this.rf.bead.setAttribute('cx', bx); this.rf.bead.setAttribute('cy', by);
    this.rf.beadRing.setAttribute('cx', bx); this.rf.beadRing.setAttribute('cy', by);
    this.rf.beadRing.setAttribute('r', 7 + Math.sin(f.time * 2) * 2);
    const day = Math.floor(fract(t / 12) * 365) + 1;
    const date = dateOf(t);
    this.nowEl.style.transform = `translate(${px1.toFixed(1)}px, ${(py1 + 6).toFixed(1)}px) translateX(-50%)`;
    this.nowEl.textContent = `${date.d} ${MONTHS[date.m]} · day ${String(day).padStart(3, '0')}`;
    $('ring-back').style.opacity = $('ring-front').style.opacity = f.reveal;
    this.nowEl.style.opacity = f.reveal;

    // phase band text in focus
    if (this.focusSp) {
      const mig = f.migs[SPECIES.indexOf(this.focusSp)];
      $('band-path').setAttribute('d', this.arcPath(0.78, Math.PI * 0.82, Math.PI * 0.18, 60));
      this.bandTP.textContent = `${mig.phase[2]} — ${mig.phase[3]}`;
      this.bandTP.setAttribute('font-size', 15);
      $('band-text').style.fill = this.focusSp.css;
    }

    this.updateTicker(f);
    this.updateBeacons(f);
    this.updateCallouts(f);
    this.updatePings(f);

    // throttled DOM text
    this.throttle -= f.dt;
    if (this.throttle <= 0) {
      this.throttle = 0.1;
      this.updateTelemetry(f);
      // measure text blocks off the hot path (avoids per-frame forced layout)
      for (const L of this.labels) L.w = L.l.offsetWidth;
      for (const c of Object.values(this.co)) { c.w = c.c.offsetWidth; c.h = c.c.offsetHeight; }
    }
    const m = Math.floor(fract(t / 12) * 12);
    // month title: never during time-lapse or scrubbing, and at most every 3 s
    const calm = f.playing && !f.scrubbing && (f.warp ?? 0) < 0.05;
    if (m !== this.lastMonth && f.reveal > 0.9 && calm && f.time - (this.ghostT ?? -99) > 3) {
      this.ghostT = f.time;
      const g = $('month-ghost');
      g.textContent = MONTHS[m];
      g.classList.remove('show'); void g.offsetWidth; g.classList.add('show');
    }
    this.lastMonth = m;
    if (this.counters) {
      const now = performance.now();
      for (const c of this.counters) {
        const k = easeOutExpo(clamp((now - c.t0) / 1800));
        const v = c.to * k;
        c.n.textContent = c.compact && c.to >= 1e6 ? (v / 1e6).toFixed(v / 1e6 >= 100 ? 0 : 1) + 'M' : nf.format(Math.round(v));
      }
    }
  }

  updateTelemetry(f) {
    const now = new Date();
    $('t-utc').textContent = now.toISOString().slice(11, 19);
    const date = dateOf(f.t);
    $('t-date').textContent = `${date.d} ${MONTHS[date.m]}`;
    $('t-decl').textContent = `${f.decl >= 0 ? '+' : '−'}${Math.abs(f.decl).toFixed(2)}°`;
    $('t-sublon').textContent = fmtLon(f.sunLon);
    let moving = 0;
    f.migs.forEach((m) => (moving += m.sp.population * m.mv));
    this.motionShown = lerp(this.motionShown ?? moving, moving, 0.25);
    $('t-motion').textContent = nf.format(Math.round(this.motionShown));
    f.migs.forEach((m, i) => {
      const it = this.idx[i];
      const p = m.progress();
      it.bar.style.width = `${(p * 100).toFixed(1)}%`;
      it.dot.style.left = `${(p * 100).toFixed(1)}%`;
      it.phase.textContent = `${m.phase[2]}${m.mv > 0.3 ? ' ' + (m.dir > 0 ? '→' : '←') : ''}`;
      it.b.classList.toggle('hi', f.hoverId === m.sp.id);
      const L = this.labels[i];
      L.meta.textContent = `${m.phase[2]} · ${Math.round(p * 100)}%`;
    });
    $('btn-play').innerHTML = f.playing ? '❚❚ <span>Pause</span>' : '▶ <span>Play</span>';
  }

  updateBeacons(f) {
    const { W, H } = this;
    const gx = f.globe.x, gy = f.globe.y;
    const items = [];
    this.labels.forEach((L, i) => {
      const mig = f.migs[i];
      const pr = f.project(mig.beaconPos || mig.head);
      const vis = clamp(pr.facing * 6) * f.reveal * (1 - f.focusMix);
      const hi = f.hoverId === L.sp.id;
      const pulse = fract(f.time * 0.6 + i * 0.2);
      L.ring.setAttribute('cx', pr.x); L.ring.setAttribute('cy', pr.y);
      L.ring.setAttribute('r', 4 + pulse * 18); L.ring.setAttribute('opacity', (1 - pulse) * 0.8 * vis);
      const p2 = fract(pulse + 0.5);
      L.ring2.setAttribute('cx', pr.x); L.ring2.setAttribute('cy', pr.y);
      L.ring2.setAttribute('r', 4 + p2 * 18); L.ring2.setAttribute('opacity', (1 - p2) * 0.5 * vis);
      L.core.setAttribute('cx', pr.x); L.core.setAttribute('cy', pr.y);
      L.core.setAttribute('opacity', vis); L.core.setAttribute('r', hi ? 3.5 : 2.2);
      let dx = pr.x - gx, dy = pr.y - gy;
      const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
      const reach = 54 + (hi ? 8 : 0);
      items.push({ L, pr, vis, hi, dx, dy, x: pr.x + dx * reach, y: pr.y + dy * reach * 0.7 - 10 });
    });
    // simple vertical de-overlap
    items.sort((a, b) => a.y - b.y);
    for (let k = 1; k < items.length; k++) {
      const a = items[k - 1], b = items[k];
      if (a.vis > 0.05 && b.vis > 0.05 && Math.abs(a.x - b.x) < 180 && b.y - a.y < 54) b.y = a.y + 54;
    }
    for (const it of items) {
      const { L, pr, vis, hi, dx } = it;
      const left = dx < 0;
      const lw = L.w || 120;
      const tx = left ? Math.max(it.x, lw + 8) : Math.min(it.x, W - lw - 8);
      L.x = lerp(L.x || tx, tx, 0.2); L.y = lerp(L.y || it.y, it.y, 0.2);
      L.l.classList.toggle('left', left);
      L.l.style.transform = `translate(${L.x.toFixed(1)}px, ${L.y.toFixed(1)}px) translate(${left ? '-100%' : '0'}, -50%)`;
      L.l.style.opacity = vis * (hi ? 1 : 0.85);
      L.l.style.pointerEvents = vis > 0.3 ? 'auto' : 'none';
      const ex = L.x + (left ? 4 : -4);
      L.lead.setAttribute('d', `M${(pr.x + dx * 7).toFixed(1)} ${(pr.y + it.dy * 7).toFixed(1)}L${(ex - (left ? -8 : 8)).toFixed(1)} ${L.y.toFixed(1)}L${ex.toFixed(1)} ${L.y.toFixed(1)}`);
      L.lead.setAttribute('opacity', vis * (hi ? 0.9 : 0.45));
    }
  }

  updateCallouts(f) {
    const sp = this.focusSp;
    const show = sp && f.focusMix > 0.92 && performance.now() - this.focusStart > 1800;
    const co = this.co;
    const ret = this.reticle;
    if (!sp) {
      for (const c of Object.values(co)) { c.p.setAttribute('opacity', 0); c.d.setAttribute('opacity', 0); }
      ret.setAttribute('opacity', 0);
      $('route-path').setAttribute('d', '');
      return;
    }
    const mig = f.migs[SPECIES.indexOf(sp)];
    const head = f.project(mig.beaconPos || mig.head);
    const { W, H } = this;
    const maxX = W < 820 ? W - 20 : W * 0.64;
    const boxes = [];
    const place = (c, ax, ay, ox, oy, visible, right) => {
      const w = c.w || 180, h = c.h || 60;
      let tx = clamp(ax + ox, 20 + (right ? w : 0), maxX - (right ? 0 : w)), ty = clamp(ay + oy, 80, H - 170);
      // push away from callouts already placed
      if (visible) {
        for (let pass = 0; pass < 3; pass++) {
          for (const b of boxes) {
            const x0 = right ? tx - w : tx, x1 = x0 + w;
            if (x1 > b.x0 - 12 && x0 < b.x1 + 12 && Math.abs(ty - b.y) < (h + b.h) / 2 + 10) ty = ty < b.y ? b.y - (h + b.h) / 2 - 12 : b.y + (h + b.h) / 2 + 12;
          }
        }
        boxes.push({ x0: right ? tx - w : tx, x1: right ? tx : tx + w, y: ty, h });
      }
      if (!c.init) { c.x = tx; c.y = ty; c.init = true; }
      c.x = lerp(c.x, tx, 0.12); c.y = lerp(c.y, ty, 0.12);
      c.c.classList.toggle('on', visible);
      c.c.classList.toggle('right', !!right);
      c.c.style.transform = `translate(${c.x.toFixed(1)}px, ${c.y.toFixed(1)}px) translate(${right ? '-100%' : '0'}, -50%)`;
      const ex = c.x + (right ? 8 : -8);
      const elbowX = ex + (right ? 18 : -18);
      c.p.setAttribute('d', `M${ax.toFixed(1)} ${ay.toFixed(1)}L${elbowX.toFixed(1)} ${c.y.toFixed(1)}L${ex.toFixed(1)} ${c.y.toFixed(1)}`);
      c.p.setAttribute('opacity', visible ? 0.55 : 0);
      c.d.setAttribute('cx', ax); c.d.setAttribute('cy', ay); c.d.setAttribute('opacity', visible ? 0.9 : 0);
      c.p.style.stroke = sp.css;
    };
    const hv = show && head.facing > 0;
    const mobile = W < 820;
    if (mobile) {
      place(co.pos, head.x, clamp(head.y, H * 0.32, H * 0.5), 30, -70, hv);
      place(co.env, head.x, head.y, 30, 60, false);
    } else {
      place(co.pos, head.x, head.y, 70, -86, hv);
      place(co.env, head.x, head.y, 70, 70, hv);
    }
    // fill dynamic text
    const ll = vecToLatLon(mig.head);
    const q = (s) => co.pos.c.querySelector(`[data-r="${s}"]`);
    const pct = mig.progress();
    const km = Math.round((sp.open ? pct : (pct <= 0.5 ? pct * 2 : (pct - 0.5) * 2)) * (sp.id === 'tern' ? sp.distanceKm / 2 : sp.id === 'wildebeest' || sp.id === 'caribou' ? sp.distanceKm / 2 : sp.distanceKm));
    q('ll').textContent = `${fmtLat(ll.lat)}  ${fmtLon(ll.lon)}`;
    q('phase').textContent = `${mig.phase[2]} — ${mig.phase[3]}`;
    q('prog').textContent = `${Math.round(pct * 100)}% of the annual circuit · ${nf.format(km)} km this leg`;
    const cond = conditionsAt(sp, ll.lat, f.t);
    const qe = (s) => co.env.c.querySelector(`[data-r="${s}"]`);
    qe('lab').textContent = cond.label; qe('val').textContent = cond.value; qe('ext').textContent = cond.extra;
    // route ends
    sp.ends.forEach((e, k) => {
      const c = k ? co.endB : co.endA;
      const p = f.project(mig.route.at(e.u).multiplyScalar(1.002));
      const right = p.x < head.x - 40 || (k === 0 && p.x < W * 0.3);
      const far = Math.hypot(p.x - head.x, p.y - head.y) > 140;
      place(c, p.x, p.y, right ? -40 : 40, k ? 40 : -40, !mobile && show && p.facing > 0 && far && p.x > 0 && p.x < W, right);
    });
    // reticle brackets around head
    const r = 16 + Math.sin(f.time * 2.2) * 2, b = 6, rot = f.time * 0.4;
    let d = '';
    for (let k = 0; k < 4; k++) {
      const a = rot + k * Math.PI / 2 + Math.PI / 4;
      const cx = head.x + Math.cos(a) * r, cy = head.y + Math.sin(a) * r;
      const a1 = a + Math.PI * 0.75, a2 = a - Math.PI * 0.75;
      d += `M${(cx + Math.cos(a1) * b).toFixed(1)} ${(cy + Math.sin(a1) * b).toFixed(1)}L${cx.toFixed(1)} ${cy.toFixed(1)}L${(cx + Math.cos(a2) * b).toFixed(1)} ${(cy + Math.sin(a2) * b).toFixed(1)}`;
    }
    ret.setAttribute('d', d);
    ret.setAttribute('opacity', hv ? 0.8 : 0);
    ret.style.stroke = sp.css;
    // text set along the projected route — longest visible run
    const N = 260;
    let best = [], cur = [];
    const step = sp.open ? 1 : 1;
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      const p = f.project(mig.route.at(u).multiplyScalar(mig.routeR ? mig.routeR(u) : 1.003));
      if (p.facing > 0.05 && p.x > -50 && p.x < W + 50 && p.y > -50 && p.y < H + 50) cur.push(p);
      else { if (cur.length > best.length) best = cur; cur = []; }
    }
    if (cur.length > best.length) best = cur;
    let dd = '';
    best.forEach((p, i) => { dd += (i ? 'L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1); });
    $('route-path').setAttribute('d', dd);
    this.routeScroll += f.dt * 22 * (mig.mv > 0.2 ? mig.dir : 0.25);
    this.routeTP.setAttribute('startOffset', (-(fract(this.routeScroll / 1200)) * 1200).toFixed(1));
    void step;
  }

  /* sightings ticker that runs along the front of the orbit */
  updateTicker(f) {
    const path = $('ticker-path');
    path.setAttribute('d', this.arcPath(1.3, Math.PI, 0, 80));
    const { cx, R } = this.ring;
    this.fadeGrad.setAttribute('x1', cx - R * 1.3); this.fadeGrad.setAttribute('x2', cx + R * 1.3);
    this.tickerMaskRect.setAttribute('x', cx - R * 1.6); this.tickerMaskRect.setAttribute('width', R * 3.2);
    this.tickerMaskRect.setAttribute('y', this.ring.cy - R); this.tickerMaskRect.setAttribute('height', R * 2.4);
    const len = path.getTotalLength ? path.getTotalLength() : 1000;
    this.tickerScroll += f.dt * (this.W < 820 ? 34 : 46);
    const tp = this.tickerTP;
    // remove scrolled-off items
    while (this.tickerItems.length && this.tickerScroll > len + this.tickerItems[0].w) {
      const it = this.tickerItems.shift();
      this.tickerScroll -= it.w;
      it.node.remove();
      it.gap.remove();
    }
    const total = this.tickerItems.reduce((a, b) => a + b.w, 0);
    if (len - this.tickerScroll + total < len + 40 && f.reveal > 0.5) this.pushSighting(f);
    tp.setAttribute('startOffset', (len - this.tickerScroll).toFixed(1));
    $('ticker').style.opacity = f.reveal;
  }
  pushSighting(f) {
    const pool = f.focusId ? [f.focusId, f.focusId, f.focusId, ...SPECIES.map((s) => s.id)] : SPECIES.map((s) => s.id);
    const id = pool[Math.floor(Math.random() * pool.length)];
    const k = SPECIES.findIndex((s) => s.id === id);
    const sp = SPECIES[k], mig = f.migs[k];
    const loc = mig.sample ? mig.sample() : mig.head.clone();
    const spread = { whale: 1.6, tern: 3, wildebeest: 0.25, monarch: 0.6, caribou: 0.4, swallow: 1.4, tuna: 0.8, buzzard: 0.9, martin: 1.2 }[id] ?? 1;
    const ll = vecToLatLon(loc);
    ll.lat += (Math.random() - 0.5) * spread; ll.lon += (Math.random() - 0.5) * spread;
    const [a, b] = sp.countRange;
    const busy = 0.3 + mig.mv * 0.7;
    const count = Math.max(1, Math.round(Math.exp(Math.log(a) + Math.random() * (Math.log(b) - Math.log(a)) * busy)));
    const obs = sp.observers[Math.floor(Math.random() * sp.observers.length)];
    const tag = /[#\-]$/.test(obs) ? obs + String(Math.floor(Math.random() * 9000) + 100) : obs;
    const now = new Date().toISOString().slice(11, 19);
    const node = document.createElementNS(SVGNS, 'tspan');
    node.innerHTML = `${now}Z  <tspan fill="${sp.css}">${sp.name} ×${nf.format(count)}</tspan>  ${fmtLat(ll.lat)} ${fmtLon(ll.lon)}  ${tag}`;
    const gap = document.createElementNS(SVGNS, 'tspan');
    gap.textContent = '      ◆      ';
    gap.setAttribute('fill-opacity', '0.4');
    this.tickerTP.appendChild(node);
    this.tickerTP.appendChild(gap);
    const w = node.getComputedTextLength() + gap.getComputedTextLength();
    this.tickerItems.push({ node, gap, w });
    // ping the globe where it was seen
    const c = sv('circle', { class: 'ping', stroke: sp.css }, $('pings'));
    this.pings.push({ c, v: latLonToVec(ll.lat, ll.lon, 1.002), t0: f.time, sp: id });
  }
  updatePings(f) {
    this.pings = this.pings.filter((p) => {
      const age = (f.time - p.t0) / 2.4;
      if (age > 1) { p.c.remove(); return false; }
      const pr = f.project(p.v);
      const dim = f.focusId && f.focusId !== p.sp ? 0.2 : 1;
      p.c.setAttribute('cx', pr.x); p.c.setAttribute('cy', pr.y);
      p.c.setAttribute('r', 2 + smooth(age) * 22);
      p.c.setAttribute('opacity', (1 - age) * clamp(pr.facing * 5) * dim * f.reveal);
      return true;
    });
  }
}

export function dateOf(t) {
  const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  t = ((t % 12) + 12) % 12;
  const m = Math.floor(t);
  return { m, d: Math.min(DAYS[m], Math.floor((t - m) * DAYS[m]) + 1) };
}
export { phaseAt };
