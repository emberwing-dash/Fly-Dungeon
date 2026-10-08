import { Brain, PARAMS, readout } from './sim.js';
import { FlyStage } from './fly.js';
import { CircuitMap } from './graph.js';
import { Resident } from './resident.js';

const $ = (s) => document.querySelector(s);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const STORE = 'flyfix.v1';
const KIND_LABEL = { nudge: 'Nudge +', drive: 'Drive ++', silence: 'Silence −' };

let data, brain, resident, report = {};
let cur = null, moves = [], I = null, stage, map, nets = {};
let live = { y: {}, ratio: {}, score: 0 };
let shown = {};                 // smoothed meter values
let lastPred = null, popNode = null;

// ---------- persistence ----------
function load() { try { return JSON.parse(localStorage.getItem(STORE)) || { fixes: {} }; } catch { return { fixes: {} }; } }
function save(s) { try { localStorage.setItem(STORE, JSON.stringify(s)); } catch { /* private mode */ } }
let store = load();

// ---------- boot ----------
async function boot() {
  try {
    const [cases, bj, bb] = await Promise.all([
      fetch('data/cases.json').then((r) => r.json()),
      fetch('data/brain.json').then((r) => r.json()),
      fetch('data/brain.bin').then((r) => r.arrayBuffer()),
    ]);
    data = cases;
    Object.assign(PARAMS, bj.params);
    brain = new Brain(bj, bb);
    fetch('data/resident.json').then((r) => r.json()).then((j) => { resident = new Resident(j, data.order); nets = {}; refreshResident(); }).catch(() => {});
    fetch('data/resident_report.json').then((r) => r.json()).then((j) => { report = j; refreshResident(); }).catch(() => {});
  } catch (e) {
    document.body.insertAdjacentHTML('afterbegin', `<p style="padding:20px">Could not load game data (${e}). Serve this folder over http (e.g. <code>python -m http.server</code>).</p>`);
    return;
  }
  stage = new FlyStage($('#stage'));
  map = new CircuitMap($('#circuit'), { onPick, onHover });
  buildTabs();
  wire();
  const qs = new URLSearchParams(location.search);     // read before selectCase() rewrites the URL
  const first = qs.get('case');
  selectCase(Math.max(0, data.cases.findIndex((c) => c.id === first)));
  if (qs.get('fix')) { moves = cur.par.moves.map(([t, kind]) => ({ t, kind })); simulate(); }
  if (qs.get('intro') !== '0' && !localStorage.getItem(STORE + '.seen')) { try { localStorage.setItem(STORE + '.seen', '1'); } catch {} $('#dlgHow').showModal(); }
  requestAnimationFrame(tickMeters);
}

// ---------- case handling ----------
function buildTabs() {
  const nav = $('#caseTabs'); nav.innerHTML = '';
  data.cases.forEach((c, i) => {
    const b = document.createElement('button');
    b.className = 'case-tab'; b.dataset.i = i;
    b.innerHTML = `<span class="em">${c.emoji}</span><span>${c.title}</span><span class="stars" id="st-${c.id}"></span>`;
    b.addEventListener('click', () => selectCase(i));
    nav.appendChild(b);
  });
  refreshStars();
}
function starsFor(c, score) { const t3 = Math.min(90, c.par.score), t2 = t3 - 12, t1 = t3 - 28; return score >= t3 ? 3 : score >= t2 ? 2 : score >= t1 ? 1 : 0; }
function refreshStars() {
  for (const c of data.cases) {
    const f = store.fixes[c.id], el = $('#st-' + c.id);
    if (el) el.textContent = f ? '★'.repeat(starsFor(c, f.score)) + '☆'.repeat(3 - starsFor(c, f.score)) : '☆☆☆';
  }
}

