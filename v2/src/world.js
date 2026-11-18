import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  RIVER, riverCenter, isWater, BRIDGE, DECK, GATE, PED_GATE, FENCE_Z, NORTH_FENCE_Z,
  bridgeHeight, mulberry32, HOUSE_EXT, clamp,
} from './config.js';
import { M, Kit, makeMaterials, occ, canvasTex, taperTube, rbox, patchMaterial } from './kit.js';
import { F, makeFloraMaterials, treeGeometry, buildPalmModel, bananaGeometry, scatterGrass, scatterModel } from './flora.js';
import { groundY, SPLAT } from './terrain.js';
import { assets } from './assets.js';
import { buildHammock } from './hammock.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _c = new THREE.Color();

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();

// Lote simples com cor por vértice (usado pelo interior da Strada e por peças pequenas)
export class Batcher {
  constructor() {
    this.parts = [];
  }
  add(geo, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    _e.set(rx, ry, rz, 'YXZ');
    _q.setFromEuler(_e);
    _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
    g.applyMatrix4(_m);
    if (color && color.isColor) _c.copy(color);
    else _c.set(color);
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      arr[i * 3] = _c.r;
      arr[i * 3 + 1] = _c.g;
      arr[i * 3 + 2] = _c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    g.clearGroups();
    this.parts.push(g);
  }
  box(w, h, d, color, x, y, z, rx = 0, ry = 0, rz = 0, r = 0) {
    if (r > 0) this.add(rbox(w, h, d, r), color, x, y, z, rx, ry, rz);
    else this.add(UNIT_BOX, color, x, y, z, rx, ry, rz, w, h, d);
  }
  build(material, { cast = true, receive = true } = {}) {
    if (!this.parts.length) return null;
    const g = mergeGeometries(this.parts, false);
    this.parts.length = 0;
    const mesh = new THREE.Mesh(g, material);
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    return mesh;
  }
}

