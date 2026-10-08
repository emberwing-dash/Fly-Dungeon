// Procedural top-down fruit fly + stage. Behaviour intensities (0..1, relative to a healthy fly) drive the animation.
// Everything is drawn with canvas paths so the game needs no image assets.

const TAU = Math.PI * 2;

export class FlyStage {
  constructor(canvas) {
    this.c = canvas;
    this.g = canvas.getContext('2d');
    this.t = 0;
    this.beh = {};          // current intensities by behaviour id
    this.scenario = 'loom';
    this.pos = { x: 0, y: 0, a: -Math.PI / 2 };
    this.hop = 0;           // escape jump progress
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.resize();
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement);
    this.last = performance.now();
    this.alive = true;
    const loop = (now) => { if (!this.alive) return; const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now; this.step(dt); this.draw(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  resize() {
    const r = this.c.parentElement.getBoundingClientRect();
    const w = Math.max(240, r.width), h = Math.max(220, r.height);
    this.W = w; this.H = h;
    this.c.width = w * this.dpr; this.c.height = h * this.dpr;
    this.c.style.width = w + 'px'; this.c.style.height = h + 'px';
    this.g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.home = { x: w / 2, y: h * 0.58 };
    if (!this.pos.x) { this.pos.x = this.home.x; this.pos.y = this.home.y; }
  }

  set(scenario, beh) { this.scenario = scenario; this.beh = beh; }

  step(dt) {
    this.t += dt;
    const b = this.beh, s = this.scenario;
    const p = this.pos;
    // gentle return to home so the fly stays on stage
    let vx = 0, vy = 0;
    if (s === 'prey') {                      // walks toward the fruit while the approach drive is on
      const target = { x: this.W * 0.82, y: this.H * 0.28 };
      const d = Math.hypot(target.x - p.x, target.y - p.y);
      const ang = Math.atan2(target.y - p.y, target.x - p.x);
      p.a += angDiff(ang, p.a) * Math.min(1, dt * 4 * (b.approach || 0));
      const sp = 70 * (b.approach || 0) * Math.min(1, d / 120);
      vx = Math.cos(p.a) * sp; vy = Math.sin(p.a) * sp;
      this.walk = sp > 3;
    } else if (s === 'loom') {               // escape: hop away from the shadow (height scales with the escape drive), then settle
      const e = b.escape || 0;
      this.cool = Math.max(0, (this.cool || 0) - dt);
      if (this.hop === 0) { p.x += (this.home.x - p.x) * Math.min(1, dt * 6); p.y += (this.home.y - p.y) * Math.min(1, dt * 6); p.a = -Math.PI / 2; }
      if (e > 0.3 && this.hop === 0 && this.cool === 0) { this.hop = 0.001; this.amp = Math.min(1, (e - 0.3) / 0.65); }
      if (this.hop > 0) {
        this.hop += dt * 2.2;
        const k = Math.min(1, this.hop);
        p.y = this.home.y + 40 * (this.amp || 1) - 180 * (this.amp || 1) * easeOut(Math.min(1, k * 2));
        p.x = this.home.x; p.a = -Math.PI / 2;
        if (this.hop > 1.6) { this.hop = 0; p.y = this.home.y; this.cool = 1.2; }
      }
      this.walk = false;
    } else if (s === 'mate') {               // orients to the other fly and sings
      const tgt = { x: this.W * 0.72, y: this.H * 0.36 };
      const ang = Math.atan2(tgt.y - p.y, tgt.x - p.x);
      p.a += angDiff(ang, p.a) * Math.min(1, dt * 3 * (0.3 + (b.court || 0)));
      this.walk = false;
    } else {
      p.a += angDiff(-Math.PI / 2, p.a) * Math.min(1, dt * 3);
      this.walk = false;
    }
    if (s !== 'loom') {
      p.x += (vx) * dt; p.y += (vy) * dt;
      if (s !== 'prey') { p.x += (this.home.x - p.x) * dt * 2; p.y += (this.home.y - p.y) * dt * 2; }
      if (s === 'prey' && (b.approach || 0) < 0.15) { p.x += (this.home.x - p.x) * dt * 0.8; p.y += (this.home.y - p.y) * dt * 0.8; }
    }
  }

  draw() {
    const g = this.g, W = this.W, H = this.H, t = this.t, b = this.beh, s = this.scenario;
    g.clearRect(0, 0, W, H);
    // petri-dish stage
    const cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.47;
    const grd = g.createRadialGradient(cx, cy, R * 0.1, cx, cy, R);
    grd.addColorStop(0, css('--stage-in')); grd.addColorStop(1, css('--stage-out'));
    g.fillStyle = grd; g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.fill();
    g.strokeStyle = css('--stage-rim'); g.lineWidth = 3; g.stroke();

    this.drawStimulus(g, s, t, b);
    this.drawFly(g, t, b, s);
  }

  drawStimulus(g, s, t, b) {
    const W = this.W, H = this.H;
    g.save();
    if (s === 'loom') {                      // growing shadow overhead
      const k = (t % 2.4) / 2.4;
      const r = 20 + k * k * Math.min(W, H) * 0.55;
      g.fillStyle = `rgba(10,10,20,${0.15 + 0.4 * k})`;
      g.beginPath(); g.arc(W / 2, H * 0.22, r, 0, TAU); g.fill();
    } else if (s === 'dust') {               // dust motes drifting down onto the antennae
      for (let i = 0; i < 18; i++) {
        const x = this.pos.x + Math.sin(i * 7.1 + t * 0.7) * 38 + Math.cos(i * 3.3) * 10;
        const y = ((t * 40 + i * 53) % 130) + this.pos.y - 120;
        g.fillStyle = 'rgba(190,170,130,.55)'; g.beginPath(); g.arc(x, y, 1.6 + (i % 3) * 0.6, 0, TAU); g.fill();
      }
    } else if (s === 'mate') {               // a second fly, wing flicks
      g.save(); g.translate(W * 0.72, H * 0.36); g.rotate(Math.PI * 0.85 + Math.sin(t * 1.5) * 0.15); g.scale(0.8, 0.8);
      drawFlyBody(g, t * 1.3, { wingOut: 0, groom: 0, probos: 0, walk: false }, true); g.restore();
    } else if (s === 'prey') {               // a ripe berry
      const x = W * 0.82, y = H * 0.28;
      g.fillStyle = '#c0392b'; g.beginPath(); g.arc(x, y, 15, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.arc(x - 5, y - 5, 4, 0, TAU); g.fill();
      g.strokeStyle = '#2e7d32'; g.lineWidth = 3; g.beginPath(); g.moveTo(x, y - 14); g.lineTo(x + 4, y - 22); g.stroke();
    } else if (s === 'taste') {              // sugar droplet in front of the head
      const x = this.pos.x, y = this.pos.y - 62;
      g.fillStyle = 'rgba(255,214,102,.85)'; g.beginPath(); g.ellipse(x, y, 14, 9, 0, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,255,255,.5)'; g.beginPath(); g.ellipse(x - 4, y - 3, 4, 2.4, 0, 0, TAU); g.fill();
    }
    g.restore();
  }

  drawFly(g, t, b, s) {
    const p = this.pos;
    const lift = this.hop > 0 ? Math.sin(Math.min(1, this.hop) * Math.PI) * (this.amp || 1) : 0;
    g.save();
    // shadow
    g.fillStyle = 'rgba(0,0,0,.18)'; g.beginPath(); g.ellipse(p.x + 6 * lift, p.y + 20 + 14 * lift, 16, 7, 0, 0, TAU); g.fill();
    g.translate(p.x, p.y - 28 * lift);
    g.rotate(p.a + Math.PI / 2);
    const k = (v) => Math.max(0, Math.min(1, v));
    drawFlyBody(g, t, {
      wingOut: s === 'mate' ? k(b.court || 0) : (this.hop > 0 ? 1 : 0),
      groom: s === 'dust' ? k((b.groom || 0)) : 0,
      probos: s === 'taste' ? k(b.feed || 0) : 0,
      walk: this.walk,
    }, false);
    g.restore();
  }
}

function drawFlyBody(g, t, st, other) {
  const body = other ? '#7c6a58' : css('--fly-body');
  const wing = 'rgba(190,225,255,.42)';
  g.lineCap = 'round'; g.lineJoin = 'round';
  // legs
  g.strokeStyle = other ? '#51443a' : css('--fly-leg'); g.lineWidth = 1.6;
  const ph = st.walk ? t * 14 : 0;
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < 3; i++) {
      const y0 = -4 + i * 8, sw = st.walk ? Math.sin(ph + i * 2.1 + (side > 0 ? 0 : Math.PI)) * 5 : 0;
      let ex = side * (17 + i * 2), ey = y0 + (i - 1) * 9 + sw;
      if (i === 0 && st.groom > 0.05) { // front legs rub together at the head
        const m = Math.sin(t * 22) * 2.2 * st.groom;
        ex = side * (6 - 4 * st.groom) + m * side; ey = -17 - 6 * st.groom;
      }
      g.beginPath(); g.moveTo(side * 4, y0); g.lineTo(side * (10 + (i === 0 && st.groom > 0.05 ? 0 : 4)), y0 + (i - 1) * 3 - 3); g.lineTo(ex, ey); g.stroke();
    }
  }
  // wings
  const sp = st.wingOut > 0.05 ? (0.9 + 0.12 * Math.sin(t * 60)) : 0.0;
  for (let side = -1; side <= 1; side += 2) {
    g.save(); g.translate(side * 4, 2);
    const open = (side > 0 || st.wingOut > 0.05) ? st.wingOut : 0;
    g.rotate(side * (0.12 + 0.9 * open * sp));
    g.fillStyle = wing; g.strokeStyle = 'rgba(120,170,210,.7)'; g.lineWidth = 0.8;
    g.beginPath(); g.ellipse(side * 2, 14, 5, 17, 0, 0, TAU); g.fill(); g.stroke();
    g.restore();
  }
  // abdomen, thorax, head
  g.fillStyle = body;
  g.beginPath(); g.ellipse(0, 15, 7.5, 12, 0, 0, TAU); g.fill();
  g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 1;
  for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(-6, 9 + i * 5); g.quadraticCurveTo(0, 11 + i * 5, 6, 9 + i * 5); g.stroke(); }
  g.fillStyle = body; g.beginPath(); g.ellipse(0, 0, 7, 9, 0, 0, TAU); g.fill();
  const hb = st.groom > 0.05 ? Math.sin(t * 18) * 1.1 * st.groom : 0;
  g.save(); g.translate(hb, -12);
  g.beginPath(); g.ellipse(0, 0, 6, 5, 0, 0, TAU); g.fill();
  g.fillStyle = other ? '#8a3a3a' : '#c0392b';
  g.beginPath(); g.ellipse(-4.6, -1, 3.1, 4, -0.2, 0, TAU); g.fill();
  g.beginPath(); g.ellipse(4.6, -1, 3.1, 4, 0.2, 0, TAU); g.fill();
  if (st.probos > 0.08) {                   // proboscis extends
    g.strokeStyle = '#e8c9a0'; g.lineWidth = 2.6; g.beginPath(); g.moveTo(0, -4); g.lineTo(0, -4 - 12 * st.probos); g.stroke();
    g.fillStyle = '#e8c9a0'; g.beginPath(); g.ellipse(0, -5 - 12 * st.probos, 3.4, 2.2, 0, 0, TAU); g.fill();
  }
  g.restore();
}

const easeOut = (x) => 1 - (1 - x) * (1 - x);
function angDiff(a, b) { let d = a - b; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; }
const _cs = {};
function css(name) { const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim(); return v || '#888'; }