function selectCase(i) {
  cur = data.cases[i];
  document.querySelectorAll('.case-tab').forEach((b) => b.setAttribute('aria-current', String(+b.dataset.i === i)));
  moves = []; lastPred = null; popNode = null; hidePop();
  I = brain.drive(cur.stimulus.types, cur.stimulus.strength);
  const nodes = cur.nodes.map((n) => ({ ...n, label: n.t }));
  map.setGraph(nodes, cur.edges);
  map.lesion = new Set(cur.lesion);
  map.moves = new Map();
  $('#caseChip').textContent = `${cur.level} · ${cur.target}`;
  $('#brief').innerHTML = `<b>${cur.emoji} ${cur.title}.</b> ${cur.story}<span class="goal">🎯 ${cur.goal}</span>`;
  buildMeters();
  buildTypeList();
  $('#residentList').innerHTML = '';
  $('#residentMsg').textContent = resident ? 'A small neural network trained on thousands of simulated operations. It proposes; the simulator decides.' : 'Loading the Resident…';
  $('#saveMsg').textContent = '';
  const fc = cur.fullcheck, v = $('#verify');
  if (fc) {
    const ok = fc.par_ratio >= 0.85 && fc.par_ratio <= 1.15;
    v.className = 'verify ' + (ok ? 'ok' : 'warn');
    v.textContent = ok
      ? `The reference fix was re-checked on the full 165,122-neuron connectome: ${Math.round(fc.par_ratio * 100)}% of healthy (damaged: ${Math.round(fc.lesioned_ratio * 100)}%).`
      : `Reality check: on the full 165,122-neuron connectome the reference fix lands at ${Math.round(fc.par_ratio * 100)}% of healthy, not ~100%. Cutting the circuit down to a subgraph changed the answer, so treat fixes here as hypotheses.`;
  } else v.textContent = '';
  stage.set(cur.scenario, {});
  simulate();
  const u = new URL(location.href); u.searchParams.set('case', cur.id); u.searchParams.delete('fix');
  history.replaceState(null, '', u);
}

// ---------- simulation + scoring ----------
function simulate() {
  const sil = new Set(cur.lesion.map((t) => brain.typeId(t)));
  const boo = new Map();
  for (const m of moves) {
    const id = brain.typeId(m.t);
    if (id === undefined) continue;
    if (m.kind === 'silence') sil.add(id); else boo.set(id, m.kind === 'nudge' ? PARAMS.NUDGE : PARAMS.DRIVE);
  }
  brain.run(I, sil, boo);
  const act = brain.typeActivity();
  const y = readout(brain, data.behaviours, act);
  const h = cur.healthy, j = cur.target;
  const ratio = {}; for (const b of data.order) ratio[b] = y[b] / Math.max(h[j], 1e-9);
  const acc = clamp(1 - Math.abs(ratio[j] - 1), 0, 1);
  let col = 0, colB = null;
  for (const b of data.order) if (b !== j) { const c = (y[b] - h[b]) / Math.max(h[j], 1e-9); if (c > col) { col = c; colB = b; } }
  col = clamp(col, 0, 1);
  const cost = moves.reduce((s, m) => s + data.costs[m.kind], 0);
  const score = Math.round(100 * acc - 60 * col - 2 * moves.length);
  live = { y, ratio, acc, col, colB, cost, score, act };
  map.act = new Map(brain.types.map((t, i) => [t.name, act[i]]));
  map.moves = new Map(moves.map((m) => [m.t, m.kind]));
  renderScore(); renderMoves(); updateStage();
  map.draw();
}

function updateStage() {
  const r = live.ratio; const b = {};
  for (const k of data.order) b[k] = clamp(r[k], 0, 1.2);
  stage.set(cur.scenario, b);
  const j = cur.target, v = r[j];
  $('#stageBadge').textContent = v >= 0.9 && v <= 1.1 ? '✔ healthy response' : v < 0.9 ? `⚠ impaired (${Math.round(v * 100)}%)` : `⚠ over-reacting (${Math.round(v * 100)}%)`;
}

