// Shared low-poly, toon-shaded 3D models: the flies (used in the menu, the fly chooser and the dungeon).
// Style note: flat-shaded facets, a 3-step toon ramp and a dark inverted-hull outline.
import * as THREE from '../vendor/three.module.min.js';

const ramp = new THREE.DataTexture(new Uint8Array([85, 160, 255]), 3, 1, THREE.RedFormat); ramp.minFilter = ramp.magFilter = THREE.NearestFilter; ramp.needsUpdate = true;
export const lam = (color, emissive = 0x000000, extra = {}) => new THREE.MeshToonMaterial({ color, emissive, gradientMap: ramp, flatShading: true, ...extra });
export const sph = new THREE.IcosahedronGeometry(0.5, 1);
export const cyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 6);
export const box = new THREE.BoxGeometry(1, 1, 1);
const OUTLINE = new THREE.MeshBasicMaterial({ color: 0x160d24, side: THREE.BackSide });
export function addOutlines(root, k = 1.08) {
  const list = []; root.traverse((o) => { if (o.isMesh && !o.userData.noOutline && !(o.material.transparent && o.material.opacity < 0.95) && !o.userData.skipOutline) list.push(o); });
  for (const m of list) { const o = new THREE.Mesh(m.geometry, OUTLINE); o.scale.setScalar(k); o.userData.noOutline = true; m.add(o); }
  return root;
}

export const FLYSPEC = {
  fruit: { thorax: 0xe8b45a, abdomen: 0xc98a3c, stripe: 0x5a3418, head: 0xf0c576, eye: 0xe8433a, eyeS: 1, scale: 1, wing: 0xe3f4ff, legs: 1 },
  house: { thorax: 0x8c93a8, abdomen: 0xb5bbd0, stripe: 0x2a2e40, head: 0xa3a9bd, eye: 0xff4d3d, eyeS: 1.4, scale: 1.18, wing: 0xeef2fa, legs: 1.05 },
  gnat: { thorax: 0x9a86c8, abdomen: 0x7a68a8, stripe: 0x2a2040, head: 0xb09ad8, eye: 0xff6b81, eyeS: 0.95, scale: 0.74, wing: 0xe9ecff, legs: 1.5 },
};

/** Build a fly facing +z. Returns {g, body, wings, parts, eyes, abdomen, legs, glow, setStats}. */
export function buildFly(type, glowTex = null) {
  const sp = FLYSPEC[type] || FLYSPEC.fruit; const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const th = new THREE.Mesh(sph, lam(sp.thorax, 0x2a1c0a)); th.scale.set(0.36, 0.32, 0.44); th.position.y = 0.06; body.add(th);
  const ab = new THREE.Mesh(sph, lam(sp.abdomen, 0x2a1c0a)); ab.scale.set(0.32, 0.28, 0.54); ab.position.set(0, 0.02, -0.42); body.add(ab);
  for (const z of [-0.28, -0.42, -0.56]) { const st = new THREE.Mesh(sph, lam(sp.stripe)); const w = 0.32 - Math.abs(z + 0.42) * 0.25; st.scale.set(w + 0.02, 0.29, 0.045); st.position.set(0, 0.025, z); st.userData.skipOutline = true; ab.add(st); st.position.set(0, 0, (z + 0.42) / 0.54 * 0.5); st.scale.set((w + 0.02) / 0.32 * 1.0, 1.02, 0.09); }
  const hd = new THREE.Mesh(sph, lam(sp.head, 0x2a1c0a)); hd.scale.set(0.26, 0.24, 0.24); hd.position.set(0, 0.07, 0.42); body.add(hd);
  const eyes = []; for (const s of [-1, 1]) { const e = new THREE.Mesh(sph, lam(sp.eye, 0x701010)); e.scale.setScalar(0.18 * sp.eyeS); e.position.set(0.13 * s, 0.1, 0.49); body.add(e); eyes.push(e); const hl = new THREE.Mesh(sph, new THREE.MeshBasicMaterial({ color: 0xffffff })); hl.scale.setScalar(0.28); hl.position.set(0.12, 0.2, 0.3); hl.userData.skipOutline = true; e.add(hl); }
  const wm = new THREE.MeshBasicMaterial({ color: sp.wing, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false });
  const wings = [-1, 1].map((s) => { const p = new THREE.Group(); p.position.set(0.1 * s, 0.24, 0); const w = new THREE.Mesh(new THREE.CircleGeometry(0.42, 7), wm); w.scale.set(0.5, 1, 1); w.rotation.x = -Math.PI / 2; w.position.set(0.17 * s, 0, -0.34); w.userData.skipOutline = true; p.add(w); body.add(p); return { p, s }; });
  const legs = new THREE.Group(); const legMat = lam(0x3a2a1c);
  for (let i = 0; i < 3; i++) for (const s of [-1, 1]) { const l = new THREE.Mesh(cyl, legMat); l.scale.set(0.035, 0.3 * sp.legs, 0.035); l.position.set(0.15 * s, -0.08, 0.14 - i * 0.17); l.rotation.z = -0.85 * s; l.rotation.x = (i - 1) * 0.35; l.userData.skipOutline = true; legs.add(l); }
  body.add(legs);
  let glow = null; if (glowTex) { glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffd45e, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false })); glow.scale.set(1.9, 1.9, 1); glow.position.y = -0.05; g.add(glow); }
  addOutlines(g, 1.09); g.userData.fly = true;
  const m = { g, body, wings, parts: [th, ab, hd], eyes, abdomen: ab, legs, glow, spec: sp, flapSpeed: 50, flapAmp: 0.7, baseScale: sp.scale };
  m.setStats = (st) => {                       // the body visibly reflects the chosen stats
    if (!st) return; const e = 0.72 + 0.075 * st.senses; eyes.forEach((q) => q.scale.setScalar(0.18 * sp.eyeS * e));
    ab.scale.set(0.32 * (0.86 + 0.05 * st.stamina), 0.28 * (0.86 + 0.05 * st.stamina), 0.54 * (0.88 + 0.05 * st.stamina));
    legs.children.forEach((l) => { l.scale.y = 0.3 * sp.legs * (0.75 + 0.08 * st.reflex); });
    m.flapSpeed = 34 + 9 * st.speed; m.flapAmp = 0.45 + 0.04 * st.speed;
    wings.forEach((w) => w.p.children[0].scale.set(0.5, 0.8 + 0.05 * st.speed, 1));
  };
  g.scale.setScalar(sp.scale); return m;
}
