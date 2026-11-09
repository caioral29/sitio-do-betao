import * as THREE from 'three';
import { Batcher } from './world.js';
import { mulberry32 } from './config.js';

// Rede de dormir amarrada entre dois coqueiros.
// Referencial local do grupo: origem no meio da linha das amarrações,
// +Z aponta do coqueiro A para o B, +Y para cima. O balanço gira em torno de Z.

const TIE_Y = 1.75; // altura das amarrações no tronco
const SAG = 1.0; // quanto o fundo do pano fica abaixo das amarrações
const END_DROP = 0.5; // altura das pontas do pano (abaixo das amarrações)
const ROPE_LEN = 0.95; // comprimento dos punhos (cordas) até o pano

// centro do tronco do coqueiro numa altura y (os troncos são inclinados)
function trunkAt(palm, y) {
  const segs = 11;
  const t = Math.max(0, y / (palm.height / segs) - 0.5) / segs;
  const off = palm.lean * t * t;
  return new THREE.Vector3(palm.x + Math.cos(palm.leanA) * off, y, palm.z + Math.sin(palm.leanA) * off);
}

export function buildHammock(scene, world, material, palmA, palmB) {
  const R = mulberry32(77);
  const ca = trunkAt(palmA, TIE_Y), cb = trunkAt(palmB, TIE_Y);
  const dir = cb.clone().sub(ca).setY(0).normalize();
  const tieA = ca.clone().addScaledVector(dir, 0.24);
  const tieB = cb.clone().addScaledVector(dir, -0.24);
  const span = tieA.distanceTo(tieB);
  const half = span / 2;
  const mid = tieA.clone().add(tieB).multiplyScalar(0.5);
  const yaw = Math.atan2(dir.x, dir.z);

  const group = new THREE.Group();
  group.position.copy(mid);
  group.rotation.order = 'YXZ';
  group.rotation.y = yaw;
  scene.add(group);

  // perfil do pano: parábola das pontas (±zE, -END_DROP) até o fundo (0, -SAG)
  const zE = half - ROPE_LEN;
  const bedY = (z) => -SAG + (SAG - END_DROP) * (z / zE) ** 2;
  const widthAt = (z) => 0.22 + 0.86 * Math.sqrt(Math.max(0, 1 - (z / zE) ** 2));

  const HB = new Batcher();
  // pano branco com traços beges
  const WHITE = '#f7f4ec', BEIGE = '#d8c3a0';
  const N = 22;
  for (let i = 0; i < N; i++) {
    const z0 = -zE + (2 * zE * i) / N, z1 = -zE + (2 * zE * (i + 1)) / N;
    const zc = (z0 + z1) / 2;
    const y0 = bedY(z0), y1 = bedY(z1);
    const yc = (y0 + y1) / 2;
    const len = Math.hypot(z1 - z0, y1 - y0) + 0.02;
    const rx = -Math.atan2(y1 - y0, z1 - z0);
    const w = widthAt(zc);
    const col = new THREE.Color(i % 4 === 1 ? BEIGE : WHITE).offsetHSL(0, 0, (R() - 0.5) * 0.02);
    // faixa do meio + laterais levantadas (a rede "abraça" quem deita)
    const wc = w * 0.5, ws = w * 0.3, tilt = 0.75;
    HB.box(wc, 0.04, len, col, 0, yc, zc, rx, 0, 0);
    for (const sd of [-1, 1]) {
      const sx = sd * (wc / 2 + (ws / 2) * Math.cos(tilt) - 0.01);
      const sy = yc + (ws / 2) * Math.sin(tilt);
      HB.box(ws, 0.04, len, col, sx, sy, zc, rx, 0, sd * tilt);
      // varanda (franja) pendurada nas bordas
      const ex = sd * (wc / 2 + ws * Math.cos(tilt) + 0.01);
      const ey = yc + ws * Math.sin(tilt);
      if (Math.abs(zc) < zE * 0.85) HB.box(0.025, 0.13 + (i % 2) * 0.05, len * 0.55, i % 2 ? WHITE : BEIGE, ex, ey - 0.08, zc, rx, 0, 0);
    }
  }
  // punhos: cordas que saem das amarrações e abrem até a ponta do pano
  const rope = '#e8dcc0';
  for (const s of [-1, 1]) {
    const tie = new THREE.Vector3(0, 0, s * half);
    const endY = bedY(zE);
    const endW = widthAt(zE * 0.97);
    for (let k = 0; k < 5; k++) {
      const lx = (k / 4 - 0.5) * endW * 1.1;
      const end = new THREE.Vector3(lx, endY + 0.04, s * zE);
      const c = tie.clone().add(end).multiplyScalar(0.5);
      const d = end.clone().sub(tie);
      const L = d.length();
      // caixa fina ao longo de d (Euler YXZ: yaw em torno de Y, depois pitch)
      const ry = Math.atan2(d.x, d.z);
      const rxx = -Math.atan2(d.y, Math.hypot(d.x, d.z));
      HB.box(0.025, 0.025, L, rope, c.x, c.y, c.z, rxx, ry, 0);
    }
    // nó onde as cordas se juntam ao pano
    HB.box(endW * 1.15, 0.07, 0.07, '#c9b48a', 0, endY + 0.04, s * zE);
  }
  const mesh = HB.build(material);
  group.add(mesh);

  // amarração enrolada no tronco (fica parada)
  const TB = new Batcher();
  for (const [palm, c] of [[palmA, ca], [palmB, cb]]) {
    // acompanha a largura/rotação do gomo do tronco nessa altura
    const seg = Math.floor(TIE_Y / (palm.height / 11));
    const tw = 0.46 - (seg / 11) * 0.1 + 0.05;
    for (let k = 0; k < 3; k++) TB.box(tw, 0.055, tw, k === 1 ? '#c9b48a' : rope, c.x - palm.x, TIE_Y - 0.06 + k * 0.06, c.z - palm.z, 0, seg * 0.35, 0);
    const ring = TB.build(material);
    palm.group.add(ring);
  }

  // colisão: o pano bloqueia a passagem
  for (const z of [-0.9, 0, 0.9]) {
    const p = group.localToWorld(new THREE.Vector3(0, 0, z));
    world.colliders.circles.push({ x: p.x, z: p.z, r: 0.42 });
  }

  const hammock = {
    group, yaw, mid, half, zE,
    swing: 0, swingV: 0, phase: R() * 6,
    occupied: false,
    // pontos para deitar/levantar (no chão, dos dois lados do pano)
    sides: [-1, 1].map((sd) => group.localToWorld(new THREE.Vector3(sd * 1.15, 0, 0)).setY(0)),
    // onde fica o pé do Betão deitado (referencial local), corpo na direção -Z
    lieLocal: new THREE.Vector3(0, -SAG + 0.2, 0.62),
    impulse(v) {
      this.swingV += v;
    },
    update(dt, time) {
      // pêndulo amortecido em torno da linha das amarrações
      const k = 3.2, damping = this.occupied ? 0.25 : 0.9;
      const wind = Math.sin(time * 0.9 + this.phase) * 0.02 + Math.sin(time * 0.37) * 0.015;
      const drive = this.occupied ? Math.sin(time * 1.75) * 0.06 : 0; // o Betão dá aquele empurrãozinho com o pé
      this.swingV += (-k * (this.swing - wind) - damping * this.swingV + drive) * dt;
      this.swing += this.swingV * dt;
      group.rotation.z = this.swing;
    },
  };
  return hammock;
}