function renderScore() {
  const c = cur, s = live.score, st = starsFor(c, s), won = st >= 1;
  const el = $('#scoreCard');
  el.className = 'score' + (st >= 2 ? ' win' : '');
  el.innerHTML = `
    <div class="big">${s}</div>
    <div class="stars">${'★'.repeat(st)}${'☆'.repeat(3 - st)}</div>
    <div class="line">Target <b>${Math.round(live.ratio[c.target] * 100)}%</b> of healthy &middot; accuracy <b>${Math.round(live.acc * 100)}%</b></div>
    <div class="line">Collateral <b>${Math.round(live.col * 100)}%</b>${live.col > 0.02 && live.colB ? ` (${data.behaviours[live.colB].label})` : ''} &middot; par <b>${c.par.score}</b></div>`;
  $('#budgetChip').textContent = `${live.cost} / ${data.budget} points`;
}

function renderMoves() {
  const ul = $('#moveList'); ul.innerHTML = '';
  if (!moves.length) { ul.innerHTML = '<li class="empty">No operations yet. Click a node on the map.</li>'; }
  moves.forEach((m, i) => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="kind ${m.kind === 'silence' ? 'silence' : 'boost'}">${KIND_LABEL[m.kind]}</span><span class="nm" title="${m.t}">${m.t}</span><span class="muted">${data.costs[m.kind]}pt</span>`;
    const x = document.createElement('button'); x.textContent = '×'; x.setAttribute('aria-label', 'Remove ' + m.t);
    x.addEventListener('click', () => { moves.splice(i, 1); simulate(); });
    li.appendChild(x); ul.appendChild(li);
  });
}

// ---------- meters ----------
function buildMeters() {
  const box = $('#meters'); box.innerHTML = '';
  for (const b of data.order) {
    const d = document.createElement('div'); d.className = 'meter' + (b === cur.target ? ' target' : ''); d.id = 'm-' + b;
    d.innerHTML = `<span class="name" title="${data.behaviours[b].note}">${data.behaviours[b].emoji} ${data.behaviours[b].label}</span><span class="bar"><span class="fill"></span><span class="ghost-mark"></span></span><span class="val"></span>`;
    box.appendChild(d);
  }
  shown = {};
}
function tickMeters() {
  if (cur) for (const b of data.order) {
    const target = live.ratio?.[b] ?? 0;
    shown[b] = (shown[b] ?? 0) + (target - (shown[b] ?? 0)) * 0.18;
    const el = $('#m-' + b); if (!el) continue;
    const v = shown[b], hb = b === cur.target ? 1 : cur.healthy[b] / Math.max(cur.healthy[cur.target], 1e-9);
    el.querySelector('.fill').style.width = clamp(v / 1.5, 0, 1) * 100 + '%';
    el.querySelector('.ghost-mark').style.left = clamp(hb / 1.5, 0, 1) * 100 + '%';
    el.querySelector('.val').textContent = Math.round(v * 100) + '%';
    el.classList.toggle('bad', b !== cur.target && v - hb > 0.08);
  }
  requestAnimationFrame(tickMeters);
}

// ---------- map interaction ----------
function typeInfo(name) {
  const node = cur.nodes.find((n) => n.t === name);
  return node;
}
function onHover(node, ev) {
  const tip = $('#tip');
  if (!node) { tip.classList.remove('on'); return; }
  const a = map.act.get(node.t) || 0;
  tip.innerHTML = `<b>${node.t}</b>${node.n} neurons &middot; ${node.nt < 0 ? 'inhibitory' : 'excitatory'} &middot; ${roleOf(node)}<br>activity ${Math.round(a * 100)}%`;
  tip.style.left = Math.min(ev.x + 14, map.W - 250) + 'px'; tip.style.top = Math.max(ev.y - 10, 4) + 'px';
  tip.classList.add('on');
}
function roleOf(n) {
  if (cur.lesion.includes(n.t)) return 'damaged';
  return n.kind === 'sensor' ? 'sensor' : n.kind === 'cmd' ? 'command (read-only)' : 'relay';
}
function onPick(node, ev) {
  hidePop();
  if (!node) return;
  popNode = node;
  const pop = document.createElement('div'); pop.className = 'pop'; pop.id = 'pop';
  const mv = moves.find((m) => m.t === node.t);
  const locked = cur.lesion.includes(node.t) || node.kind === 'cmd';
  const left = clamp(node.px + 16, 6, map.W - 240), top = clamp(node.py - 20, 6, map.H - 170);
  pop.style.left = left + 'px'; pop.style.top = top + 'px';
  const room = (k) => live.cost - (mv ? data.costs[mv.kind] : 0) + data.costs[k] <= data.budget;
  pop.innerHTML = `<h4>${node.t}</h4><div class="sub">${node.n} neurons &middot; ${node.nt < 0 ? 'inhibitory' : 'excitatory'} &middot; ${roleOf(node)}</div>` + (locked
    ? `<div class="muted">${node.kind === 'cmd' ? 'This is the output. You can only operate on the circuit that feeds it.' : 'Destroyed. Route around it.'}</div>`
    : `<div class="btns">
        <button class="b" data-k="nudge" ${room('nudge') ? '' : 'disabled'}>Nudge + <small>1</small></button>
        <button class="b" data-k="drive" ${room('drive') ? '' : 'disabled'}>Drive ++ <small>2</small></button>
        <button class="s" data-k="silence" ${room('silence') ? '' : 'disabled'}>Silence − <small>1</small></button>
        ${mv ? '<button data-k="clear">Clear</button>' : ''}</div>`);
  $('.canvas-wrap').appendChild(pop);
  pop.querySelectorAll('button').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); applyMove(node.t, b.dataset.k); hidePop(); }));
}
function hidePop() { $('#pop')?.remove(); }
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hidePop(); });

function applyMove(t, kind) {
  const i = moves.findIndex((m) => m.t === t);
  if (kind === 'clear') { if (i >= 0) moves.splice(i, 1); }
  else if (i >= 0) moves[i].kind = kind; else moves.push({ t, kind });
  simulate();
}

// ---------- type finder ----------
function buildTypeList() {
  const q = ($('#search').value || '').trim().toLowerCase();
  const ul = $('#typeList'); ul.innerHTML = '';
  const list = cur.nodes.filter((n) => !q || n.t.toLowerCase().includes(q)).sort((a, b) => a.x - b.x);
  for (const n of list.slice(0, 80)) {
    const li = document.createElement('li'); const b = document.createElement('button');
    b.innerHTML = `<span>${n.t}</span><span class="muted">${roleOf(n)}</span>`;
    b.addEventListener('click', () => { map.sel = map.byName.get(n.t); onPick(map.byName.get(n.t)); });
    li.appendChild(b); ul.appendChild(li);
  }
}

// ---------- AI Resident ----------
function getNet() { if (!resident) return null; if (!nets[cur.id]) nets[cur.id] = resident.load(cur.id); return nets[cur.id]; }
function predScore(pred, nMoves) {
  const ro = data.resident_order;                       // output order of the trained networks
  const j = ro.indexOf(cur.target);
  const ratio = pred[j], acc = clamp(1 - Math.abs(ratio - 1), 0, 1);
  let col = 0;
  ro.forEach((b, k) => { if (k === j) return; const hb = cur.healthy[b] / Math.max(cur.healthy[cur.target], 1e-9); col = Math.max(col, pred[k] - hb); });
  return Math.round(100 * acc - 60 * clamp(col, 0, 1) - 2 * nMoves);
}
function refreshResident() { if (!cur) return; const rep = report[cur.id]; $('#residentMsg').textContent = resident ? `A small neural network trained on thousands of simulated operations${rep ? ` (held-out score correlation r = ${rep.score_corr})` : ''}. It proposes; the simulator decides.` : 'Loading the Resident…'; }
function askResident() {
  const net = getNet(); if (!net) return;
  const used = new Set(moves.map((m) => m.t)), out = [];
  for (const t of net.ops) {
    if (used.has(t)) continue;
    for (const kind of ['nudge', 'drive', 'silence']) {
      if (live.cost + data.costs[kind] > data.budget) continue;
      const p = predScore(resident.predict(net, [...moves, { t, kind }]), moves.length + 1);
      out.push({ t, kind, p });
    }
  }
  out.sort((a, b) => b.p - a.p);
  const box = $('#residentList'); box.innerHTML = '';
  for (const s of out.slice(0, 3)) {
    const b = document.createElement('button');
    b.innerHTML = `<span class="kind ${s.kind === 'silence' ? 'silence' : 'boost'}">${KIND_LABEL[s.kind]}</span><span>${s.t}</span><span class="pred">~${s.p}</span>`;
    b.addEventListener('click', () => { lastPred = s.p; applyMove(s.t, s.kind); setTimeout(() => { $('#residentMsg').textContent = `Resident predicted ${s.p}. The simulator says ${live.score}. ${Math.abs(live.score - s.p) <= 6 ? 'Close.' : 'Off by ' + Math.abs(live.score - s.p) + ': always trust the simulator over the model.'}`; }, 0); });
    box.appendChild(b);
  }
  if (!out.length) box.innerHTML = '<p class="muted">No budget left for another operation.</p>';
}

// ---------- save / export ----------
function toast(msg) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; t.setAttribute('role', 'status'); document.body.appendChild(t); setTimeout(() => t.remove(), 2800); }
function saveFix() {
  if (!moves.length) { $('#saveMsg').textContent = 'Make at least one operation first.'; return; }
  const prev = store.fixes[cur.id];
  const entry = { score: live.score, acc: +live.acc.toFixed(3), col: +live.col.toFixed(3), cost: live.cost, moves: moves.map((m) => ({ ...m })), at: new Date().toISOString() };
  if (!prev || entry.score >= prev.score) { store.fixes[cur.id] = entry; save(store); refreshStars(); $('#saveMsg').textContent = prev && entry.score <= prev.score ? 'Saved (ties your best).' : 'Saved as your best fix!'; if (starsFor(cur, entry.score) >= 2) toast(entry.score > cur.par.score ? 'You beat the automated search!' : 'Case solved!'); }
  else $('#saveMsg').textContent = `Not saved: your best is ${prev.score}.`;
}
function exportCase() {
  const out = {
    format: 'flyfix-case-file/1',
    note: 'Candidate rewirings found by players on a rate model of a pathway subgraph of the male-CNS connectome. These are hypotheses to test, not results.',
    simulator: { ...PARAMS, neurons: brain.n },
    fixes: Object.entries(store.fixes).map(([id, f]) => {
      const c = data.cases.find((x) => x.id === id);
      return { case: id, scenario: c.scenario, target: c.target, lesion: c.lesion, ...f, par: c.par.score };
    }),
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = 'flyfix-case-file.json'; a.click(); URL.revokeObjectURL(url);
}

// ---------- wiring ----------
function wire() {
  $('#btnClear').addEventListener('click', () => { moves = []; hidePop(); simulate(); });
  $('#btnSave').addEventListener('click', saveFix);
  $('#btnAsk').addEventListener('click', askResident);
  $('#btnPar').addEventListener('click', () => { moves = cur.par.moves.map(([t, kind]) => ({ t, kind })); hidePop(); simulate(); toast('Reference fix applied. Can you beat it with fewer points?'); });
  $('#btnExport').addEventListener('click', exportCase);
  $('#btnHow').addEventListener('click', () => $('#dlgHow').showModal());
  $('#search').addEventListener('input', buildTypeList);
  $('#btnTheme').addEventListener('click', () => {
    const r = document.documentElement; const dark = (r.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')) === 'dark';
    r.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem(STORE + '.theme', r.dataset.theme); } catch {}
  });
  try { const th = localStorage.getItem(STORE + '.theme'); if (th) document.documentElement.dataset.theme = th; } catch {}
  document.addEventListener('click', (e) => { if (!e.target.closest('.pop') && !e.target.closest('#circuit')) hidePop(); });
}

boot();