// garante cor por vértice (materiais do kit usam vertexColors)
export function withColor(g, hex = '#ffffff') {
  if (g.attributes.color) return g;
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

// cores (tons multiplicados pelas texturas)
const C = {
  woodDark: '#6e4a2e', wood: '#a8794e', woodWarm: '#c4855a', woodLight: '#d9a877', white: '#f4f1ea', cream: '#f3ead6',
  wall: '#fbf6ec', band: '#a39b8f', stone: '#d8d0c2', tile: '#c9785a', frame: '#7a4a2a', shutter: '#8a5634', door: '#8d5333',
  ironDark: '#2d2c2b',
};

export function buildWorld(scene) {
  makeMaterials();
  makeFloraMaterials();
  const R = mulberry32(1337);
  const jit = (hex, amt = 0.06) => new THREE.Color(hex).offsetHSL(0, 0, (R() - 0.5) * amt);

  const K = new Kit(); // tudo que é estático
  const world = {
    colliders: { circles: [], boxes: [] },
    benches: [],
    palms: [],
    clouds: [],
    lamps: [],
    gate: null,
    door: { x: 10.9, z: 1.75 },
    sign: { x: 5.5, z: -16.4 },
    canopies: [],
    occ,
  };
  const circle = (x, z, r) => world.colliders.circles.push({ x, z, r });
  const boxC = (x0, x1, z0, z1, extra = {}) => {
    const b = { x0, x1, z0, z1, active: true, ...extra };
    world.colliders.boxes.push(b);
    return b;
  };

  const windowMat = new THREE.MeshStandardMaterial({
    color: '#36505f', roughness: 0.08, metalness: 0.2, emissive: '#ffb55a', emissiveIntensity: 0, envMapIntensity: 1.6,
  });
  patchMaterial(windowMat);
  const lampMat = new THREE.MeshStandardMaterial({ color: '#fff3c4', emissive: '#ffcf6b', emissiveIntensity: 0, roughness: 0.3 });
  world.windowMat = windowMat;
  world.lampMat = lampMat;
  const glass = []; // geometrias de vidro (brilham à noite)
  const addGlass = (w, h, d, x, y, z, ry = 0) => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.rotateY(ry);
    g.translate(x, y, z);
    glass.push(g.toNonIndexed());
  };

  // ============================================================ peças
  function bench(x, z, yaw, baseY = 0, name = 'banco') {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const P = (lx, ly, lz) => [x + lx * c + lz * s, baseY + ly, z - lx * s + lz * c];
    // ripas de madeira + pés de ferro fundido escuros
    for (const lz of [-0.17, 0.0, 0.17]) K.box('wood', 1.8, 0.06, 0.15, jit(C.woodWarm, 0.05), ...P(0, 0.46, lz), 0, yaw, 0, 0.025);
    for (const yy of [0.68, 0.84, 1.0]) K.box('wood', 1.8, 0.11, 0.05, jit(C.woodWarm, 0.05), ...P(0, yy, -0.25 - (yy - 0.68) * 0.12), -0.14, yaw, 0, 0.02);
    for (const lx of [-0.78, 0.78]) {
      K.box('metal', 0.07, 0.46, 0.07, C.ironDark, ...P(lx, 0.23, 0.17), 0, yaw, 0, 0.02);
      K.box('metal', 0.07, 1.05, 0.07, C.ironDark, ...P(lx, 0.52, -0.25), -0.12, yaw, 0, 0.02);
      K.box('metal', 0.06, 0.06, 0.5, C.ironDark, ...P(lx, 0.42, -0.02), 0, yaw, 0, 0.02);
      // braço
      K.box('metal', 0.06, 0.05, 0.5, C.ironDark, ...P(lx + Math.sign(lx) * 0.02, 0.68, -0.02), 0, yaw, 0, 0.02);
      K.box('metal', 0.05, 0.24, 0.05, C.ironDark, ...P(lx + Math.sign(lx) * 0.02, 0.56, 0.2), 0, yaw, 0, 0.02);
    }
    const seat = P(0, 0.495, 0.0);
    const front = P(0, 0, 0.75);
    world.benches.push({ name, x: seat[0], z: seat[2], seatTop: seat[1], yaw, front: { x: front[0], z: front[2] } });
    const a = P(-0.5, 0, -0.05), b = P(0.5, 0, -0.05);
    circle(a[0], a[2], 0.42);
    circle(b[0], b[2], 0.42);
  }

  // cerca de madeira com mourões e duas travessas; skip = vão sem cerca
  function fenceLine(x0, x1, z, skip = null) {
    for (let x = x0; x <= x1 + 0.001; x += 2) {
      if (!(skip && x > skip[0] + 0.01 && x < skip[1] - 0.01)) {
        K.box('wood', 0.2, 1.36, 0.2, jit(C.woodDark, 0.06), x, 0.64, z, 0, (R() - 0.5) * 0.1, (R() - 0.5) * 0.03, 0.05);
        K.box('paint', 0.26, 0.07, 0.26, C.cream, x, 1.33, z, 0, 0, 0, 0.025);
      }
      if (x + 2 > x1 + 0.001) continue;
      const pieces = skip ? [[x, Math.min(x + 2, skip[0])], [Math.max(x, skip[1]), x + 2]] : [[x, x + 2]];
      for (const [a, b] of pieces) {
        if (b - a < 0.05) continue;
        K.box('wood', b - a, 0.13, 0.07, jit(C.wood, 0.06), (a + b) / 2, 0.5, z + 0.12, 0, 0, (R() - 0.5) * 0.01, 0.025);
        K.box('wood', b - a, 0.13, 0.07, jit(C.wood, 0.06), (a + b) / 2, 0.95, z + 0.12, 0, 0, (R() - 0.5) * 0.01, 0.025);
      }
    }
  }

  // ======================================================================
  // CERCA DO SUL + PORTÃO
  fenceLine(-30, 30, FENCE_Z, [PED_GATE.x0, GATE.x1]);
  boxC(-40, PED_GATE.x0 + 0.1, FENCE_Z - 0.22, FENCE_Z + 0.25);
  boxC(GATE.x0 - 0.15, GATE.x0 + 0.1, FENCE_Z - 0.22, FENCE_Z + 0.25); // pilar do meio
  const pedBox = boxC(PED_GATE.x0, GATE.x0, FENCE_Z - 0.22, FENCE_Z + 0.25);
  boxC(GATE.x1 - 0.1, 40, FENCE_Z - 0.22, FENCE_Z + 0.25);
  const gateBox = boxC(GATE.x0, GATE.x1, FENCE_Z - 0.22, FENCE_Z + 0.25);
  {
    const gateGroup = new THREE.Group();
    const leaves = [];
    const gateLeaf = (GK, wLeaf, side, nS, zOff) => {
      for (let i = 0; i < nS; i++) {
        const lx = side * (0.14 + (i + 0.5) * (wLeaf / nS));
        GK.box('wood', wLeaf / nS - 0.04, 1.42, 0.06, jit('#7a4e2c', 0.07), lx, 0.2 + 0.71, 0, 0, 0, 0, 0.02);
      }
      GK.box('wood', wLeaf, 0.12, 0.06, '#5a3820', side * (0.14 + wLeaf / 2), 0.5, zOff, 0, 0, 0, 0.02);
      GK.box('wood', wLeaf, 0.12, 0.06, '#5a3820', side * (0.14 + wLeaf / 2), 1.3, zOff, 0, 0, 0, 0.02);
      GK.box('wood', 0.1, Math.hypot(wLeaf, 0.8), 0.06, '#5a3820', side * (0.14 + wLeaf / 2), 0.9, zOff, 0, 0, side * Math.atan2(wLeaf, 0.8), 0.02);
      GK.box('metal', 0.12, 0.05, 0.1, '#8d8a84', side * (0.14 + wLeaf - 0.08), 0.95, zOff * 1.6, 0, 0, 0, 0.015); // trinco
      // dobradiças
      for (const yy of [0.5, 1.3]) GK.box('metal', 0.16, 0.06, 0.08, '#3a3836', side * 0.2, yy, zOff * 1.4, 0, 0, 0, 0.01);
    };
    for (const side of [1, -1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side === 1 ? GATE.x0 + 0.16 : GATE.x1 - 0.16, 0, FENCE_Z + 0.02);
      const GK = new Kit();
      gateLeaf(GK, (GATE.x1 - GATE.x0) / 2 - 0.32, side, 7, 0.06);
      GK.build(pivot);
      gateGroup.add(pivot);
      leaves.push({ pivot, side });
    }
    // portãozinho de pedestre: uma folha só, abre pra dentro do quintal
    const pedPivot = new THREE.Group();
    pedPivot.position.set(PED_GATE.x0 + 0.16, 0, FENCE_Z + 0.02);
    {
      const GK = new Kit();
      gateLeaf(GK, PED_GATE.x1 - PED_GATE.x0 - 0.32, 1, 4, -0.06);
      // (o desenho espelha a folha pra dentro: desloca as peças pro lugar certo)
      const tmp = new THREE.Group();
      GK.build(tmp);
      tmp.position.x = -0.14;
      pedPivot.add(tmp);
    }
    gateGroup.add(pedPivot);
    // pilares do portão (alvenaria branca com capitel)
    for (const gx of [PED_GATE.x0, GATE.x0, GATE.x1]) {
      K.box('plaster', 0.4, 1.75, 0.4, C.wall, gx, 0.875, FENCE_Z, 0, 0, 0, 0.03);
      K.box('stone', 0.46, 0.3, 0.46, C.stone, gx, 0.15, FENCE_Z, 0, 0, 0, 0.04);
      K.box('paint', 0.5, 0.1, 0.5, C.cream, gx, 1.8, FENCE_Z, 0, 0, 0, 0.03);
    }
    scene.add(gateGroup);
    gateGroup.traverse((o) => {
      if (o.isMesh) o.castShadow = o.receiveShadow = true;
    });
    const leafBoxes = [
      { x0: GATE.x0 + 0.02, x1: GATE.x0 + 0.3, z0: FENCE_Z, z1: FENCE_Z + 1.85, active: false },
      { x0: GATE.x1 - 0.3, x1: GATE.x1 - 0.02, z0: FENCE_Z, z1: FENCE_Z + 1.85, active: false },
    ];
    world.gate = { leaves, leafBoxes, open: false, t: 0, collider: gateBox, x: (GATE.x0 + GATE.x1) / 2, z: FENCE_Z - 0.9 };
    world.pedGate = { pivot: pedPivot, open: false, t: 0, collider: pedBox, x: (PED_GATE.x0 + PED_GATE.x1) / 2 };
  }
  // calçada de tijolinho na frente do portão
  for (let i = 0; i < 4; i++) K.box('tile', 0.95, 0.05, 0.8, jit('#d07e52', 0.06), GATE.x0 + 0.5 + i, 0.01, 18.2, 0, 0, 0, 0.02);
  K.box('tile', 0.95, 0.05, 0.8, '#c87a50', (PED_GATE.x0 + PED_GATE.x1) / 2, 0.01, 18.2, 0, 0, 0, 0.02);

  // CERCA DO NORTE + placa
  fenceLine(-30, 30, NORTH_FENCE_Z);
  boxC(-40, 40, NORTH_FENCE_Z - 0.3, NORTH_FENCE_Z + 0.3);
  {
    const sx = world.sign.x, sz = NORTH_FENCE_Z + 0.45;
    for (const ox of [-0.85, 0.85]) K.box('wood', 0.16, 1.5, 0.16, C.woodDark, sx + ox, 0.75, sz, 0, 0, 0, 0.04);
    K.box('wood', 2.15, 1.08, 0.12, '#9c6a40', sx, 1.55, sz + 0.06, 0, 0, 0, 0.04);
    K.box('wood', 2.3, 0.1, 0.18, '#6e4a2e', sx, 2.13, sz + 0.06, 0, 0, 0, 0.03);
    const signTex = canvasTex(1024, 512, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = 'rgba(50,28,12,0.55)';
      g.font = '600 150px "Fredoka", "Nunito", sans-serif';
      g.fillText('SÍTIO DO', w / 2 + 5, 165 + 6);
      g.font = '700 210px "Fredoka", "Nunito", sans-serif';
      g.fillText('BETÃO', w / 2 + 6, 350 + 7);
      g.fillStyle = '#fff3dc';
      g.font = '600 150px "Fredoka", "Nunito", sans-serif';
      g.fillText('SÍTIO DO', w / 2, 165);
      g.font = '700 210px "Fredoka", "Nunito", sans-serif';
      g.fillText('BETÃO', w / 2, 350);
    }, { repeat: false });
    const face = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 1.0), new THREE.MeshStandardMaterial({ map: signTex, transparent: true, roughness: 0.8 }));
    face.position.set(sx, 1.55, sz + 0.125);
    scene.add(face);
    circle(sx - 0.85, sz, 0.25);
    circle(sx + 0.85, sz, 0.25);
  }

  // ======================================================================
  // DECK sobre o rio
  {
    const { x0, x1, z0, z1, y } = DECK;
    for (const [px, pz] of [[x0 + 0.15, z0 + 0.15], [x1 - 0.15, z0 + 0.15], [x0 + 0.15, z1 - 0.2], [x1 - 0.15, z1 - 0.2], [(x0 + x1) / 2, z0 + 0.15]]) {
      K.cyl('wood', 0.12, 0.13, 2.0, C.woodDark, px, y - 1.0, pz, 0, 0, 0, 10);
    }
    K.box('deck', x1 - x0, 0.1, z1 - z0, '#fff0e2', (x0 + x1) / 2, y - 0.05, (z0 + z1) / 2, 0, 0, 0, 0.03);
    K.box('wood', x1 - x0, 0.22, 0.12, C.woodDark, (x0 + x1) / 2, y - 0.17, z1 - 0.06, 0, 0, 0, 0.02);
    K.box('wood', x1 - x0, 0.22, 0.12, C.woodDark, (x0 + x1) / 2, y - 0.17, z0 + 0.06, 0, 0, 0, 0.02);
    // guarda-corpo branco (norte e oeste)
    const railN = z0 + 0.08, railW = x0 + 0.08;
    for (let x = x0 + 0.08; x <= x1 - 0.05; x += (x1 - x0 - 0.16) / 5) K.box('paint', 0.11, 1.0, 0.11, C.white, x, y + 0.5, railN, 0, 0, 0, 0.03);
    K.box('paint', x1 - x0, 0.08, 0.12, C.white, (x0 + x1) / 2, y + 0.98, railN, 0, 0, 0, 0.03);
    K.box('paint', x1 - x0, 0.05, 0.05, C.white, (x0 + x1) / 2, y + 0.55, railN, 0, 0, 0, 0.02);
    for (let z = z0 + 0.08; z <= z1 - 0.05; z += (z1 - z0 - 0.16) / 4) K.box('paint', 0.11, 1.0, 0.11, C.white, railW, y + 0.5, z, 0, 0, 0, 0.03);
    K.box('paint', 0.12, 0.08, z1 - z0, C.white, railW, y + 0.98, (z0 + z1) / 2, 0, 0, 0, 0.03);
    K.box('paint', 0.05, 0.05, z1 - z0, C.white, railW, y + 0.55, (z0 + z1) / 2, 0, 0, 0, 0.02);
    // balaústres
    for (let x = x0 + 0.25; x < x1 - 0.1; x += 0.22) K.box('paint', 0.035, 0.42, 0.035, C.white, x, y + 0.76, railN, 0, 0, 0, 0.01);
    for (let z = z0 + 0.25; z < z1 - 0.1; z += 0.22) K.box('paint', 0.035, 0.42, 0.035, C.white, railW, y + 0.76, z, 0, 0, 0, 0.01);
    boxC(x0 - 0.15, x0 + 0.25, z0, z1);
    bench(x0 + 1.45, z0 + 0.85, Math.PI, y, 'deck');
    // lanterninha e vaso no deck
    world.deckPot = { x: x1 - 0.45, z: z0 + 0.45, y };
  }

  // PONTE (madeira, guarda-corpo branco em X)
  {
    const { x, z0, z1, w } = BRIDGE;
    const n = Math.round((z1 - z0) / 0.3);
    const step = (z1 - z0) / n;
    for (let i = 0; i < n; i++) {
      const z = z0 + (i + 0.5) * step;
      const yy = bridgeHeight(z);
      const t = (z - z0) / (z1 - z0);
      const slope = (BRIDGE.rise * Math.PI / (z1 - z0)) * Math.cos(Math.PI * t);
      K.box('wood', w, 0.07, step - 0.03, jit(i % 2 ? C.woodWarm : '#b97b4f', 0.07), x, yy - 0.04, z, -Math.atan(slope), (R() - 0.5) * 0.02, 0, 0.02);
    }
    const posts = [];
    const nP = 8;
    for (let i = 0; i <= nP; i++) posts.push(z0 + 0.1 + (i / nP) * (z1 - z0 - 0.2));
    for (const sd of [-1, 1]) {
      const px = x + sd * (w / 2 - 0.04);
      for (const pz of posts) K.box('paint', 0.08, 1.04, 0.08, C.white, px, bridgeHeight(pz) + 0.48, pz, 0, 0, 0, 0.025);
      for (let i = 0; i < posts.length - 1; i++) {
        const za = posts[i], zb = posts[i + 1];
        const ya = bridgeHeight(za), yb = bridgeHeight(zb);
        const zm = (za + zb) / 2, ym = (ya + yb) / 2;
        const len = Math.hypot(zb - za, yb - ya);
        const ang = Math.atan2(yb - ya, zb - za);
        K.box('paint', 0.08, 0.07, len + 0.02, C.white, px, ym + 0.98, zm, -ang, 0, 0, 0.025);
        K.box('paint', 0.05, 0.05, len, C.white, px, ym + 0.12, zm, -ang, 0, 0, 0.015);
        const dl = Math.hypot(zb - za, 0.84);
        const a1 = Math.atan2(0.84 + (yb - ya), zb - za);
        const a2 = Math.atan2(-0.84 + (yb - ya), zb - za);
        K.box('paint', 0.04, 0.04, dl, C.white, px, ym + 0.54, zm, -a1, 0, 0, 0.012);
        K.box('paint', 0.04, 0.04, dl, C.white, px, ym + 0.54, zm, -a2, 0, 0, 0.012);
      }
      for (let i = 0; i < n; i += 2) {
        const z = z0 + (i + 1) * step;
        K.box('wood', 0.12, 0.22, step * 2.05, C.woodDark, x + sd * (w / 2 - 0.1), bridgeHeight(z) - 0.17, z, 0, 0, 0, 0.02);
      }
      for (const pz of [posts[2], posts[4], posts[6]]) K.cyl('wood', 0.09, 0.1, 2.2, C.woodDark, x + sd * (w / 2 - 0.1), -0.9, pz, 0, 0, 0, 8);
    }
    K.box('stone', w + 0.4, 0.14, 0.9, C.stone, x, 0.02, z1 + 0.2, 0, 0, 0, 0.05);
    K.box('stone', w + 0.4, 0.14, 0.9, C.stone, x, 0.02, z0 - 0.2, 0, 0, 0, 0.05);
  }

  // ======================================================================
  // COQUEIROS (balançam e soltam cocos)
  const palmSpots = [[-1.2, -1.0, 5.7], [-5.6, 1.6, 5.0], [-6.6, 6.2, 5.9], [-2.4, 8.4, 5.3], [1.6, 11.6, 6.1]];
  const coconutGeo = new THREE.SphereGeometry(0.16, 18, 14);
  coconutGeo.scale(1, 1.12, 1);
  const coconutMat = new THREE.MeshStandardMaterial({ color: '#7c8a2c', roughness: 0.55 });
  world.coconutGeo = coconutGeo;
  world.coconutMat = coconutMat;
  for (const [px, pz, h] of palmSpots) {
    const palm = { x: px, z: pz, height: h, leanA: R() * Math.PI * 2, lean: 0.25 + R() * 0.45 };
    const model = buildPalmModel(palm, R, { coconutGeo, coconutMat });
    model.group.position.set(px, 0, pz);
    scene.add(model.group);
    world.canopies.push({ x: px + model.top.x, y: h, z: pz + model.top.z, r: 2.5 });
    world.palms.push({ ...palm, group: model.group, crown: model.crown, slots: model.slots, shake: 0, phase: R() * 6 });
    circle(px, pz, 0.38);
  }
  // REDE entre os dois coqueiros perto da entrada
  {
    const pa = world.palms.find((p) => p.x === -2.4 && p.z === 8.4);
    const pb = world.palms.find((p) => p.x === 1.6 && p.z === 11.6);
    world.hammock = buildHammock(scene, world, pa, pb);
  }

  // ======================================================================
  // CASA (paredes brancas, telhado colonial, varanda de madeira)
  const E = HOUSE_EXT;
  const STONE_PATH = { ax: 19.2, az: 17.0, bx: 21.15, bz: 12.55 + E };
  const MURO = { x: 22.73, z1: 17.3 };
  // telhado de duas águas com telha (placa com espessura + beiral + cumeeira de telha capa)
  function gableRoof({ cx, cz, axis, len, half, eaveY, ridgeY, over = 0.35 }) {
    const rise = ridgeY - eaveY;
    const ang = Math.atan2(rise, half);
    const slopeLen = Math.hypot(half, rise) + over;
    for (const s of [-1, 1]) {
      // centro da placa: metade da água (da cumeeira até o fim do beiral)
      const mid = (Math.hypot(half, rise) + over) / 2;
      const off = s * Math.cos(ang) * mid;
      const yy = ridgeY - Math.sin(ang) * mid + 0.07;
      if (axis === 'z') {
        K.box('roof', slopeLen, 0.12, len, '#ffffff', cx + off, yy, cz, 0, 0, -s * ang, 0.03);
        // forro do beiral (madeira)
        K.box('wood', 0.9, 0.04, len - 0.1, C.woodWarm, cx + s * (half + over * 0.4), eaveY - 0.06, cz, 0, 0, -s * ang * 0.3, 0.01);
        K.box('wood', 0.06, 0.2, len + 0.05, C.woodDark, cx + s * (half + over * Math.cos(ang) - 0.02), eaveY - over * Math.sin(ang) - 0.02, cz, 0, 0, -s * ang, 0.02);
      } else {
        K.box('roof', len, 0.12, slopeLen, '#ffffff', cx, yy, cz + off, s * ang, 0, 0, 0.03);
      }
    }
    // cumeeira (telhas capa)
    const ridge = new THREE.CylinderGeometry(0.17, 0.17, len + 0.1, 12, 1, false, 0, Math.PI);
    if (axis === 'z') {
      ridge.rotateX(Math.PI / 2);
      ridge.rotateZ(Math.PI / 2);
      K.add('roof', ridge, '#e6a184', cx, ridgeY + 0.12, cz);
    } else {
      ridge.rotateZ(Math.PI / 2);
      K.add('roof', ridge, '#e6a184', cx, ridgeY + 0.12, cz);
    }
  }
  function gableWall(points, z, depth, mat = 'plaster', color = C.wall) {
    const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
    const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
    K.add(mat, g, color, 0, 0, z);
  }
  // veneziana: moldura + ripas inclinadas
  function shutter(axis, x, y, z, w, h, out) {
    const nS = Math.round(h / 0.11);
    if (axis === 'x') {
      K.box('wood', 0.05, h, w, jit(C.shutter, 0.04), x, y, z, 0, 0, 0, 0.012);
      for (let i = 0; i < nS; i++) K.box('wood', 0.03, 0.08, w - 0.08, C.frame, x + out * 0.03, y - h / 2 + (i + 0.5) * (h / nS), z, 0, 0, out * 0.5, 0.008);
    } else {
      K.box('wood', w, h, 0.05, jit(C.shutter, 0.04), x, y, z, 0, 0, 0, 0.012);
      for (let i = 0; i < nS; i++) K.box('wood', w - 0.08, 0.08, 0.03, C.frame, x, y - h / 2 + (i + 0.5) * (h / nS), z + out * 0.03, -out * 0.5, 0, 0, 0.008);
    }
  }
  function windowOn(axis, wx, wz, y0, w, h, out, sw = w / 2) {
    const fr = C.frame;
    if (axis === 'x') {
      addGlass(0.05, h, w, wx + out * 0.02, y0 + h / 2, wz);
      K.box('paint', 0.14, 0.09, w + 0.34, C.cream, wx + out * 0.06, y0 - 0.06, wz, 0, 0, 0, 0.02); // peitoril
      K.box('wood', 0.12, 0.1, w + 0.24, fr, wx + out * 0.06, y0 + h + 0.05, wz, 0, 0, 0, 0.02);
      for (const sd of [-1, 1]) {
        K.box('wood', 0.12, h + 0.2, 0.1, fr, wx + out * 0.06, y0 + h / 2, wz + sd * (w / 2 + 0.05), 0, 0, 0, 0.02);
        shutter('x', wx + out * 0.09, y0 + h / 2, wz + sd * (w / 2 + 0.12 + sw / 2), sw, h + 0.06, out);
      }
      K.box('wood', 0.07, h, 0.05, fr, wx + out * 0.05, y0 + h / 2, wz, 0, 0, 0, 0.01);
      K.box('wood', 0.07, 0.05, w, fr, wx + out * 0.05, y0 + h * 0.55, wz, 0, 0, 0, 0.01);
    } else {
      addGlass(w, h, 0.05, wx, y0 + h / 2, wz + out * 0.02);
      K.box('paint', w + 0.34, 0.09, 0.14, C.cream, wx, y0 - 0.06, wz + out * 0.06, 0, 0, 0, 0.02);
      K.box('wood', w + 0.24, 0.1, 0.12, fr, wx, y0 + h + 0.05, wz + out * 0.06, 0, 0, 0, 0.02);
      for (const sd of [-1, 1]) {
        K.box('wood', 0.1, h + 0.2, 0.12, fr, wx + sd * (w / 2 + 0.05), y0 + h / 2, wz + out * 0.06, 0, 0, 0, 0.02);
        shutter('z', wx + sd * (w / 2 + 0.12 + sw / 2), y0 + h / 2, wz + out * 0.09, sw, h + 0.06, out);
      }
      K.box('wood', 0.05, h, 0.07, fr, wx, y0 + h / 2, wz + out * 0.05, 0, 0, 0, 0.01);
      K.box('wood', w, 0.05, 0.07, fr, wx, y0 + h * 0.55, wz + out * 0.05, 0, 0, 0, 0.01);
    }
  }
  // porta almofadada (virada pra -x)
  function door(x, z, w, h, y0 = 0.58) {
    K.box('wood', 0.07, h, w, jit(C.door, 0.03), x, y0 + h / 2, z, 0, 0, 0, 0.015);
    for (const yy of [0.32, 0.72]) for (const sd of [-1, 1]) K.box('wood', 0.03, h * 0.32, w * 0.36, '#7a4529', x - 0.04, y0 + h * yy, z + sd * w * 0.22, 0, 0, 0, 0.01);
    for (const sd of [-1, 1]) K.box('wood', 0.1, h + 0.12, 0.1, C.frame, x - 0.02, y0 + (h + 0.12) / 2, z + sd * (w / 2 + 0.05), 0, 0, 0, 0.02);
    K.box('wood', 0.1, 0.1, w + 0.2, C.frame, x - 0.02, y0 + h + 0.08, z, 0, 0, 0, 0.02);
    K.add('metal', new THREE.SphereGeometry(0.035, 10, 8), '#d6b56a', x - 0.06, y0 + h * 0.48, z + w * 0.32);
  }
  {
    // base de pedra
    K.box('stone', 10.6, 0.55, 12.6 + E, C.stone, 17.3, 0.25, 2.7 + E / 2, 0, 0, 0, 0.06);
    // degraus
    K.box('stone', 0.8, 0.27, 2.3, '#e3dbcd', 11.6, 0.135, 1.75, 0, 0, 0, 0.04);
    K.box('stone', 0.42, 0.52, 2.3, '#ddd4c6', 11.79, 0.26, 1.75, 0, 0, 0, 0.04);
    // paredes
    K.box('plaster', 7.0, 3.2, 11.4 + E, C.wall, 18.5, 2.1, 2.7 + E / 2, 0, 0, 0, 0.03);
    K.box('paint', 7.04, 0.35, 11.44 + E, C.band, 18.5, 0.675, 2.7 + E / 2, 0, 0, 0, 0.02);
    K.box('plaster', 0.1, 1.0, 11.4 + E, C.wall, 15.0, 4.18, 2.7 + E / 2);
    gableWall([[15, 3.7], [15, 4.67], [17.6, 5.8], [22, 3.89], [22, 3.7]], -3.06, 0.1);
    gableWall([[15, 3.7], [15, 4.67], [17.6, 5.8], [22, 3.89], [22, 3.7]], 8.36 + E, 0.1);
    // varanda: piso de lajota, colunas e viga
    K.box('tile', 2.95, 0.08, 12.0 + E, C.tile, 13.52, 0.54, 2.7 + E / 2, 0, 0, 0, 0.02);
    const colZ = [-3.2, 0.5, 2.95, 5.9, 8.6, 8.6 + E];
    for (const z of colZ) {
      K.box('wood', 0.22, 2.85, 0.22, jit('#6b4426', 0.03), 12.45, 1.98, z, 0, 0, 0, 0.04);
      K.box('stone', 0.32, 0.18, 0.32, '#e6ddd0', 12.45, 0.65, z, 0, 0, 0, 0.03);
    }
    K.box('wood', 0.28, 0.26, 12.1 + E, '#5a3820', 12.45, 3.4, 2.7 + E / 2, 0, 0, 0, 0.03);
    // mãos-francesas
    for (const z of colZ) for (const sd of [-1, 1]) {
      if ((z === -3.2 && sd < 0) || (z === 8.6 + E && sd > 0)) continue;
      K.box('wood', 0.08, 0.55, 0.08, '#5a3820', 12.45, 3.08, z + sd * 0.2, sd * 0.75, 0, 0, 0.01);
    }
    const rail = (za, zb) => {
      const len = zb - za;
      K.box('wood', 0.12, 0.08, len, '#6b4426', 12.45, 1.4, (za + zb) / 2, 0, 0, 0, 0.02);
      K.box('wood', 0.08, 0.06, len, '#6b4426', 12.45, 0.95, (za + zb) / 2, 0, 0, 0, 0.015);
      for (let z = za + 0.3; z < zb - 0.15; z += 0.24) K.box('wood', 0.05, 0.45, 0.05, '#7a4e2c', 12.45, 1.17, z, 0, 0, 0, 0.012);
    };
    rail(-1.2, 0.5);
    rail(2.95, 5.9);
    rail(5.9, 8.6);
    rail(8.6, 8.6 + E);
    for (const z of [-3.2, 8.6 + E]) {
      for (const yy of [0.88, 1.13, 1.38]) K.box('wood', 2.5, 0.15, 0.06, '#6b4426', 13.7, yy, z, 0, 0, 0, 0.015);
      K.box('wood', 0.12, 0.95, 0.12, '#6b4426', 13.9, 1.0, z, 0, 0, 0, 0.02);
    }
    // portas
    door(14.96, 1.75, 1.1, 2.2);
    door(14.96, 7.95, 1.0, 2.2);
    // janelas
    windowOn('x', 15.0, -0.05, 1.4, 1.0, 1.2, -1, 0.42);
    windowOn('x', 15.0, 3.65, 1.4, 1.0, 1.2, -1, 0.42);
    windowOn('x', 15.0, 5.95, 1.4, 1.0, 1.2, -1, 0.42);
    windowOn('x', 15.0, 9.8, 1.4, 1.0, 1.2, -1, 0.42);
    windowOn('x', 22.0, 0.0, 1.4, 1.3, 1.2, 1);
    windowOn('x', 22.0, 5.0, 1.4, 1.3, 1.2, 1);
    windowOn('x', 22.0, 9.0, 1.4, 1.3, 1.2, 1);
    windowOn('z', 18.5, -3.0, 1.4, 1.3, 1.2, -1);
    // quartinho fechado no canto norte da varanda
    {
      const zN = -3.2, zS = -1.2, xO = 12.45, xH = 15.0, y0 = 0.58;
      const zc = (zN + zS) / 2, zl = zS - zN;
      K.box('plaster', 0.12, 3.3 - y0, zl, C.wall, xO, (y0 + 3.3) / 2, zc);
      const side = [[xO - 0.06, y0], [xH, y0], [xH, 4.62], [xO - 0.06, 3.5]];
      gableWall(side, zN - 0.07, 0.14);
      gableWall(side, zS - 0.07, 0.12);
      K.box('paint', 0.14, 0.2, zl + 0.14, C.band, xO, y0 + 0.1, zc);
      K.box('paint', xH - xO, 0.2, 0.16, C.band, (xO + xH) / 2, y0 + 0.1, zN);
      K.box('paint', xH - xO, 0.2, 0.14, C.band, (xO + xH) / 2, y0 + 0.1, zS);
      const dz = zS + 0.08, dxc = 13.8, dw = 0.78, dh = 1.85;
      K.box('wood', dw, dh, 0.05, C.door, dxc, y0 + dh / 2, dz, 0, 0, 0, 0.012);
      for (const sd of [-1, 1]) K.box('wood', 0.08, dh + 0.08, 0.08, C.frame, dxc + sd * (dw / 2 + 0.04), y0 + (dh + 0.08) / 2, dz + 0.01, 0, 0, 0, 0.015);
      K.box('wood', dw + 0.16, 0.08, 0.08, C.frame, dxc, y0 + dh + 0.04, dz + 0.01, 0, 0, 0, 0.015);
      for (const yy of [0.5, 1.35]) K.box('wood', dw - 0.24, 0.6, 0.03, '#7a4529', dxc, y0 + yy, dz + 0.03, 0, 0, 0, 0.01);
    }
    gableRoof({ cx: 17.6, cz: 2.7 + E / 2, axis: 'z', len: 13.2 + E, half: 5.75, eaveY: 3.3, ridgeY: 5.8 });
    buildAnnex();
    // luminária da varanda
    const lampBox = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.07, 0.22, 12), lampMat);
    lampBox.position.set(14.88, 2.95, 0.95);
    scene.add(lampBox);
    K.box('metal', 0.08, 0.05, 0.08, '#2d2c2b', 14.94, 3.08, 0.95);
    world.lamps.push({ x: 14.2, y: 2.8, z: 0.95, power: 9, dist: 10 });
    // rede de varanda? não — mas tem cadeira e mesinha
    boxC(11.15, 23.5, -3.8, 9.1 + E);
    boxC(19.45, 22.75, 8.9 + E, 11.2 + E); // anexo
    boxC(11.9, 19.5, 9.0 + E, 10.0 + E); // canteiro
    boxC(MURO.x - 0.2, MURO.x + 0.2, 10.9 + E, MURO.z1); // muro
  }

  // ----------------------------------------------------------------- anexo (capelinha)
  function buildAnnex() {
    const R2 = mulberry32(2024);
    const j2 = (hex, amt = 0.06) => new THREE.Color(hex).offsetHSL(0, 0, (R2() - 0.5) * amt);
    const X0 = 19.6, X1 = 22.6, Z0 = 8.4 + E, Z1 = 11.0 + E;
    const cx = (X0 + X1) / 2;
    const cream = '#f6ecd2';
    const wallTop = 2.5;
    K.box('plaster', X1 - X0, wallTop, Z1 - Z0, cream, cx, wallTop / 2, (Z0 + Z1) / 2, 0, 0, 0, 0.03);
    const zr = (Z0 + Z1) / 2, ridgeY = 3.45;
    {
      const shape = new THREE.Shape([new THREE.Vector2(-Z0, wallTop - 0.02), new THREE.Vector2(-zr, ridgeY - 0.04), new THREE.Vector2(-Z1, wallTop - 0.02)]);
      const g = new THREE.ExtrudeGeometry(shape, { depth: X1 - X0, bevelEnabled: false });
      K.add('plaster', g, cream, X0, 0, 0, 0, Math.PI / 2, 0);
    }
    // rodapé de pedra
    K.box('stone', X1 - X0 + 0.08, 0.45, Z1 - Z0 + 0.08, '#cfc6b6', cx, 0.22, (Z0 + Z1) / 2, 0, 0, 0, 0.03);
    const arc = (cxA, cyA, z, r, thick, depth, colorFn, n, mat = 'stone') => {
      const chord = 2 * r * Math.sin(Math.PI / (2 * n));
      for (let k = 0; k < n; k++) {
        const a = (Math.PI * (k + 0.5)) / n;
        K.box(mat, chord * 1.18 + thick * 0.25, thick, depth, colorFn(), cxA + Math.cos(a) * r, cyA + Math.sin(a) * r, z, 0, 0, a + Math.PI / 2, 0.01);
      }
    };
    const arcX = (x, czA, cyy, rr, thick, depth, colorFn, n, mat = 'stone') => {
      const chord = 2 * rr * Math.sin(Math.PI / (2 * n));
      for (let k = 0; k < n; k++) {
        const a = (Math.PI * (k + 0.5)) / n;
        K.box(mat, depth, thick, chord * 1.18 + thick * 0.25, colorFn(), x, cyy + Math.sin(a) * rr, czA + Math.cos(a) * rr, -(a + Math.PI / 2), 0, 0, 0.01);
      }
    };
    const gran = () => j2('#b9b4ad', 0.06);
    // janela arqueada (leste)
    {
      const wx = X1, zc = zr, w = 0.78, hR = 0.5, y0 = 1.1, r = w / 2;
      const cyA = y0 + hR;
      addGlass(0.04, hR, w, wx + 0.02, y0 + hR / 2, zc);
      for (let i = 0; i < 6; i++) {
        const yy = ((i + 0.5) / 6) * r;
        addGlass(0.04, r / 6 + 0.01, 2 * Math.sqrt(r * r - yy * yy), wx + 0.02, cyA + yy, zc);
      }
      const wood = C.frame;
      for (const sd of [-1, 1]) K.box('wood', 0.08, hR, 0.08, wood, wx + 0.05, y0 + hR / 2, zc + sd * (r + 0.04), 0, 0, 0, 0.01);
      K.box('wood', 0.08, 0.08, w + 0.16, wood, wx + 0.05, y0 - 0.02, zc, 0, 0, 0, 0.01);
      arcX(wx + 0.05, zc, cyA, r + 0.04, 0.08, 0.08, () => wood, 10, 'wood');
      K.box('wood', 0.07, hR + r, 0.05, wood, wx + 0.05, y0 + (hR + r) / 2, zc);
      K.box('wood', 0.07, 0.05, w, wood, wx + 0.05, cyA, zc);
      const gw = 0.2, gr = r + 0.08 + gw / 2;
      for (const sd of [-1, 1]) K.box('stone', 0.08, hR + 0.18, gw, gran(), wx + 0.04, y0 + (hR - 0.18) / 2, zc + sd * gr, 0, 0, 0, 0.015);
      arcX(wx + 0.04, zc, cyA, gr, gw, 0.08, gran, 12);
      K.box('stone', 0.14, 0.16, 2 * gr + gw + 0.08, gran(), wx + 0.06, y0 - 0.14, zc, 0, 0, 0, 0.02);
    }
    // telhado de duas águas
    {
      const over = 0.35, half = (Z1 - Z0) / 2 + over;
      const rise = (ridgeY - wallTop) * (half / ((Z1 - Z0) / 2));
      const ang = Math.atan2(rise, half);
      const len = X1 - X0 + 0.55, rcx = cx + 0.2;
      const slopeLen = Math.hypot(half, rise);
      for (const sd of [-1, 1]) {
        const mid = slopeLen / 2;
        K.box('roof', len, 0.12, slopeLen, '#ffe0d6', rcx, ridgeY - Math.sin(ang) * mid + 0.08, zr + sd * Math.cos(ang) * mid, sd * ang, 0, 0, 0.03);
      }
      const ridge = new THREE.CylinderGeometry(0.15, 0.15, len + 0.06, 12, 1, false, 0, Math.PI);
      ridge.rotateZ(Math.PI / 2);
      K.add('roof', ridge, '#e6a184', rcx, ridgeY + 0.1, zr);
      const fx = rcx + len / 2;
      K.box('paint', 0.18, 0.24, 0.3, '#c86a4e', fx - 0.08, ridgeY + 0.28, zr, 0, 0, 0, 0.04);
      for (const zz of [Z0 + 0.02, zr, Z1 - 0.02]) {
        const yy = zz === zr ? ridgeY - 0.25 : wallTop - 0.08;
        K.box('wood', 0.42, 0.18, 0.18, '#5a3d26', X1 + 0.12, yy, zz, 0, 0, 0, 0.02);
      }
    }
    // frente: porta arqueada com vidrinhos, moldura de granito, lampião e degrau
    {
      const fz = Z1, xc = cx, r = 0.4, y0 = 0.16, hR = 1.4;
      const cyA = y0 + hR;
      const dw = '#5a3622';
      K.box('wood', 2 * r, hR, 0.06, dw, xc, y0 + hR / 2, fz + 0.02, 0, 0, 0, 0.01);
      for (let i = 0; i < 6; i++) {
        const yy = ((i + 0.5) / 6) * r;
        K.box('wood', 2 * Math.sqrt(r * r - yy * yy), r / 6 + 0.01, 0.06, dw, xc, cyA + yy, fz + 0.02);
      }
      K.box('wood', 0.025, hR + r - 0.04, 0.075, '#2e1c11', xc, y0 + (hR + r) / 2, fz + 0.025);
      for (const sd of [-1, 1]) {
        for (const yy of [0.72, 1.06, 1.4]) addGlass(0.2, 0.26, 0.02, xc + sd * 0.2, yy, fz + 0.055);
        K.box('wood', 0.22, 0.32, 0.02, '#4a2d1a', xc + sd * 0.2, 0.36, fz + 0.055);
      }
      K.box('metal', 0.12, 0.05, 0.04, '#bdb5a0', xc, 1.0, fz + 0.07);
      for (const sd of [-1, 1]) K.box('wood', 0.06, hR, 0.08, '#3d2614', xc + sd * (r + 0.03), y0 + hR / 2, fz + 0.03);
      arc(xc, cyA, fz + 0.03, r + 0.03, 0.06, 0.08, () => '#3d2614', 10, 'wood');
      const gw = 0.2, gr = r + 0.06 + gw / 2;
      for (const sd of [-1, 1]) K.box('stone', gw, cyA, 0.08, gran(), xc + sd * gr, cyA / 2, fz + 0.04, 0, 0, 0, 0.015);
      arc(xc, cyA, fz + 0.04, gr, gw, 0.08, gran, 12);
      K.box('stone', 1.25, 0.1, 0.6, '#c9c3b8', xc, 0.05, fz + 0.3, 0, 0, 0, 0.03);
      K.box('stone', 1.0, 0.06, 0.5, '#bfb8ac', xc + 0.05, 0.03, fz + 0.85, 0, 0.12, 0, 0.03);
      // santinho
      K.box('paint', 0.11, 0.16, 0.03, '#b7ad99', xc + 0.92, 1.25, fz + 0.02, 0, 0, 0, 0.01);
      K.box('paint', 0.05, 0.08, 0.03, '#e8dfc6', xc + 0.92, 1.27, fz + 0.035);
      // lampião
      const lx = xc - 0.95;
      K.box('metal', 0.18, 0.18, 0.03, '#3a3836', lx, 2.0, fz + 0.02, 0, 0, 0, 0.01);
      K.box('metal', 0.04, 0.04, 0.22, '#3a3836', lx, 1.97, fz + 0.12);
      K.add('metal', new THREE.ConeGeometry(0.17, 0.12, 4), '#3a3836', lx, 1.92, fz + 0.24, 0, Math.PI / 4, 0);
      const lantern = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.2, 0.15), lampMat);
      lantern.position.set(lx, 1.76, fz + 0.24);
      scene.add(lantern);
      world.lamps.push({ x: lx, y: 1.7, z: fz + 0.6, power: 4, dist: 7 });
    }
    // canteiro com meio-fio de concreto entre a varanda e o anexo
    {
      const bz0 = 9.0 + E, bz1 = 9.9 + E, bx0 = 12.0, bx1 = X0 - 0.05;
      for (let x = bx0; x < bx1 - 0.01; x += 0.78) {
        const w = Math.min(0.76, bx1 - x);
        K.box('stone', w, 0.3, 0.16, j2('#e8e3da', 0.05), x + w / 2, 0.15, bz1, 0, 0, 0, 0.02);
      }
      for (let z = bz0; z < bz1 - 0.1; z += 0.78) K.box('stone', 0.16, 0.3, Math.min(0.76, bz1 - z), j2('#e8e3da', 0.05), bx0, 0.15, z + Math.min(0.76, bz1 - z) / 2, 0, 0, 0, 0.02);
      K.box('stone', bx1 - bx0 - 0.1, 0.2, bz1 - bz0 - 0.08, '#6b4a33', (bx0 + bx1) / 2 + 0.05, 0.12, (bz0 + bz1) / 2 - 0.04);
      world.bed = { x0: bx0 + 0.2, x1: bx1 - 0.2, z0: bz0 + 0.1, z1: bz1 - 0.15, y: 0.22 };
    }
    // muro branco com base de pedra
    {
      const mz0 = Z1, mz1 = MURO.z1, mx = MURO.x, mh = 1.55, base = 0.5;
      const mL = mz1 - mz0, mcz = (mz0 + mz1) / 2;
      K.box('stone', 0.34, base, mL, C.stone, mx, base / 2, mcz, 0, 0, 0, 0.04);
      K.box('plaster', 0.26, mh - base, mL, '#f6f1e6', mx, base + (mh - base) / 2, mcz, 0, 0, 0, 0.02);
      K.box('paint', 0.36, 0.08, mL + 0.04, '#ece6da', mx, mh + 0.04, mcz, 0, 0, 0, 0.02);
      K.box('plaster', 0.4, mh + 0.2, 0.4, '#f6f1e6', mx, (mh + 0.2) / 2, mz1 - 0.2, 0, 0, 0, 0.03);
      K.box('paint', 0.46, 0.08, 0.46, '#ece6da', mx, mh + 0.24, mz1 - 0.2, 0, 0, 0, 0.02);
      K.box('paint', 0.18, 2.1, 0.18, '#8a8680', mx - 0.3, 1.05, mz1 - 0.65, 0.05, 0, 0, 0.03);
      const tz = 13.6 + E, tx = mx - 0.2;
      K.cyl('metal', 0.025, 0.025, 0.85, '#8a8a8a', tx, 0.45, tz, 0, 0, 0, 8);
      K.cyl('metal', 0.025, 0.025, 0.16, '#8a8a8a', tx - 0.06, 0.86, tz, 0, 0, Math.PI / 2, 8);
      K.box('plastic', 0.05, 0.06, 0.09, '#c0392b', tx - 0.12, 0.92, tz, 0, 0, 0, 0.015);
      circle(tx - 0.05, tz, 0.12);
    }
    // pedras de passagem (orgânicas)
    {
      const { ax, az, bx, bz } = STONE_PATH;
      const dx = bx - ax, dz = bz - az, L2 = Math.hypot(dx, dz);
      const px = -dz / L2, pz = dx / L2;
      const n = Math.max(4, Math.round(L2 / 0.55));
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        const bend = Math.sin(Math.PI * t) * 0.35 + (R2() - 0.5) * 0.12;
        const x = ax + dx * t + px * bend, z = az + dz * t + pz * bend;
        const g = new THREE.CylinderGeometry(0.34, 0.37, 0.08, 12);
        const p = g.attributes.position;
        for (let k = 0; k < p.count; k++) {
          const a = Math.atan2(p.getZ(k), p.getX(k));
          const f = 1 + Math.sin(a * 3 + i) * 0.08 + Math.sin(a * 5 + i * 2) * 0.05;
          p.setX(k, p.getX(k) * f * (1.1 + R2() * 0.0));
          p.setZ(k, p.getZ(k) * f * 0.8);
        }
        g.computeVertexNormals();
        K.add('stone', g, j2('#d8d2c4', 0.08), x, 0.03, z, 0, R2() * 3, 0);
      }
    }
  }

  // poste do vizinho com fios
  {
    const lz = 16.9;
    K.box('paint', 0.24, 4.4, 0.24, '#b5b0a8', 25.4, 2.2, lz, 0, 0, 0, 0.05);
    K.box('paint', 1.0, 0.1, 0.12, '#9a958d', 25.4, 4.1, lz, 0, 0, 0, 0.02);
    for (const dz of [-0.06, 0.06]) {
      const c = new THREE.CatmullRomCurve3([new THREE.Vector3(25.4, 3.95, lz + dz), new THREE.Vector3(45, 3.2, lz + dz), new THREE.Vector3(65, 3.95, lz + dz)]);
      K.add('rubber', taperTube(c, 0.012, 0.012, 20, 4), '#1d1d1d', 0, 0, 0, 0, 0, 0, 1, 1, 1, { uv: 'keep' });
    }
    circle(25.4, lz, 0.18);
  }

  // ======================================================================
  // BANCOS
  bench(-3.7, 4.0, 0.95, 0, 'coqueiros');
  bench(-14.2, -14.7, 0, 0, 'norte');

  // ======================================================================
  // ÁRVORES (cópia por material: casca, folhas, preenchimento)
  const treeParts = { bark: [], broad: [], small: [], dark: [], fill: [] };
  function tree(x, z, s, collide = true, style = null, detail = 1) {
    const st = style || ['broad', 'small', 'dark'][Math.floor(R() * 3)];
    const t = treeGeometry(x, z, s, R, st, detail);
    treeParts.bark.push(...t.bark);
    treeParts[st].push(...t.leaves);
    treeParts.fill.push(...t.fill);
    if (detail > 0.5) world.canopies.push(t.canopy);
    if (collide) circle(x, z, 0.32 * s + 0.12);
  }
  tree(-9.3, -5.6, 1.45, true, 'dark');
  tree(-0.3, -5.3, 1.3, true, 'broad');
  const inner = [
    [-20, -4, 1.1], [-24.5, 2, 1.2], [-21.5, 9.5, 1.0], [-25.5, 14.5, 1.0], [-15.5, 13.5, 0.85],
    [14.5, -6.4, 0.95], [24.5, -5.6, 1.1], [27.2, 4, 0.9], [26.5, 13.5, 1.0],
    [-22, -14.2, 1.0], [-6.5, -15.2, 0.85], [10.5, -14.6, 1.0], [20.5, -15.0, 1.05], [-27, -8, 1.0],
  ];
  for (const [x, z, s] of inner) tree(x, z, s);
  // anel de fora (fora da área jogável)
  for (let i = 0; i < 70; i++) {
    let x, z;
    const side = R();
    if (side < 0.35) { x = -60 + R() * 120; z = -20 - R() * 16; }
    else if (side < 0.55) { x = -60 + R() * 120; z = 28 + R() * 9; }
    else if (side < 0.78) { x = -32 - R() * 22; z = -18 + R() * 44; }
    else { x = 32 + R() * 22; z = -18 + R() * 44; }
    if (isWater(x, z) || Math.abs(z - riverCenter(x)) < RIVER.hw + 1.5 || (z > 17.5 && z < 27)) continue;
    tree(x, z, 0.85 + R() * 0.6, false, null, 0.7);
  }
  const tg = (list, mat, opts = {}) => {
    if (!list.length) return;
    for (const g of list) withColor(g, opts.color || '#ffffff');
    const m = new THREE.Mesh(mergeGeometries(list), mat);
    m.castShadow = opts.cast ?? true;
    m.receiveShadow = true;
    scene.add(m);
  };
  tg(treeParts.bark, M.bark);
  tg(treeParts.broad, F.broad);
  tg(treeParts.small, F.small);
  tg(treeParts.dark, F.dark);
  tg(treeParts.fill, F.fill);

  // coqueiros de enfeite fora do sítio (clima tropical)
  for (const [x, z, h] of [[-34, 6, 7.2], [-36.5, 11, 6.4], [35, -3, 7.5], [37.5, 2.5, 6.6], [-12, 29.5, 7.0], [16, 30, 6.8], [30, 29, 7.4], [-40, -19.5, 7.8], [41, -20, 7.1], [-29, 30, 6.5]]) {
    const palm = { x, z, height: h, leanA: R() * Math.PI * 2, lean: 0.4 + R() * 0.6 };
    const mdl = buildPalmModel(palm, R, { coconuts: false });
    mdl.group.position.set(x, groundY(x, z), z);
    scene.add(mdl.group);
  }

  // bananeiras nos cantos do quintal
  {
    const stems = [], leavesB = [];
    for (const [x, z, s] of [[24.6, -2.5, 1.0], [25.8, 9.0, 1.1], [-26.5, -12.5, 1.0], [-27.2, 16.0, 0.9], [9.6, -12.2, 0.85], [27.4, 15.6, 0.95]]) {
      const b = bananaGeometry(x, z, s, R);
      stems.push(...b.stems);
      leavesB.push(...b.leaves);
      circle(x, z, 0.45 * s);
    }
    tg(stems, M.palm);
    tg(leavesB, F.banana);
  }

  // mata nos morros: árvores instanciadas (poucas variações, muitas cópias)
  {
    const variants = [];
    for (let v = 0; v < 4; v++) {
      const t = treeGeometry(0, 0, 1, R, ['broad', 'small', 'dark', 'dark'][v], 0);
      variants.push({
        bark: mergeGeometries(t.bark), leaves: mergeGeometries(t.leaves), fill: mergeGeometries(t.fill), style: t.style,
      });
    }
    const spots = variants.map(() => []);
    for (let i = 0; i < 1150; i++) {
      const x = -220 + R() * 440, z = -190 + R() * 360;
      const h = groundY(x, z);
      if (h < 1.5) continue;
      if (Math.abs(z - riverCenter(x)) < RIVER.hw + 3) continue;
      spots[Math.floor(R() * variants.length)].push({ x, z, y: h - 0.3, s: 1.3 + R() * 1.4, r: R() * 6 });
    }
    for (const vt of variants) withColor(vt.bark, '#ffffff');
    variants.forEach((vt, vi) => {
      const list = spots[vi];
      if (!list.length) return;
      const mk = (geo, mat) => {
        const im = new THREE.InstancedMesh(geo, mat, list.length);
        list.forEach((sp, i) => {
          _q.setFromEuler(new THREE.Euler(0, sp.r, 0));
          _m.compose(_p.set(sp.x, sp.y, sp.z), _q, _s.setScalar(sp.s));
          im.setMatrixAt(i, _m);
        });
        im.receiveShadow = true;
        scene.add(im);
      };
      mk(vt.bark, M.bark);
      mk(vt.leaves, F[vt.style]);
      mk(vt.fill, F.fill);
    });
  }

  // montanhas distantes (silhueta com névoa)
  {
    const mg = [];
    const RM = mulberry32(808);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + RM() * 0.3;
      const d = 235 + RM() * 40;
      const g = new THREE.ConeGeometry(55 + RM() * 45, 70 + RM() * 60, 18, 6);
      const p = g.attributes.position;
      for (let k = 0; k < p.count; k++) {
        const x = p.getX(k), y = p.getY(k), z = p.getZ(k);
        const n = Math.sin(x * 0.08 + i) * Math.cos(z * 0.07 + i * 2) * 6 + Math.sin(y * 0.1 + i) * 4;
        p.setXYZ(k, x + n, y, z + n * 0.7);
      }
      g.computeVertexNormals();
      g.translate(Math.cos(a) * d, 20, -10 + Math.sin(a) * d * 0.85);
      mg.push(g);
    }
    const mm = new THREE.MeshStandardMaterial({ color: '#4f7f4a', roughness: 1, flatShading: false });
    scene.add(new THREE.Mesh(mergeGeometries(mg), mm));
  }

  // ======================================================================
  // GRAMADO, FLORES, SAMAMBAIAS e PEDRAS
  const HOUSE = { x0: 10.8, x1: 23.8, z0: -4.2, z1: 12 + E };
  const blockedForPlants = (x, z, pad = 0) => {
    if (Math.abs(z - riverCenter(x)) < RIVER.hw + 0.55 + pad) return true;
    if (x > HOUSE.x0 - pad && x < HOUSE.x1 + pad && z > HOUSE.z0 - pad && z < HOUSE.z1 + pad) return true;
    if (Math.abs(x - BRIDGE.x) < 1.3 + pad && z < -4.5 && z > -14) return true;
    if (x > DECK.x0 - 0.3 - pad && x < DECK.x1 + 0.3 + pad && z > DECK.z0 - 0.3 && z < DECK.z1 + 0.3 + pad) return true;
    if (z > 17.2 && z < 25.5) return true;
    if (Math.hypot(x - 4.6, z - 13.4) < 3.0 + pad) return true; // vaga da Strada
    if (Math.abs(z - FENCE_Z) < 0.35 || Math.abs(z - NORTH_FENCE_Z) < 0.35) return true;
    if (x > 18.5 && x < 23.2 && z > 10.5 + E && z < 17.6) return true; // quintal do anexo
    return false;
  };
  // tufos: evitam as trilhas pintadas no chão
  const splatImg = (() => {
    const t = assets._splatCanvas;
    return t ? t.getContext('2d').getImageData(0, 0, t.width, t.height) : null;
  })();
  const pathAt = (x, z) => {
    if (!splatImg) return 0;
    const px = Math.floor((x - SPLAT.x0) * SPLAT.ppu), pz = Math.floor((z - SPLAT.z0) * SPLAT.ppu);
    if (px < 0 || pz < 0 || px >= splatImg.width || pz >= splatImg.height) return 0;
    const i = (pz * splatImg.width + px) * 4;
    return Math.max(splatImg.data[i], splatImg.data[i + 1], splatImg.data[i + 2]) / 255;
  };
  const grass = [];
  for (let i = 0; i < 16000; i++) {
    const x = -30 + R() * 60, z = -17 + R() * 34.6;
    if (blockedForPlants(x, z)) continue;
    if (pathAt(x, z) > 0.2 + R() * 0.25) continue;
    grass.push({ x, z, s: 0.38 + R() * 0.4 });
  }
  // capim alto nas beiras (cercas e rio)
  for (let i = 0; i < 1600; i++) {
    const x = -30 + R() * 60;
    const z = R() < 0.5 ? FENCE_Z - 0.5 - R() * 0.6 : (R() < 0.5 ? NORTH_FENCE_Z + 0.5 + R() * 0.8 : riverCenter(x) + (R() < 0.5 ? -1 : 1) * (RIVER.hw + 0.7 + R() * 0.9));
    if (blockedForPlants(x, z)) continue;
    grass.push({ x, z, s: 0.9 + R() * 0.7 });
  }
  // fora do sítio também
  for (let i = 0; i < 2500; i++) {
    const x = -60 + R() * 120, z = -40 + R() * 72;
    if (x > -31 && x < 31 && z > -18 && z < 27) continue;
    if (Math.abs(z - riverCenter(x)) < RIVER.hw + 0.5) continue;
    grass.push({ x, z, y: groundY(x, z), s: 0.9 + R() * 0.8 });
  }
  scatterGrass(scene, grass, R);

  // flores (gazânia laranja e vinca rosa) em canteiros e touceiras
  const gaz = [], peri = [], ferns = [], celand = [], rocks1 = [], rocks2 = [], pots = [];
  const clump = (arr, x, z, n, rad, s = 1, nv = 8) => {
    for (let i = 0; i < n; i++) {
      const a = R() * Math.PI * 2, d = Math.sqrt(R()) * rad;
      const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
      if (blockedForPlants(px, pz)) continue;
      arr.push({ x: px, z: pz, s: s * (0.8 + R() * 0.5), ry: R() * 6.28, v: Math.floor(R() * nv) });
    }
  };
  // canteiro da casa
  if (world.bed) {
    const b = world.bed;
    for (let x = b.x0; x < b.x1; x += 0.32) {
      (R() < 0.5 ? gaz : peri).push({ x: x + (R() - 0.5) * 0.1, z: b.z0 + R() * (b.z1 - b.z0), y: b.y, s: 2.0 + R() * 0.6, ry: R() * 6, v: Math.floor(R() * 8) });
    }
  }
  // ao longo da varanda e da casa (fora da colisão)
  for (let z = -3.5; z < 9.0 + E; z += 0.45) {
    if (Math.abs(z - 1.75) < 1.4) continue;
    (R() < 0.6 ? peri : gaz).push({ x: 10.75 + R() * 0.25, z, s: 1.9 + R() * 0.5, ry: R() * 6, v: Math.floor(R() * 8) });
  }
  for (let x = 11.2; x < 23.4; x += 0.5) (R() < 0.5 ? peri : gaz).push({ x, z: -4.1 - R() * 0.25, s: 1.9 + R() * 0.5, ry: R() * 6, v: Math.floor(R() * 8) });
  // touceiras pelo gramado
  for (let i = 0; i < 22; i++) {
    const x = -26 + R() * 50, z = -15 + R() * 31;
    clump(R() < 0.5 ? gaz : peri, x, z, 7, 0.9, 1.7);
  }
  // cantinho dos bancos e da rede
  clump(gaz, -4.8, 5.1, 10, 1.0, 1.8);
  clump(peri, -15.4, -15.6, 10, 1.0, 1.8);
  clump(peri, 3.0, 10.4, 8, 0.8, 1.7);
  // ao longo da cerca da frente
  for (let x = -29; x < 29; x += 1.4 + R()) {
    if (x > PED_GATE.x0 - 1 && x < GATE.x1 + 1) continue;
    if (x > 18 && x < 23.5) continue;
    clump(R() < 0.5 ? gaz : peri, x, FENCE_Z - 0.55, 3, 0.35, 1.7);
  }
  // samambaias e plantas tropicais nas margens do rio e cantos
  for (let x = -40; x < 40; x += 1.3 + R() * 1.6) {
    for (const sd of [-1, 1]) {
      if (R() < 0.35) continue;
      if (Math.abs(x - BRIDGE.x) < 2.2) continue;
      if (sd === 1 && x > DECK.x0 - 1 && x < DECK.x1 + 0.6) continue;
      const z = riverCenter(x) + sd * (RIVER.hw + 0.95 + R() * 0.6);
      if (blockedForPlants(x, z) || z < -16.8 || z > 17) continue;
      ferns.push({ x, z, s: 1.1 + R() * 0.7, ry: R() * 6.28, v: Math.floor(R() * 4) });
    }
  }
  for (const [x, z] of [[11.0, -3.7], [11.0, 8.6 + E + 0.6], [24.0, -4.2], [24.1, 9.5], [-28.5, -16], [28.4, -16.2], [-28.6, 16.6], [3.6, 16.7], [10.6, 16.7]]) {
    clump(ferns, x, z, 3, 0.5, 1.3, 4);
  }
  // pés das árvores
  for (const [x, z, s] of inner) {
    clump(ferns, x + 0.9 * s, z + 0.4, 2, 0.4, 1.1, 4);
    clump(celand, x - 0.6, z - 0.7, 3, 0.7, 1.4, 5);
  }
  // forração na beira do rio
  for (let x = -30; x < 30; x += 2.5 + R() * 3) clump(celand, x, riverCenter(x) + (R() < 0.5 ? -1 : 1) * (RIVER.hw + 1.4), 3, 0.6, 1.5, 5);
  // pedras na água rasa da margem
  for (let x = -60; x < 60; x += 0.9 + R() * 1.6) {
    if (Math.abs(x - BRIDGE.x) < 1.8) continue;
    if (x > DECK.x0 - 0.5 && x < DECK.x1 + 0.5 && R() < 0.7) continue;
    const sd = R() < 0.5 ? -1 : 1;
    const z = riverCenter(x) + sd * (RIVER.hw - 0.15 - R() * 0.35);
    const pl = { x, z, y: RIVER.waterY - 0.32 - R() * 0.12, s: 0.22 + R() * 0.25, ry: R() * 6.28, v: Math.floor(R() * 7) };
    (R() < 0.5 ? rocks1 : rocks2).push(pl);
  }
  // pedras soltas no gramado e na mata
  for (let i = 0; i < 26; i++) {
    const x = -28 + R() * 56, z = -16 + R() * 32;
    if (blockedForPlants(x, z, 0.5)) continue;
    (R() < 0.5 ? rocks1 : rocks2).push({ x, z, y: -0.05, s: 0.12 + R() * 0.14, ry: R() * 6.28, v: Math.floor(R() * 7) });
  }
  // vasos de barro com plantas na varanda e no deck
  for (const [x, z, y] of [[11.25, 0.25, 0], [11.25, 3.25, 0], [14.4, -0.85, 0.58], [13.0, 9.4 + E - 0.6, 0.58], [world.deckPot.x, world.deckPot.z, world.deckPot.y]]) {
    pots.push({ x, z, y, s: 0.85, ry: R() * 6, v: 0 });
    ferns.push({ x, z, y: y + 0.42, s: 0.7, ry: R() * 6, v: Math.floor(R() * 4) });
  }
  scatterModel(scene, 'flower_gazania', gaz, { sway: 0.15 });
  scatterModel(scene, 'periwinkle_plant', peri, { sway: 0.15 });
  scatterModel(scene, 'fern_02', ferns, { sway: 0.08 });
  scatterModel(scene, 'celandine_01', celand, { cast: false });
  scatterModel(scene, 'rock_moss_set_01', rocks1, {});
  scatterModel(scene, 'rock_moss_set_02', rocks2, {});
  scatterModel(scene, 'planter_pot_clay', pots, {});

  // ------------------------------------------------------------ montagem
  K.build(scene);
  if (glass.length) {
    const gm = new THREE.Mesh(mergeGeometries(glass), windowMat);
    gm.receiveShadow = true;
    scene.add(gm);
  }
  world.cloudMat = new THREE.MeshBasicMaterial(); // (as nuvens agora são do céu)
  return world;
}
