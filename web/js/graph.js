// Interactive circuit map: one dot per real cell type, one line per strong type-to-type connection.

const TAU = Math.PI * 2;
const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || '#888';

export class CircuitMap {
  /** @param {HTMLCanvasElement} canvas  @param {{onPick(node,ev):void, onHover(node,ev):void}} cb */
  constructor(canvas, cb) {
    this.c = canvas; this.g = canvas.getContext('2d'); this.cb = cb;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.nodes = []; this.edges = []; this.byName = new Map();
    this.act = new Map(); this.lesion = new Set(); this.moves = new Map(); // name -> 'boost' | 'silence'
    this.hover = null; this.sel = null; this.t = 0; this.pad = { l: 34, r: 34, t: 22, b: 22 };
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement);
    canvas.addEventListener('pointermove', (e) => this.onMove(e));
    canvas.addEventListener('pointerleave', () => { this.hover = null; this.cb.onHover(null); });
    canvas.addEventListener('click', (e) => this.onClick(e));
    this.last = performance.now();
    const loop = (now) => { const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now; this.t += dt; this.draw(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
    this.resize();
  }

  resize() {
    const r = this.c.parentElement.getBoundingClientRect();
    this.W = Math.max(280, r.width); this.H = Math.max(260, r.height);
    this.c.width = this.W * this.dpr; this.c.height = this.H * this.dpr;
    this.c.style.width = this.W + 'px'; this.c.style.height = this.H + 'px';
    this.g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.layoutPx();
  }

  setGraph(nodes, edges) {
    this.nodes = nodes.map((n) => ({ ...n }));
    this.byName = new Map(this.nodes.map((n) => [n.t, n]));
    this.edges = edges.map(([a, b, w]) => ({ a: this.byName.get(a), b: this.byName.get(b), w })).filter((e) => e.a && e.b);
    this.sel = null; this.hover = null;
    this.layoutPx();
    this.draw();
  }

  layoutPx() {
    const { l, r, t, b } = this.pad;
    const w = this.W - l - r, h = this.H - t - b;
    for (const n of this.nodes) {
      n.px = l + n.x * w; n.py = t + n.y * h;
      n.r = Math.max(5, Math.min(15, 3.2 + Math.sqrt(n.n || 1) * 0.9));
    }
  }

  hit(e) {
    const rc = this.c.getBoundingClientRect();
    const x = e.clientX - rc.left, y = e.clientY - rc.top;
    let best = null, bd = 1e9;
    for (const n of this.nodes) {
      const d = Math.hypot(n.px - x, n.py - y);
      if (d < n.r + 7 && d < bd) { best = n; bd = d; }
    }
    return { node: best, x, y };
  }
  onMove(e) { const { node, x, y } = this.hit(e); this.hover = node; this.c.style.cursor = node ? 'pointer' : 'default'; this.cb.onHover(node, { x, y }); }
  onClick(e) { const { node, x, y } = this.hit(e); this.sel = node; this.cb.onPick(node, { x, y }); }

  draw() {
    const g = this.g, W = this.W, H = this.H;
    g.clearRect(0, 0, W, H);
    const exc = css('--exc'), inh = css('--inh'), ink = css('--ink'), line = css('--line'), node = css('--node-bg');
    const colKind = { sensor: css('--sens'), relay: css('--relay'), cmd: css('--cmd') };
    // column guides
    g.fillStyle = css('--ink-2'); g.font = '11px system-ui'; g.textAlign = 'center'; g.globalAlpha = .7;
    g.fillText('SENSES', this.pad.l, 13); g.fillText('RELAYS', W / 2, 13); g.fillText('COMMANDS', W - this.pad.r, 13);
    g.globalAlpha = 1;
    // edges
    const focus = this.hover || this.sel;
    for (const e of this.edges) {
      const a = e.a, b = e.b;
      const act = (this.act.get(a.t) || 0);
      const live = Math.min(1, act * 3) * (this.silenced(a.t) ? 0 : 1);
      const isF = focus && (a === focus || b === focus);
      const mag = Math.min(1, Math.abs(e.w) * 5);
      g.globalAlpha = focus ? (isF ? 0.95 : 0.06) : 0.12 + 0.45 * mag * (0.35 + live);
      g.strokeStyle = e.w >= 0 ? exc : inh;
      g.lineWidth = 0.6 + 2.6 * mag + (isF ? 0.8 : 0);
      const cx = (a.px + b.px) / 2, cy = (a.py + b.py) / 2 + (b.py - a.py) * 0.0;
      g.beginPath(); g.moveTo(a.px, a.py);
      g.bezierCurveTo(a.px + (b.px - a.px) * 0.5, a.py, a.px + (b.px - a.px) * 0.5, b.py, b.px, b.py);
      g.stroke();
      // moving pulse when the source is active
      if (live > 0.05 && (isF || !focus)) {
        const k = (this.t * (0.4 + live) + (a.px * 0.013)) % 1;
        const p = bez(a.px, a.py, a.px + (b.px - a.px) * 0.5, a.py, a.px + (b.px - a.px) * 0.5, b.py, b.px, b.py, k);
        g.globalAlpha = Math.min(1, 0.3 + live);
        g.fillStyle = e.w >= 0 ? exc : inh; g.beginPath(); g.arc(p.x, p.y, 1.8 + 1.6 * live, 0, TAU); g.fill();
      }
    }
    g.globalAlpha = 1;
    // nodes
    for (const n of this.nodes) {
      const a = Math.min(1, (this.act.get(n.t) || 0) * 3);
      const isLes = this.lesion.has(n.t), mv = this.moves.get(n.t);
      const dim = focus && n !== focus && !this.linked(n, focus);
      g.globalAlpha = dim ? 0.28 : 1;
      if (a > 0.02) { // glow
        const gr = g.createRadialGradient(n.px, n.py, n.r * 0.5, n.px, n.py, n.r * (2.2 + 1.8 * a));
        gr.addColorStop(0, hexA(colKind[n.kind] || '#888', 0.55 * a)); gr.addColorStop(1, hexA(colKind[n.kind] || '#888', 0));
        g.fillStyle = gr; g.beginPath(); g.arc(n.px, n.py, n.r * (2.2 + 1.8 * a), 0, TAU); g.fill();
      }
      g.fillStyle = node; g.strokeStyle = colKind[n.kind] || '#888'; g.lineWidth = n.kind === 'cmd' ? 3 : 2;
      g.beginPath();
      if (n.kind === 'cmd') { g.rect(n.px - n.r, n.py - n.r, n.r * 2, n.r * 2); } else g.arc(n.px, n.py, n.r, 0, TAU);
      g.fill(); g.stroke();
      // activity fill
      if (a > 0.01) { g.fillStyle = colKind[n.kind] || '#888'; g.globalAlpha = (dim ? 0.28 : 1) * (0.25 + 0.75 * a);
        g.beginPath(); if (n.kind === 'cmd') g.rect(n.px - n.r + 2, n.py - n.r + 2, n.r * 2 - 4, n.r * 2 - 4); else g.arc(n.px, n.py, Math.max(1.5, n.r - 2), 0, TAU); g.fill(); g.globalAlpha = dim ? 0.28 : 1; }
      if (isLes) { // crack
        g.strokeStyle = css('--bad'); g.lineWidth = 2.2;
        g.beginPath(); g.moveTo(n.px - n.r - 3, n.py - n.r - 3); g.lineTo(n.px + n.r + 3, n.py + n.r + 3); g.moveTo(n.px + n.r + 3, n.py - n.r - 3); g.lineTo(n.px - n.r - 3, n.py + n.r + 3); g.stroke();
      }
      if (mv) { // halo for operations
        g.strokeStyle = mv === 'boost' ? exc : inh; g.lineWidth = 2.5; g.setLineDash(mv === 'silence' ? [4, 3] : []);
        g.beginPath(); g.arc(n.px, n.py, n.r + 5 + Math.sin(this.t * 4) * 1, 0, TAU); g.stroke(); g.setLineDash([]);
        g.fillStyle = mv === 'boost' ? exc : inh; g.font = 'bold 12px system-ui'; g.textAlign = 'center';
        g.fillText(mv === 'boost' ? '+' : '−', n.px, n.py - n.r - 9);
      }
      if (n === this.sel) { g.strokeStyle = css('--accent'); g.lineWidth = 2; g.beginPath(); g.arc(n.px, n.py, n.r + 9, 0, TAU); g.stroke(); }
      g.globalAlpha = 1;
      if (n.kind !== 'relay' || n === focus || this.moves.has(n.t) || isLes) {
        g.fillStyle = ink; g.font = (n.kind === 'relay' ? '11px' : '12px') + ' system-ui'; g.textAlign = n.kind === 'cmd' ? 'right' : n.kind === 'sensor' ? 'left' : 'center';
        const lx = n.kind === 'cmd' ? n.px - n.r - 5 : n.kind === 'sensor' ? n.px + n.r + 5 : n.px;
        const ly = n.kind === 'relay' ? n.py + n.r + 12 : n.py + 4;
        g.globalAlpha = dim ? 0.3 : 0.95; g.fillText(n.label || n.t, lx, ly); g.globalAlpha = 1;
      }
    }
  }
  silenced(t) { return this.moves.get(t) === 'silence'; }
  linked(n, f) { for (const e of this.edges) if ((e.a === n && e.b === f) || (e.b === n && e.a === f)) return true; return false; }
}

function bez(x0, y0, x1, y1, x2, y2, x3, y3, t) {
  const u = 1 - t;
  return { x: u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3, y: u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3 };
}
function hexA(c, a) {
  if (c.startsWith('#')) {
    let h = c.slice(1); if (h.length === 3) h = h.split('').map((x) => x + x).join('');
    const n = parseInt(h, 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
  return c.replace(')', `,${a})`).replace('rgb(', 'rgba(');
}
