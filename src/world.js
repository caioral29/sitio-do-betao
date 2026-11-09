import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  RIVER, riverCenter, isRiverTile, isWater, BRIDGE, DECK, GATE, PED_GATE, FENCE_Z, NORTH_FENCE_Z,
  bridgeHeight, mulberry32, HOUSE_EXT,
} from './config.js';
import { makeRoofTexture, makeSignTexture } from './textures.js';
import { buildHammock } from './hammock.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _c = new THREE.Color();

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();

// Junta muitas peças estáticas (com cor por vértice) num único mesh = poucas draw calls
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
    g.clearGroups();
    this.parts.push(g);
  }
  box(w, h, d, color, x, y, z, rx = 0, ry = 0, rz = 0) {
    this.add(UNIT_BOX, color, x, y, z, rx, ry, rz, w, h, d);
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

// Balanço do vento + "dither" que deixa transparente o que fica entre a câmera e o Betão
export function patchMaterial(mat, { timeUniform, occ, sway }) {
  mat.customProgramCacheKey = () => (sway ? 'betao-leaf' : 'betao-solid');
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = timeUniform;
    shader.uniforms.uFocus = occ.focus;
    shader.uniforms.uFocusNDC = occ.ndc;
    shader.uniforms.uFocusDepth = occ.depth;
    shader.uniforms.uRes = occ.res;
    shader.uniforms.uOccR = occ.r;
    shader.uniforms.uNearFade = occ.near;
    if (sway) {
      shader.uniforms.uCan = occ.can;
      shader.uniforms.uCanN = occ.canN;
    }
    shader.vertexShader = 'uniform float uTime;\nvarying vec3 vWPos;\n' + shader.vertexShader
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        ${sway ? `float sw = max(position.y - 1.6, 0.0) * 0.022;
        transformed.x += sin(uTime * 1.3 + position.x * 0.35 + position.z * 0.21) * sw;
        transformed.z += cos(uTime * 1.05 + position.z * 0.3 + position.x * 0.1) * sw * 0.7;` : ''}`)
      .replace('#include <project_vertex>', `#include <project_vertex>
        vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    shader.fragmentShader = 'uniform vec3 uFocus;\nuniform vec2 uFocusNDC;\nuniform float uFocusDepth;\nuniform vec2 uRes;\nuniform float uOccR;\nuniform float uNearFade;\nvarying vec3 vWPos;\n' +
      (sway ? 'uniform vec4 uCan[6];\nuniform int uCanN;\n' : '') + shader.fragmentShader.replace(
      '#include <clipping_planes_fragment>',
      `#include <clipping_planes_fragment>
      ${sway ? `
      for (int i = 0; i < 6; i++) {
        if (i >= uCanN) break;
        vec3 dq = vWPos - uCan[i].xyz;
        dq.y *= 1.35;
        if (length(dq) < uCan[i].w) {
          const float B3[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
          int kx = int(mod(gl_FragCoord.x, 4.0));
          int ky = int(mod(gl_FragCoord.y, 4.0));
          if (0.7 > (B3[ky * 4 + kx] + 0.5) / 16.0) discard;
          break;
        }
      }` : ''}
      {
        // some o que encosta na câmera (ex.: câmera dentro de uma copa)
        float cd = length(vWPos - cameraPosition);
        float nf = (1.0 - smoothstep(1.2, 3.2, cd)) * uNearFade;
        if (nf > 0.0) {
          const float B2[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
          int jx = int(mod(gl_FragCoord.x, 4.0));
          int jy = int(mod(gl_FragCoord.y, 4.0));
          if (nf > (B2[jy * 4 + jx] + 0.5) / 16.0) discard;
        }
      }
      if (uOccR > 0.0 && vWPos.y > uFocus.y - 0.45 && vViewPosition.z < uFocusDepth - 0.9) {
        vec2 ndc = gl_FragCoord.xy / uRes * 2.0 - 1.0;
        vec2 dd = ndc - uFocusNDC;
        dd.x *= uRes.x / uRes.y;
        float fade = 1.0 - smoothstep(uOccR * 0.55, uOccR, length(dd));
        if (fade > 0.0) {
          const float B[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
          int ix = int(mod(gl_FragCoord.x, 4.0));
          int iy = int(mod(gl_FragCoord.y, 4.0));
          float bayer = (B[iy * 4 + ix] + 0.5) / 16.0;
          if (fade * 0.92 > bayer) discard;
        }
      }`
    );
  };
}

export function buildWorld(scene, timeUniform) {
  const R = mulberry32(1337);
  const jit = (hex, amt = 0.06) => new THREE.Color(hex).offsetHSL(0, 0, (R() - 0.5) * amt);

  const B = new Batcher(); // sólidos estáticos
  const L = new Batcher(); // folhagem com vento
  const B0 = B, L0 = L;
  const W = new Batcher(); // vidros das janelas (brilham à noite)
  const H = new Batcher(); // morros distantes

  const world = {
    colliders: { circles: [], boxes: [] },
    benches: [],
    palms: [],
    clouds: [],
    lamps: [],
    gate: null,
    door: { x: 10.9, z: 1.75 },
    sign: { x: 5.5, z: -16.4 },
  };
  const circle = (x, z, r) => world.colliders.circles.push({ x, z, r });
  const boxC = (x0, x1, z0, z1, extra = {}) => {
    const b = { x0, x1, z0, z1, active: true, ...extra };
    world.colliders.boxes.push(b);
    return b;
  };

  // ------------------------------------------------------------ materiais
  const solidMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 });
  const leafMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
  const occ = {
    focus: { value: new THREE.Vector3(0, -100, 0) }, ndc: { value: new THREE.Vector2() }, depth: { value: 0 },
    res: { value: new THREE.Vector2(1, 1) }, r: { value: 0 }, near: { value: 1 }, // near = 0 desliga o "some perto da câmera" (1ª pessoa)
    can: { value: Array.from({ length: 6 }, () => new THREE.Vector4()) }, canN: { value: 0 },
  };
  world.canopies = [];
  world.occ = occ;
  patchMaterial(solidMat, { timeUniform, occ, sway: false });
  patchMaterial(leafMat, { timeUniform, occ, sway: true });
  const windowMat = new THREE.MeshStandardMaterial({
    color: '#2c3f52', roughness: 0.15, metalness: 0.1, emissive: '#ffb55a', emissiveIntensity: 0,
  });
  const lampMat = new THREE.MeshStandardMaterial({ color: '#fff3c4', emissive: '#ffcf6b', emissiveIntensity: 0 });
  world.windowMat = windowMat;
  world.lampMat = lampMat;

  // ------------------------------------------------------------ árvores voxel
  const GREENS = ['#5ea333', '#6cb53a', '#79c443', '#8bd14d', '#4f8f2b'];
  // ghost: consome a mesma sequência aleatória sem desenhar nada (árvore removida,
  // mas o resto do mapa continua idêntico)
  const NOOP = { box() {} };
  function voxelTree(x, z, s = 1, collide = true, ghost = false) {
    const B = ghost ? NOOP : B0, L = ghost ? NOOP : L0;
    const th = (2.0 + R() * 0.8) * s;
    const tw = 0.55 * s;
    B.box(tw, th + 0.6, tw, jit('#6e4526', 0.05), x, (th + 0.6) / 2 - 0.3, z);
    B.box(tw * 1.5, 0.3, tw * 1.5, jit('#5e3a20', 0.04), x, 0.1, z);
    for (let b = 0; b < 2; b++) {
      const a = R() * Math.PI * 2;
      B.box(0.24 * s, 1.0 * s, 0.24 * s, '#6e4526', x + Math.cos(a) * 0.4 * s, th - 0.1, z + Math.sin(a) * 0.4 * s, Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6);
    }
    const cy = th + 1.25 * s;
    if (!ghost) world.canopies.push({ x, y: cy, z, r: 2.6 * s });
    const n = Math.round(15 * s * s) + 7;
    for (let i = 0; i < n; i++) {
      let u, v, w;
      do {
        u = R() * 2 - 1;
        v = R() * 2 - 1;
        w = R() * 2 - 1;
      } while (u * u + v * v + w * w > 1);
      const sz = (0.95 + R() * 0.7) * s;
      const col = new THREE.Color(GREENS[Math.floor(R() * 4)]).offsetHSL(0, 0, v * 0.06 + (R() - 0.5) * 0.03);
      L.box(sz, sz, sz, col, x + u * 1.9 * s, cy + v * 1.2 * s, z + w * 1.9 * s, 0, (R() - 0.5) * 0.3, 0);
    }
    if (collide && !ghost) circle(x, z, 0.32 * s + 0.12);
  }

  function bush(x, z, s = 1, collide = false) {
    const n = 3 + Math.floor(R() * 3);
    for (let i = 0; i < n; i++) {
      const sz = (0.45 + R() * 0.4) * s;
      const col = jit(GREENS[Math.floor(R() * 5)], 0.06);
      L.box(sz, sz, sz, col, x + (R() - 0.5) * 0.9 * s, sz / 2 - 0.05 + R() * 0.25 * s, z + (R() - 0.5) * 0.9 * s, 0, R(), 0);
    }
    if (collide) circle(x, z, 0.45 * s);
  }

  function rock(x, y, z, s) {
    const col = jit(['#c9b8a0', '#b8a890', '#a89c8c', '#d8c8b0'][Math.floor(R() * 4)], 0.05);
    B.box(s * (0.9 + R() * 0.4), s * 0.7, s * (0.8 + R() * 0.4), col, x, y, z, (R() - 0.5) * 0.3, R() * 3, (R() - 0.5) * 0.3);
  }

  // ------------------------------------------------------------ bancos
  function bench(x, z, yaw, baseY = 0, name = 'banco') {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const P = (lx, ly, lz) => [x + lx * c + lz * s, baseY + ly, z - lx * s + lz * c];
    const woodA = '#a3693a', woodB = '#8c5830';
    for (const lz of [-0.16, 0.0, 0.16]) B.box(1.8, 0.07, 0.15, jit(woodA, 0.05), ...P(0, 0.46, lz), 0, yaw, 0);
    B.box(1.8, 0.15, 0.06, jit(woodA, 0.05), ...P(0, 0.72, -0.27), -0.12, yaw, 0);
    B.box(1.8, 0.15, 0.06, jit(woodA, 0.05), ...P(0, 0.93, -0.29), -0.12, yaw, 0);
    for (const lx of [-0.75, 0.75]) {
      B.box(0.1, 0.46, 0.1, woodB, ...P(lx, 0.23, 0.18), 0, yaw, 0);
      B.box(0.1, 1.0, 0.1, woodB, ...P(lx, 0.5, -0.24), -0.1, yaw, 0);
      B.box(0.1, 0.08, 0.5, woodB, ...P(lx, 0.36, -0.02), 0, yaw, 0);
    }
    const seat = P(0, 0.495, 0.0);
    const front = P(0, 0, 0.75);
    world.benches.push({ name, x: seat[0], z: seat[2], seatTop: seat[1], yaw, front: { x: front[0], z: front[2] } });
    const a = P(-0.5, 0, -0.05), b = P(0.5, 0, -0.05);
    circle(a[0], a[2], 0.42);
    circle(b[0], b[2], 0.42);
  }

  // ------------------------------------------------------------ cercas
  function fenceLine(x0, x1, z, cap = '#efe7d6', skip = null) {
    // skip = vão [x0, x1] sem cerca (postes dentro do vão somem, travessas são cortadas)
    for (let x = x0; x <= x1 + 0.001; x += 2) {
      const postCol = jit('#6b4226', 0.05);
      if (!(skip && x > skip[0] + 0.01 && x < skip[1] - 0.01)) {
        B.box(0.28, 1.32, 0.28, postCol, x, 0.62, z);
        B.box(0.34, 0.08, 0.34, cap, x, 1.31, z);
      }
      if (x + 2 > x1 + 0.001) continue;
      const pieces = skip ? [[x, Math.min(x + 2, skip[0])], [Math.max(x, skip[1]), x + 2]] : [[x, x + 2]];
      for (const [a, b] of pieces) {
        if (b - a < 0.05) continue;
        B.box(b - a, 0.14, 0.09, jit('#7d4e2a', 0.05), (a + b) / 2, 0.48, z + 0.12);
        B.box(b - a, 0.14, 0.09, jit('#7d4e2a', 0.05), (a + b) / 2, 0.92, z + 0.12);
      }
    }
  }

  // ======================================================================
  // ESTRADA + calçada
  for (let x = -64; x < 64; x += 3.2) B.box(1.9, 0.03, 0.2, '#f1c232', x, -0.02, 21.9);
  B.box(128, 0.06, 0.1, '#bdb8ad', 0, -0.01, 19.02);
  B.box(128, 0.06, 0.1, '#bdb8ad', 0, -0.01, 24.98);

  // CERCA DO SUL + PORTÃO
  // (esquerda de quem olha da casa pra rua: portão dos carros; direita: portãozinho de gente)
  fenceLine(-30, 30, FENCE_Z, '#efe7d6', [PED_GATE.x0, GATE.x1]);
  boxC(-40, PED_GATE.x0 + 0.1, FENCE_Z - 0.22, FENCE_Z + 0.25);
  boxC(GATE.x0 - 0.15, GATE.x0 + 0.1, FENCE_Z - 0.22, FENCE_Z + 0.25); // pilar do meio
  const pedBox = boxC(PED_GATE.x0, GATE.x0, FENCE_Z - 0.22, FENCE_Z + 0.25);
  boxC(GATE.x1 - 0.1, 40, FENCE_Z - 0.22, FENCE_Z + 0.25);
  const gateBox = boxC(GATE.x0, GATE.x1, FENCE_Z - 0.22, FENCE_Z + 0.25);
  {
    const gateGroup = new THREE.Group();
    const gateMat = solidMat;
    const leaves = [];
    for (const side of [1, -1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side === 1 ? GATE.x0 + 0.16 : GATE.x1 - 0.16, 0, FENCE_Z + 0.02);
      const GB = new Batcher();
      const wLeaf = (GATE.x1 - GATE.x0) / 2 - 0.32;
      const nS = 7;
      for (let i = 0; i < nS; i++) {
        const lx = side * (0.14 + (i + 0.5) * (wLeaf / nS));
        const hgt = 1.42 - Math.abs(i - (side === 1 ? nS : -1)) * 0.0;
        GB.box(wLeaf / nS - 0.05, hgt, 0.07, jit('#4b2d1b', 0.05), lx, 0.2 + hgt / 2, 0);
      }
      GB.box(wLeaf, 0.12, 0.06, '#3e2516', side * (0.14 + wLeaf / 2), 0.5, 0.06);
      GB.box(wLeaf, 0.12, 0.06, '#3e2516', side * (0.14 + wLeaf / 2), 1.3, 0.06);
      const diag = Math.hypot(wLeaf, 0.8);
      GB.box(0.1, diag, 0.06, '#3e2516', side * (0.14 + wLeaf / 2), 0.9, 0.06, 0, 0, side * Math.atan2(wLeaf, 0.8));
      // trinco
      GB.box(0.12, 0.05, 0.1, '#c9c2b0', side * (0.14 + wLeaf - 0.08), 0.95, 0.1);
      const leaf = GB.build(gateMat);
      pivot.add(leaf);
      gateGroup.add(pivot);
      leaves.push({ pivot, side });
    }
    // portãozinho de pedestre: uma folha só, abre pra dentro do quintal
    const pedPivot = new THREE.Group();
    pedPivot.position.set(PED_GATE.x0 + 0.16, 0, FENCE_Z + 0.02);
    {
      const GB = new Batcher();
      const wLeaf = PED_GATE.x1 - PED_GATE.x0 - 0.32;
      const nS = 4;
      for (let i = 0; i < nS; i++) {
        GB.box(wLeaf / nS - 0.05, 1.42, 0.07, i % 2 ? '#4f301d' : '#47291a', 0.0 + (i + 0.5) * (wLeaf / nS), 0.2 + 0.71, 0);
      }
      GB.box(wLeaf, 0.12, 0.06, '#3e2516', wLeaf / 2, 0.5, -0.06);
      GB.box(wLeaf, 0.12, 0.06, '#3e2516', wLeaf / 2, 1.3, -0.06);
      GB.box(0.1, Math.hypot(wLeaf, 0.8), 0.06, '#3e2516', wLeaf / 2, 0.9, -0.06, 0, 0, Math.atan2(wLeaf, 0.8));
      GB.box(0.12, 0.05, 0.1, '#c9c2b0', wLeaf - 0.08, 0.95, -0.1); // trinco
      pedPivot.add(GB.build(gateMat));
    }
    gateGroup.add(pedPivot);
    // pilares do portão (o do meio separa carro de gente)
    for (const gx of [PED_GATE.x0, GATE.x0, GATE.x1]) {
      B.box(0.36, 1.7, 0.36, '#5a3720', gx, 0.85, FENCE_Z);
      B.box(0.44, 0.1, 0.44, '#efe7d6', gx, 1.72, FENCE_Z);
    }
    scene.add(gateGroup);
    // folhas abertas (giram pra fora, sobre a calçada) — só o carro colide com elas
    const leafBoxes = [
      { x0: GATE.x0 + 0.02, x1: GATE.x0 + 0.3, z0: FENCE_Z, z1: FENCE_Z + 1.85, active: false },
      { x0: GATE.x1 - 0.3, x1: GATE.x1 - 0.02, z0: FENCE_Z, z1: FENCE_Z + 1.85, active: false },
    ];
    world.gate = { leaves, leafBoxes, open: false, t: 0, collider: gateBox, x: (GATE.x0 + GATE.x1) / 2, z: FENCE_Z - 0.9 };
    world.pedGate = { pivot: pedPivot, open: false, t: 0, collider: pedBox, x: (PED_GATE.x0 + PED_GATE.x1) / 2 };
  }
  // calçada de tijolos na frente do portão
  for (let i = 0; i < 4; i++) B.box(0.95, 0.04, 0.8, jit('#c98045', 0.06), GATE.x0 + 0.5 + i, 0.01, 18.2);
  B.box(0.95, 0.04, 0.8, '#c47c43', (PED_GATE.x0 + PED_GATE.x1) / 2, 0.01, 18.2);

  // CERCA DO NORTE + placa
  fenceLine(-30, 30, NORTH_FENCE_Z, '#d8cbb3');
  boxC(-40, 40, NORTH_FENCE_Z - 0.3, NORTH_FENCE_Z + 0.3);
  {
    const sx = world.sign.x, sz = NORTH_FENCE_Z + 0.45;
    B.box(0.18, 1.3, 0.18, '#5a3720', sx - 0.85, 0.65, sz);
    B.box(0.18, 1.3, 0.18, '#5a3720', sx + 0.85, 0.65, sz);
    const wood = new THREE.MeshStandardMaterial({ color: '#7f532c', roughness: 0.9 });
    const face = new THREE.MeshStandardMaterial({ map: makeSignTexture(), roughness: 0.9 });
    const sign = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.05, 0.12), [wood, wood, wood, wood, face, wood]);
    sign.position.set(sx, 1.55, sz + 0.06);
    sign.castShadow = true;
    scene.add(sign);
    circle(sx - 0.85, sz, 0.25);
    circle(sx + 0.85, sz, 0.25);
  }

  // ======================================================================
  // DECK sobre o rio
  {
    const { x0, x1, z0, z1, y } = DECK;
    for (const [px, pz] of [[x0 + 0.15, z0 + 0.15], [x1 - 0.15, z0 + 0.15], [x0 + 0.15, z1 - 0.2], [x1 - 0.15, z1 - 0.2], [(x0 + x1) / 2, z0 + 0.15]]) {
      B.box(0.24, 1.9, 0.24, '#5e3b22', px, y - 0.95, pz);
    }
    const n = Math.round((z1 - z0) / 0.38);
    const pw = (z1 - z0) / n;
    for (let i = 0; i < n; i++) {
      B.box(x1 - x0, 0.1, pw - 0.04, jit(i % 2 ? '#a8703e' : '#9c6636', 0.05), (x0 + x1) / 2, y - 0.05, z0 + pw * (i + 0.5));
    }
    B.box(x1 - x0, 0.22, 0.12, '#7a4a28', (x0 + x1) / 2, y - 0.17, z1 - 0.06);
    B.box(x1 - x0, 0.22, 0.12, '#7a4a28', (x0 + x1) / 2, y - 0.17, z0 + 0.06);
    // guarda-corpo branco (norte e oeste)
    const white = '#f3f1ea';
    const railN = z0 + 0.08, railW = x0 + 0.08;
    for (let x = x0 + 0.08; x <= x1 - 0.05; x += (x1 - x0 - 0.16) / 5) B.box(0.12, 1.0, 0.12, white, x, y + 0.5, railN);
    B.box(x1 - x0, 0.08, 0.1, white, (x0 + x1) / 2, y + 0.98, railN);
    B.box(x1 - x0, 0.06, 0.06, white, (x0 + x1) / 2, y + 0.55, railN);
    for (let z = z0 + 0.08; z <= z1 - 0.05; z += (z1 - z0 - 0.16) / 4) B.box(0.12, 1.0, 0.12, white, railW, y + 0.5, z);
    B.box(0.1, 0.08, z1 - z0, white, railW, y + 0.98, (z0 + z1) / 2);
    B.box(0.06, 0.06, z1 - z0, white, railW, y + 0.55, (z0 + z1) / 2);
    boxC(x0 - 0.15, x0 + 0.25, z0, z1);
    bench(x0 + 1.45, z0 + 0.85, Math.PI, y, 'deck');
  }

  // PONTE (estilo da foto: madeira com guarda-corpo branco em X)
  {
    const { x, z0, z1, w } = BRIDGE;
    const n = Math.round((z1 - z0) / 0.32);
    const step = (z1 - z0) / n;
    for (let i = 0; i < n; i++) {
      const z = z0 + (i + 0.5) * step;
      const yy = bridgeHeight(z);
      const t = (z - z0) / (z1 - z0);
      const slope = (BRIDGE.rise * Math.PI / (z1 - z0)) * Math.cos(Math.PI * t);
      B.box(w, 0.08, step - 0.035, jit(i % 2 ? '#a26a3a' : '#94602f', 0.05), x, yy - 0.04, z, -Math.atan(slope), 0, 0);
    }
    const white = '#f6f6f2';
    const posts = [];
    const nP = 8;
    for (let i = 0; i <= nP; i++) posts.push(z0 + 0.1 + (i / nP) * (z1 - z0 - 0.2));
    for (const sd of [-1, 1]) {
      const px = x + sd * (w / 2 - 0.04);
      for (const pz of posts) B.box(0.08, 1.0, 0.08, white, px, bridgeHeight(pz) + 0.48, pz);
      for (let i = 0; i < posts.length - 1; i++) {
        const za = posts[i], zb = posts[i + 1];
        const ya = bridgeHeight(za), yb = bridgeHeight(zb);
        const zm = (za + zb) / 2, ym = (ya + yb) / 2;
        const len = Math.hypot(zb - za, yb - ya);
        const ang = Math.atan2(yb - ya, zb - za);
        B.box(0.07, 0.07, len, white, px, ym + 0.96, zm, -ang, 0, 0);
        B.box(0.05, 0.05, len, white, px, ym + 0.12, zm, -ang, 0, 0);
        // X
        const dl = Math.hypot(zb - za, 0.84);
        const a1 = Math.atan2(0.84 + (yb - ya), zb - za);
        const a2 = Math.atan2(-0.84 + (yb - ya), zb - za);
        B.box(0.04, 0.04, dl, white, px, ym + 0.54, zm, -a1, 0, 0);
        B.box(0.04, 0.04, dl, white, px, ym + 0.54, zm, -a2, 0, 0);
      }
      // longarinas
      for (let i = 0; i < n; i += 2) {
        const z = z0 + (i + 1) * step;
        B.box(0.12, 0.22, step * 2.05, '#5d3a20', x + sd * (w / 2 - 0.1), bridgeHeight(z) - 0.17, z);
      }
      for (const pz of [posts[2], posts[4], posts[6]]) B.box(0.18, 2.2, 0.18, '#5e3b22', x + sd * (w / 2 - 0.1), -0.9, pz);
    }
    // rampas de concreto nas cabeceiras
    B.box(w + 0.3, 0.12, 0.8, '#c8c2b6', x, 0.02, z1 + 0.2);
    B.box(w + 0.3, 0.12, 0.8, '#c8c2b6', x, 0.02, z0 - 0.2);
  }

  // ======================================================================
  // COQUEIROS (grupos próprios — balançam e soltam cocos)
  const palmSpots = [
    [-1.2, -1.0, 5.7], [-5.6, 1.6, 5.0], [-6.6, 6.2, 5.9], [-2.4, 8.4, 5.3], [1.6, 11.6, 6.1],
  ];
  const coconutGeo = new THREE.IcosahedronGeometry(0.2, 1);
  const coconutMat = new THREE.MeshStandardMaterial({ color: '#7a5a22', roughness: 0.7, flatShading: true });
  world.coconutGeo = coconutGeo;
  world.coconutMat = coconutMat;
  for (const [px, pz, h] of palmSpots) {
    const group = new THREE.Group();
    group.position.set(px, 0, pz);
    const TB = new Batcher();
    const FB = new Batcher();
    const leanA = R() * Math.PI * 2;
    const lean = 0.25 + R() * 0.45;
    const segs = 11;
    let top = new THREE.Vector3();
    for (let i = 0; i < segs; i++) {
      const t = i / segs;
      const yy = (i + 0.5) * (h / segs);
      const off = lean * t * t;
      const sx = Math.cos(leanA) * off, sz = Math.sin(leanA) * off;
      const painted = yy < 1.15;
      const col = painted ? jit('#f2efe6', 0.02) : jit(i % 2 ? '#8a5a2e' : '#795027', 0.04);
      const wdt = 0.46 - t * 0.1;
      TB.box(wdt, h / segs + 0.02, wdt, col, sx, yy, sz, 0, i * 0.35, 0);
      top.set(sx, h, sz);
    }
    const trunk = TB.build(solidMat);
    group.add(trunk);
    const crown = new THREE.Group();
    crown.position.copy(top);
    group.add(crown);
    // folhas
    const nF = 9;
    for (let f = 0; f < nF; f++) {
      const yaw = (f / nF) * Math.PI * 2 + R() * 0.3;
      let pitch = 0.45 + R() * 0.25;
      const p = new THREE.Vector3(0, 0.05, 0);
      for (let k = 0; k < 5; k++) {
        const L2 = 0.62;
        const d = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
        const c = p.clone().addScaledVector(d, L2 / 2);
        const wdt = [0.42, 0.7, 0.78, 0.6, 0.34][k];
        const col = new THREE.Color(k < 2 ? '#6fb53a' : k < 4 ? '#7fc444' : '#94d454').offsetHSL(0, 0, (R() - 0.5) * 0.05);
        FB.box(wdt, 0.06, L2 + 0.05, col, c.x, c.y, c.z, -pitch, yaw, 0);
        // folíolos laterais
        if (k > 0 && k < 4) {
          for (const sd of [-1, 1]) {
            const side = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)).multiplyScalar(sd * (wdt / 2 + 0.12));
            FB.box(0.26, 0.04, 0.16, col, c.x + side.x, c.y - 0.06, c.z + side.z, -pitch, yaw, sd * 0.4);
          }
        }
        p.addScaledVector(d, L2);
        pitch -= 0.34;
      }
    }
    FB.box(0.5, 0.35, 0.5, '#6a4a22', 0, -0.05, 0);
    const fronds = FB.build(leafMat);
    crown.add(fronds);
    // cocos
    const slots = [];
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + 0.4;
      const m = new THREE.Mesh(coconutGeo, coconutMat);
      m.position.set(Math.cos(a) * 0.3, -0.28 - (k % 2) * 0.08, Math.sin(a) * 0.3);
      m.castShadow = true;
      crown.add(m);
      slots.push({ mesh: m, has: true, regrow: 0, grow: 1 });
    }
    scene.add(group);
    world.canopies.push({ x: px + top.x, y: h, z: pz + top.z, r: 2.4 });
    world.palms.push({ x: px, z: pz, group, crown, slots, shake: 0, phase: R() * 6, height: h, leanA, lean });
    circle(px, pz, 0.38);
  }

  // REDE entre os dois coqueiros perto da entrada
  {
    const pa = world.palms.find((p) => p.x === -2.4 && p.z === 8.4);
    const pb = world.palms.find((p) => p.x === 1.6 && p.z === 11.6);
    world.hammock = buildHammock(scene, world, solidMat, pa, pb);
  }

  // ======================================================================
  // CASA (paredes brancas, telhado de telha, varanda de madeira)
  const E = HOUSE_EXT; // quanto a casa cresceu pro sul (tudo ao sul dela andou junto)
  const STONE_PATH = { ax: 19.2, az: 17.0, bx: 21.15, bz: 12.55 + E };
  const MURO = { x: 22.73, z1: 17.3 }; // muro do quintal (quina da capelinha → cerca da frente)
  const roofTex = makeRoofTexture();
  function gableRoof({ cx, cz, axis, len, half, eaveY, ridgeY, rows = 10 }) {
    const rise = ridgeY - eaveY;
    const slopeLen = Math.hypot(half, rise);
    const ang = Math.atan2(rise, half);
    const rowW = (slopeLen / rows) * 1.32;
    const tex = roofTex.clone();
    tex.needsUpdate = true;
    tex.repeat.set(1, len / 0.42);
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 });
    const RB = new Batcher();
    for (const s of [-1, 1]) {
      for (let r = 0; r < rows; r++) {
        const t = (r + 0.5) / rows;
        const off = s * half * (1 - t);
        const yy = eaveY + rise * t + 0.08;
        if (axis === 'z') RB.add(UNIT_BOX, '#ffffff', cx + off, yy, cz, 0, 0, -s * (ang + 0.06), rowW, 0.12, len);
        else RB.add(UNIT_BOX, '#ffffff', cx, yy, cz + off, s * (ang + 0.06), 0, 0, len, 0.12, rowW);
      }
    }
    const roof = RB.build(mat);
    scene.add(roof);
    // cumeeira
    if (axis === 'z') B.box(0.36, 0.22, len + 0.05, '#b4502c', cx, ridgeY + 0.16, cz);
    else B.box(len + 0.05, 0.22, 0.36, '#b4502c', cx, ridgeY + 0.16, cz);
  }
  function gableWall(points, z, depth, color) {
    const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
    const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
    B.add(g, color, 0, 0, z);
  }
  // sw = largura de cada veneziana; steady = não consome o aleatório (mantém o resto do mapa igual)
  function windowOn(axis, wx, wz, y0, w, h, out, sw = w / 2, steady = false) {
    const frame = '#6b3f22', shutter = '#7a4a28';
    const sh = () => (steady ? shutter : jit(shutter, 0.04));
    if (axis === 'x') {
      W.box(0.06, h, w, '#ffffff', wx + out * 0.02, y0 + h / 2, wz);
      B.box(0.12, 0.1, w + 0.24, frame, wx + out * 0.06, y0 - 0.05, wz);
      B.box(0.12, 0.1, w + 0.24, frame, wx + out * 0.06, y0 + h + 0.05, wz);
      for (const sd of [-1, 1]) {
        B.box(0.12, h + 0.2, 0.1, frame, wx + out * 0.06, y0 + h / 2, wz + sd * (w / 2 + 0.05));
        B.box(0.06, h + 0.1, sw, sh(), wx + out * 0.08, y0 + h / 2, wz + sd * (w / 2 + 0.1 + sw / 2));
      }
      B.box(0.08, h, 0.06, frame, wx + out * 0.05, y0 + h / 2, wz);
      B.box(0.08, 0.06, w, frame, wx + out * 0.05, y0 + h / 2, wz);
    } else {
      W.box(w, h, 0.06, '#ffffff', wx, y0 + h / 2, wz + out * 0.02);
      B.box(w + 0.24, 0.1, 0.12, frame, wx, y0 - 0.05, wz + out * 0.06);
      B.box(w + 0.24, 0.1, 0.12, frame, wx, y0 + h + 0.05, wz + out * 0.06);
      for (const sd of [-1, 1]) {
        B.box(0.1, h + 0.2, 0.12, frame, wx + sd * (w / 2 + 0.05), y0 + h / 2, wz + out * 0.06);
        B.box(sw, h + 0.1, 0.06, sh(), wx + sd * (w / 2 + 0.1 + sw / 2), y0 + h / 2, wz + out * 0.08);
      }
      B.box(0.06, h, 0.08, frame, wx, y0 + h / 2, wz + out * 0.05);
      B.box(w, 0.06, 0.08, frame, wx, y0 + h / 2, wz + out * 0.05);
    }
  }
  {
    // base de pedra
    B.box(10.6, 0.5, 12.6 + E, '#b9b2a6', 17.3, 0.25, 2.7 + E / 2);
    for (let z = -3.6; z < 9.0 + E - 0.01; z += 0.6) {
      for (const yy of [0.13, 0.38]) {
        const off = yy > 0.2 ? 0.3 : 0;
        const zz = Math.min(z + off, 8.7 + E);
        B.box(0.06, 0.22, 0.56, jit('#a59d90', 0.08), 11.98, yy, zz + 0.3);
      }
    }
    for (let x = 12.0; x < 22.6; x += 0.6) {
      for (const yy of [0.13, 0.38]) B.box(0.56, 0.22, 0.06, jit('#a59d90', 0.08), x + 0.3 + (yy > 0.2 ? 0.15 : 0), yy, -3.62);
    }
    // degraus
    B.box(0.8, 0.25, 2.3, '#c4bcaf', 11.6, 0.125, 1.75);
    B.box(0.42, 0.5, 2.3, '#bdb5a8', 11.79, 0.25, 1.75);
    // paredes
    const wall = '#f5f2ea';
    B.box(7.0, 3.2, 11.4 + E, wall, 18.5, 2.1, 2.7 + E / 2);
    B.box(7.04, 0.35, 11.44 + E, '#a9a196', 18.5, 0.675, 2.7 + E / 2);
    B.box(0.1, 1.0, 11.4 + E, wall, 15.0, 4.18, 2.7 + E / 2);
    gableWall([[15, 3.7], [15, 4.67], [17.6, 5.8], [22, 3.89], [22, 3.7]], -3.06, 0.1, wall);
    gableWall([[15, 3.7], [15, 4.67], [17.6, 5.8], [22, 3.89], [22, 3.7]], 8.36 + E, 0.1, wall);
    // varanda
    B.box(2.95, 0.08, 12.0 + E, '#9c4a32', 13.52, 0.54, 2.7 + E / 2);
    for (let z = -3.2; z <= 8.6 + E; z += 0.6) B.box(2.9, 0.012, 0.02, '#7d3a28', 13.52, 0.585, z);
    const colZ = [-3.2, 0.5, 2.95, 5.9, 8.6, 8.6 + E];
    for (const z of colZ) B.box(0.24, 2.85, 0.24, jit('#5a3a22', 0.03), 12.45, 1.98, z);
    B.box(0.28, 0.24, 12.1 + E, '#4f321d', 12.45, 3.4, 2.7 + E / 2);
    const rail = (za, zb) => {
      const len = zb - za;
      B.box(0.12, 0.1, len, '#5a3a22', 12.45, 1.4, (za + zb) / 2);
      B.box(0.08, 0.08, len, '#5a3a22', 12.45, 0.95, (za + zb) / 2);
      for (let z = za + 0.3; z < zb - 0.15; z += 0.32) B.box(0.06, 0.8, 0.06, '#5a3a22', 12.45, 1.0, z);
    };
    rail(-1.2, 0.5); // (de -3.2 a -1.2 fica o quartinho da varanda)
    rail(2.95, 5.9);
    rail(5.9, 8.6);
    rail(8.6, 8.6 + E);
    // laterais da varanda
    // (três tábuas largas, como na foto)
    for (const z of [-3.2, 8.6 + E]) {
      for (const yy of [0.88, 1.13, 1.38]) B.box(2.5, 0.15, 0.06, '#54371f', 13.7, yy, z);
      B.box(0.12, 0.95, 0.12, '#5a3a22', 13.9, 1.0, z);
    }
    // porta
    B.box(0.08, 2.2, 1.1, '#7a4426', 14.96, 1.68, 1.75);
    B.box(0.1, 2.3, 0.1, '#5a3220', 14.94, 1.73, 1.15);
    B.box(0.1, 2.3, 0.1, '#5a3220', 14.94, 1.73, 2.35);
    B.box(0.1, 0.1, 1.3, '#5a3220', 14.94, 2.85, 1.75);
    B.box(0.06, 0.06, 0.06, '#d8c070', 14.9, 1.6, 2.1);
    for (const yy of [1.1, 2.1]) B.box(0.03, 0.7, 0.8, '#6a3a20', 14.91, yy, 1.75);
    // segunda porta (fachada: janela, porta, janela, janela, porta, janela)
    {
      const dz = 7.95;
      B.box(0.08, 2.2, 1.0, '#7a4426', 14.96, 1.68, dz);
      B.box(0.1, 2.3, 0.1, '#5a3220', 14.94, 1.73, dz - 0.55);
      B.box(0.1, 2.3, 0.1, '#5a3220', 14.94, 1.73, dz + 0.55);
      B.box(0.1, 0.1, 1.2, '#5a3220', 14.94, 2.85, dz);
      B.box(0.06, 0.06, 0.06, '#d8c070', 14.9, 1.6, dz + 0.32);
      for (const yy of [1.1, 2.1]) B.box(0.03, 0.7, 0.72, '#6a3a20', 14.91, yy, dz);
    }
    // janelas
    // fachada da varanda: janelas um pouco mais estreitas pra caber tudo
    windowOn('x', 15.0, -0.05, 1.4, 1.0, 1.2, -1, 0.42);
    windowOn('x', 15.0, 3.65, 1.4, 1.0, 1.2, -1, 0.42, true);
    windowOn('x', 15.0, 5.95, 1.4, 1.0, 1.2, -1, 0.42);
    windowOn('x', 15.0, 9.8, 1.4, 1.0, 1.2, -1, 0.42);
    windowOn('x', 22.0, 0.0, 1.4, 1.3, 1.2, 1);
    windowOn('x', 22.0, 5.0, 1.4, 1.3, 1.2, 1);
    windowOn('x', 22.0, 9.0, 1.4, 1.3, 1.2, 1);
    windowOn('z', 18.5, -3.0, 1.4, 1.3, 1.2, -1);
    R(); R(); // (janela da empena sul removida) mantém a sequência aleatória
    // quartinho fechado no canto norte da varanda, pintado de branco, com portinha
    {
      const zN = -3.2, zS = -1.2, xO = 12.45, xH = 15.0, y0 = 0.58;
      const zc = (zN + zS) / 2, zl = zS - zN;
      // frente (virada pro gramado, fechada) até a viga da varanda
      B.box(0.12, 3.3 - y0, zl, wall, xO, (y0 + 3.3) / 2, zc);
      // laterais acompanham a inclinação do telhado
      const side = [[xO - 0.06, y0], [xH, y0], [xH, 4.62], [xO - 0.06, 3.5]];
      gableWall(side, zN - 0.07, 0.14, wall);
      gableWall(side, zS - 0.07, 0.12, wall);
      // rodapé cinza igual ao da casa
      const band = '#a9a196';
      B.box(0.14, 0.2, zl + 0.14, band, xO, y0 + 0.1, zc);
      B.box(xH - xO, 0.2, 0.16, band, (xO + xH) / 2, y0 + 0.1, zN);
      B.box(xH - xO, 0.2, 0.14, band, (xO + xH) / 2, y0 + 0.1, zS);
      // portinha na lateral sul, virada pro resto da varanda
      const dz = zS + 0.08, dxc = 13.8, dw = 0.78, dh = 1.85;
      B.box(dw, dh, 0.05, '#7a4426', dxc, y0 + dh / 2, dz);
      for (const sd of [-1, 1]) B.box(0.08, dh + 0.08, 0.08, '#5a3220', dxc + sd * (dw / 2 + 0.04), y0 + (dh + 0.08) / 2, dz + 0.01);
      B.box(dw + 0.16, 0.08, 0.08, '#5a3220', dxc, y0 + dh + 0.04, dz + 0.01);
      for (const yy of [0.5, 1.35]) B.box(dw - 0.24, 0.6, 0.03, '#6a3a20', dxc, y0 + yy, dz + 0.03);
      B.box(0.05, 0.05, 0.05, '#d8c070', dxc - dw / 2 + 0.12, y0 + 0.95, dz + 0.05);
    }
    gableRoof({ cx: 17.6, cz: 2.7 + E / 2, axis: 'z', len: 13.2 + E, half: 5.75, eaveY: 3.3, ridgeY: 5.8, rows: 11 });

    // anexo (o "quartinho" da foto): telhado de uma água virado pro quintal,
    // janela arqueada com moldura de granito e rodapé de pedra
    R(); R(); R(); R(); // mantém a sequência aleatória do resto do mapa igual
    buildAnnex();

    // vasos
    for (const [vx, vz] of [[11.2, 0.25], [11.2, 3.25], [14.4, -0.85]]) {
      B.add(new THREE.CylinderGeometry(0.26, 0.2, 0.45, 10), '#b5573a', vx, vx > 14 ? 0.8 : 0.22, vz);
      for (let i = 0; i < 4; i++) L.box(0.3, 0.3, 0.3, jit('#5aa53a', 0.08), vx + (R() - 0.5) * 0.3, (vx > 14 ? 1.1 : 0.55) + R() * 0.25, vz + (R() - 0.5) * 0.3, 0, R(), 0);
    }
    // luminária da varanda
    const lampBox = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, 0.16), lampMat);
    lampBox.position.set(14.88, 2.95, 0.95);
    scene.add(lampBox);
    world.lamps.push({ x: 14.2, y: 2.8, z: 0.95, power: 9, dist: 10 });
    boxC(11.15, 23.5, -3.8, 9.1 + E);
    boxC(19.45, 22.75, 8.9 + E, 11.2 + E); // anexo
    boxC(11.9, 19.5, 9.0 + E, 10.0 + E); // canteiro
    boxC(MURO.x - 0.2, MURO.x + 0.2, 10.9 + E, MURO.z1); // muro
  }

  // ======================================================================
  // CANTO DO ANEXO (foto): canteiro com meio-fio, terra vermelha,
  // pedras de passagem e muro branco fechando a área
  function buildAnnex() {
    const R2 = mulberry32(2024);
    const j2 = (hex, amt = 0.06) => new THREE.Color(hex).offsetHSL(0, 0, (R2() - 0.5) * amt);
    const X0 = 19.6, X1 = 22.6, Z0 = 8.4 + E, Z1 = 11.0 + E;
    const cx = (X0 + X1) / 2;
    const cream = '#efe6cf';
    const wallTop = 2.5;
    // corpo + empena (telhado de duas águas, cumeeira leste-oeste, frente da capela pro leste)
    B.box(X1 - X0, wallTop, Z1 - Z0, cream, cx, wallTop / 2, (Z0 + Z1) / 2);
    const zr = (Z0 + Z1) / 2, ridgeY = 3.45;
    {
      const shape = new THREE.Shape([
        new THREE.Vector2(-Z0, wallTop - 0.02), new THREE.Vector2(-zr, ridgeY - 0.04), new THREE.Vector2(-Z1, wallTop - 0.02),
      ]);
      const g = new THREE.ExtrudeGeometry(shape, { depth: X1 - X0, bevelEnabled: false });
      B.add(g, cream, X0, 0, 0, 0, Math.PI / 2, 0); // girado: u = -z, profundidade = +x
    }
    // mancha de umidade embaixo, como na foto
    B.box(0.6, 0.32, 0.02, '#e6dcc0', X0 + 0.45, 0.72, Z1 + 0.01);
    B.box(0.02, 0.4, 1.4, '#e6dcc0', X0 - 0.01, 0.75, 10.0 + E);
    // rodapé de pedra (frente sul com a porta, oeste e leste)
    const stones = ['#9b9283', '#a8a091', '#8c8476', '#b3aa98'];
    const doorX0 = cx - 0.68, doorX1 = cx + 0.68; // vão da porta na frente sul
    for (const [row, yy] of [[0, 0.11], [1, 0.33]]) {
      for (const [sa, sb] of [[X0, doorX0], [doorX1, X1]]) {
        for (let x = sa + (row ? 0.25 : 0.02); x < sb - 0.08; x += 0.5) {
          const w = Math.min(0.47, sb - x - 0.03);
          B.box(w, 0.2, 0.06, j2(stones[Math.floor(R2() * 4)], 0.06), x + w / 2, yy, Z1 + 0.02);
        }
      }
      for (let z = Z0 + 0.7 + (row ? 0.25 : 0); z < Z1 - 0.05; z += 0.5) {
        const w = Math.min(0.47, Z1 - z - 0.03);
        B.box(0.06, 0.2, w, j2(stones[Math.floor(R2() * 4)], 0.06), X0 - 0.02, yy, z + w / 2);
      }
      for (let z = Z0 + (row ? 0.25 : 0); z < Z1 - 0.05; z += 0.5) {
        const w = Math.min(0.47, Z1 - z - 0.03);
        B.box(0.06, 0.2, w, j2(stones[Math.floor(R2() * 4)], 0.06), X1 + 0.02, yy, z + w / 2);
      }
    }
    // tomadinha na lateral
    B.box(0.03, 0.14, 0.1, '#ece8de', X0 - 0.02, 0.62, 10.75 + E);

    // arcos: `arc` no plano x-y (paredes viradas pra z), `arcX` no plano z-y (paredes viradas pra x)
    const arc = (bx, cxA, cyA, z, r, thick, depth, colorFn, n) => {
      const chord = 2 * r * Math.sin(Math.PI / (2 * n));
      for (let k = 0; k < n; k++) {
        const a = (Math.PI * (k + 0.5)) / n;
        bx.box(chord * 1.18 + thick * 0.25, thick, depth, colorFn(), cxA + Math.cos(a) * r, cyA + Math.sin(a) * r, z, 0, 0, a + Math.PI / 2);
      }
    };
    const arcX = (bx, x, czA, cyy, rr, thick, depth, colorFn, n) => {
      const chord = 2 * rr * Math.sin(Math.PI / (2 * n));
      for (let k = 0; k < n; k++) {
        const a = (Math.PI * (k + 0.5)) / n;
        bx.box(depth, thick, chord * 1.18 + thick * 0.25, colorFn(), x, cyy + Math.sin(a) * rr, czA + Math.cos(a) * rr, -(a + Math.PI / 2), 0, 0);
      }
    };
    const gran = () => j2(['#8f8b85', '#7f7b76', '#9a958e'][Math.floor(R2() * 3)], 0.05);

    // janela arqueada na lateral leste (virada pro lado de fora do muro)
    {
      const wx = X1, zc = zr, w = 0.78, hR = 0.5, y0 = 1.1, r = w / 2;
      const cyA = y0 + hR;
      // vidro (brilha à noite)
      W.box(0.04, hR, w, '#ffffff', wx + 0.02, y0 + hR / 2, zc);
      for (let i = 0; i < 6; i++) {
        const yy = ((i + 0.5) / 6) * r;
        W.box(0.04, r / 6 + 0.01, 2 * Math.sqrt(r * r - yy * yy), '#ffffff', wx + 0.02, cyA + yy, zc);
      }
      // caixilho de madeira
      const wood = '#7a4826';
      for (const sd of [-1, 1]) B.box(0.08, hR, 0.08, wood, wx + 0.05, y0 + hR / 2, zc + sd * (r + 0.04));
      B.box(0.08, 0.08, w + 0.16, wood, wx + 0.05, y0 - 0.02, zc);
      arcX(B, wx + 0.05, zc, cyA, r + 0.04, 0.08, 0.08, () => wood, 10);
      B.box(0.07, hR + r, 0.05, wood, wx + 0.05, y0 + (hR + r) / 2, zc);
      B.box(0.07, 0.05, w, wood, wx + 0.05, cyA, zc);
      B.box(0.07, 0.04, w, wood, wx + 0.05, y0 + hR * 0.45, zc);
      // moldura de granito
      const gw = 0.2, gr = r + 0.08 + gw / 2;
      for (const sd of [-1, 1]) B.box(0.08, hR + 0.18, gw, gran(), wx + 0.04, y0 + (hR - 0.18) / 2, zc + sd * gr);
      arcX(B, wx + 0.04, zc, cyA, gr, gw, 0.08, gran, 12);
      B.box(0.14, 0.16, 2 * gr + gw + 0.08, gran(), wx + 0.06, y0 - 0.14, zc);
    }

    // telhado de duas águas com telha colonial
    {
      const over = 0.35, half = (Z1 - Z0) / 2 + over;
      const rise = (ridgeY - wallTop) * (half / ((Z1 - Z0) / 2));
      const eaveY = ridgeY - rise, rows = 4;
      const ang = Math.atan2(rise, half);
      const rowW = (Math.hypot(half, rise) / rows) * 1.3;
      const len = X1 - X0 + 0.55, rcx = cx + 0.2;
      const tex = roofTex.clone();
      tex.needsUpdate = true;
      tex.repeat.set(1, len / 0.5);
      const mat = new THREE.MeshStandardMaterial({ map: tex, color: '#f29482', roughness: 0.65 });
      const RB = new Batcher();
      for (const sd of [-1, 1]) {
        for (let i = 0; i < rows; i++) {
          const t = (i + 0.5) / rows; // 0 = beiral, 1 = cumeeira
          RB.add(UNIT_BOX, '#ffffff', rcx, eaveY + rise * t + 0.08, zr + sd * half * (1 - t), 0, -sd * Math.PI / 2, -(ang + 0.05), rowW, 0.12, len);
        }
      }
      scene.add(RB.build(mat));
      B.box(len + 0.04, 0.2, 0.3, '#a8442f', rcx, ridgeY + 0.16, zr); // cumeeira
      // enfeite na ponta da cumeeira + caibros de madeira aparentes na frente
      const fx = rcx + len / 2;
      B.box(0.2, 0.22, 0.34, '#a8442f', fx - 0.08, ridgeY + 0.3, zr);
      B.box(0.12, 0.1, 0.44, '#b24c35', fx - 0.08, ridgeY + 0.45, zr);
      for (const zz of [Z0 + 0.02, zr, Z1 - 0.02]) {
        const yy = zz === zr ? ridgeY - 0.25 : wallTop - 0.08;
        B.box(0.42, 0.18, 0.18, '#5a3d26', X1 + 0.12, yy, zz);
      }
    }

    // frente da capelinha (sul, virada pro quintal): porta de madeira arqueada com vidrinhos,
    // moldura de granito, lampião e degrau de pedra
    {
      const fz = Z1, xc = cx, r = 0.4, y0 = 0.16, hR = 1.4;
      const cyA = y0 + hR;
      const dw = '#4a2f1e';
      // folhas da porta (retângulo + arco)
      B.box(2 * r, hR, 0.06, dw, xc, y0 + hR / 2, fz + 0.02);
      for (let i = 0; i < 6; i++) {
        const yy = ((i + 0.5) / 6) * r;
        B.box(2 * Math.sqrt(r * r - yy * yy), r / 6 + 0.01, 0.06, dw, xc, cyA + yy, fz + 0.02);
      }
      B.box(0.025, hR + r - 0.04, 0.075, '#2e1c11', xc, y0 + (hR + r) / 2, fz + 0.025); // junta das folhas
      // vidrinhos (3 por folha), brilham à noite
      for (const sd of [-1, 1]) {
        for (const yy of [0.72, 1.06, 1.4]) W.box(0.2, 0.26, 0.02, '#ffffff', xc + sd * 0.2, yy, fz + 0.055);
        B.box(0.22, 0.32, 0.02, '#3d2618', xc + sd * 0.2, 0.36, fz + 0.055); // almofada de baixo
      }
      B.box(0.12, 0.05, 0.04, '#c8c2b0', xc, 1.0, fz + 0.07); // trinco
      // marco escuro
      for (const sd of [-1, 1]) B.box(0.06, hR, 0.08, '#33200f', xc + sd * (r + 0.03), y0 + hR / 2, fz + 0.03);
      arc(B, xc, cyA, fz + 0.03, r + 0.03, 0.06, 0.08, () => '#33200f', 10);
      // moldura de granito
      const gw = 0.2, gr = r + 0.06 + gw / 2;
      for (const sd of [-1, 1]) B.box(gw, cyA, 0.08, gran(), xc + sd * gr, cyA / 2, fz + 0.04);
      arc(B, xc, cyA, fz + 0.04, gr, gw, 0.08, gran, 12);
      // degrau de pedra
      B.box(1.25, 0.1, 0.6, j2('#9b968e', 0.04), xc, 0.05, fz + 0.3);
      B.box(1.0, 0.06, 0.5, j2('#8f8b85', 0.04), xc + 0.05, 0.03, fz + 0.85, 0, 0.12, 0);
      // santinho na parede
      B.box(0.11, 0.16, 0.03, '#a59a88', xc + 0.92, 1.25, fz + 0.02);
      B.box(0.05, 0.08, 0.03, '#d8cfb8', xc + 0.92, 1.27, fz + 0.035);
      // lampião ao lado da porta
      const lx = xc - 0.95;
      B.box(0.18, 0.18, 0.03, '#cfd2d4', lx, 2.0, fz + 0.02); // chapinha
      B.box(0.04, 0.04, 0.22, '#9a9da0', lx, 1.97, fz + 0.12); // braço
      B.box(0.24, 0.05, 0.24, '#7d8084', lx, 1.89, fz + 0.24); // chapéu
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
        B.box(w, 0.3, 0.16, j2('#c9c6bf', 0.05), x + w / 2, 0.15, bz1);
      }
      for (let z = bz0; z < bz1 - 0.1; z += 0.78) B.box(0.16, 0.3, Math.min(0.76, bz1 - z), j2('#c9c6bf', 0.05), bx0, 0.15, z + Math.min(0.76, bz1 - z) / 2);
      B.box(bx1 - bx0 - 0.1, 0.2, bz1 - bz0 - 0.08, '#4a7e2c', (bx0 + bx1) / 2 + 0.05, 0.12, (bz0 + bz1) / 2 - 0.04);
      for (let i = 0; i < 26; i++) {
        L.box(0.09, 0.14 + R2() * 0.1, 0.09, j2(R2() > 0.5 ? '#3f7426' : '#4f8a30', 0.05), bx0 + 0.25 + R2() * (bx1 - bx0 - 0.4), 0.26, bz0 + 0.15 + R2() * 0.6, 0, R2(), 0);
      }
    }

    // muro branco com base de pedra: sai da quina da capelinha e vai até a cerca da frente,
    // fechando o quintal pelo lado leste
    {
      const mz0 = Z1, mz1 = MURO.z1, mx = MURO.x, mh = 1.55, base = 0.5;
      const mL = mz1 - mz0, mcz = (mz0 + mz1) / 2;
      B.box(0.32, base, mL, '#a39a8b', mx, base / 2, mcz);
      B.box(0.26, mh - base, mL, '#f2efe7', mx, base + (mh - base) / 2, mcz);
      B.box(0.34, 0.08, mL + 0.04, '#e1ddd3', mx, mh + 0.04, mcz);
      for (const sd of [-1, 1]) {
        for (const [row, yy] of [[0, 0.12], [1, 0.37]]) {
          for (let z = mz0 + (row ? 0.27 : 0.02); z < mz1 - 0.05; z += 0.54) {
            const w = Math.min(0.5, mz1 - z - 0.02);
            B.box(0.03, 0.22, w, j2(stones[Math.floor(R2() * 4)], 0.07), mx + sd * 0.17, yy, z + w / 2);
          }
        }
      }
      // pilarete no fim (junto da cerca) + mourão cinza
      B.box(0.4, mh + 0.2, 0.4, '#f2efe7', mx, (mh + 0.2) / 2, mz1 - 0.2);
      B.box(0.46, 0.08, 0.46, '#e1ddd3', mx, mh + 0.24, mz1 - 0.2);
      B.box(0.18, 2.1, 0.18, '#6f6b66', mx - 0.3, 1.05, mz1 - 0.65, 0.05, 0, 0);
      // torneira (do lado do quintal)
      const tz = 13.6 + E, tx = mx - 0.2;
      B.box(0.05, 0.85, 0.05, '#8a8a8a', tx, 0.45, tz);
      B.box(0.16, 0.05, 0.05, '#8a8a8a', tx - 0.06, 0.86, tz);
      B.box(0.05, 0.06, 0.09, '#b03a2e', tx - 0.12, 0.92, tz);
      circle(tx - 0.05, tz, 0.12);
    }

    // terra vermelha (manchas finas sobre a grama)
    const dirt = (x, z, rx, rz, n) => {
      for (let i = 0; i < n; i++) {
        const a = R2() * Math.PI * 2, d = Math.sqrt(R2());
        const s = 0.18 + R2() * 0.3;
        B.box(s * (1 + R2() * 0.6), 0.02, s, j2(R2() > 0.5 ? '#a2633f' : '#94583a', 0.05),
          x + Math.cos(a) * d * rx, 0.008 + i * 0.0015, z + Math.sin(a) * d * rz, 0, R2() * 0.6, 0);
      }
    };
    dirt(15.8, 10.3 + E, 3.6, 0.28, 40); // faixa na frente do meio-fio
    dirt(13.4, 11.0 + E, 1.0, 0.5, 10);
    dirt(21.0, 11.35 + E, 1.4, 0.25, 14); // pé do anexo
    dirt(MURO.x - 0.3, (Z1 + MURO.z1) / 2, 0.22, (MURO.z1 - Z1) / 2 - 0.2, 28); // pé do muro
    dirt(cx, 12.1 + E, 0.7, 0.4, 10); // frente da porta

    // pedras de passagem: do quintal (perto da cerca) até a porta da capelinha
    {
      const { ax, az, bx, bz } = STONE_PATH;
      const dx = bx - ax, dz = bz - az, L2 = Math.hypot(dx, dz);
      const px = -dz / L2, pz = dx / L2; // perpendicular
      const base = Math.atan2(-pz, px);
      const n = Math.max(4, Math.round(L2 / 0.55));
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        const bend = Math.sin(Math.PI * t) * 0.35 + (R2() - 0.5) * 0.12;
        const x = ax + dx * t + px * bend, z = az + dz * t + pz * bend;
        const w = 0.72 + R2() * 0.18, d = 0.5 + R2() * 0.12, ry = base + (R2() - 0.5) * 0.35;
        B.box(w, 0.06, d, j2('#a9a397', 0.06), x, 0.03, z, 0, ry, 0);
        B.box(w - 0.08, 0.02, d - 0.08, j2('#bdb7aa', 0.05), x, 0.065, z, 0, ry, 0);
      }
    }
  }

  // fios (photo vibe) saindo do poste do vizinho
  {
    const lz = 16.9;
    for (const dz of [-0.05, 0.05]) B.box(40, 0.025, 0.025, '#2b2b2b', 25.4 + 20, 3.3 + dz, lz + 0.05);
    B.box(0.22, 4.2, 0.22, '#6d6a66', 25.4, 2.1, lz);
    circle(25.4, lz, 0.18);
  }

  // ======================================================================
  // BANCOS
  bench(-3.7, 4.0, 0.95, 0, 'coqueiros');
  bench(-14.2, -14.7, 0, 0, 'norte');

  // ÁRVORES
  voxelTree(-9.3, -5.6, 1.5);
  voxelTree(-0.3, -5.3, 1.35);
  const inner = [
    [-20, -4, 1.1], [-24.5, 2, 1.2], [-21.5, 9.5, 1.0], [-25.5, 14.5, 1.0], [-15.5, 13.5, 0.85],
    [14.5, -6.4, 0.95], [24.5, -5.6, 1.1], [27.2, 4, 0.9], [26.5, 13.5, 1.0],
    [-22, -14.2, 1.0], [-6.5, -15.2, 0.85], [10.5, -14.6, 1.0], [20.5, -15.0, 1.05], [-27, -8, 1.0],
    [9.0, 4.0, 0.8, true], [7.5, 14.5, 0.75, true], // removidas: frente da casa e atrás do portão
  ];
  for (const [x, z, s, gone] of inner) voxelTree(x, z, s, true, !!gone);
  // anel externo (fora da área jogável)
  for (let i = 0; i < 90; i++) {
    let x, z;
    const side = R();
    if (side < 0.35) { x = -60 + R() * 120; z = -20 - R() * 18; }
    else if (side < 0.55) { x = -60 + R() * 120; z = 28 + R() * 10; }
    else if (side < 0.78) { x = -32 - R() * 22; z = -18 + R() * 44; }
    else { x = 32 + R() * 22; z = -18 + R() * 44; }
    if (isWater(x, z) || (z > 17.5 && z < 26.5)) continue;
    voxelTree(x, z, 0.8 + R() * 0.6, false);
  }

  // ARBUSTOS e PEDRAS nas margens
  for (let x = -40; x < 40; x += 1.6 + R() * 1.6) {
    for (const sd of [-1, 1]) {
      if (R() < 0.35) continue;
      if (Math.abs(x - BRIDGE.x) < 2.2) continue;
      if (sd === 1 && x > DECK.x0 - 1 && x < DECK.x1 + 0.6) continue;
      const z = riverCenter(x) + sd * (RIVER.hw + 0.9 + R() * 0.6);
      if (isWater(x, z)) continue;
      if (z < -16.8 || z > 17) continue;
      bush(x, z, 0.8 + R() * 0.5, Math.abs(x) < 29);
    }
  }
  for (let ix = -64; ix < 64; ix++) {
    for (let iz = -16; iz < -3; iz++) {
      if (!isRiverTile(ix, iz)) continue;
      const nLand = !isRiverTile(ix, iz - 1), sLand = !isRiverTile(ix, iz + 1);
      if (!nLand && !sLand) continue;
      if (Math.abs(ix + 0.5 - BRIDGE.x) < 1.6) continue;
      if (R() > 0.55) continue;
      const zEdge = nLand ? iz + 0.15 : iz + 0.85;
      rock(ix + R(), RIVER.waterY + 0.05 + R() * 0.12, zEdge, 0.35 + R() * 0.45);
    }
  }

  // TUFOS DE GRAMA e FLORES
  const flowerCols = ['#ffffff', '#ffe14d', '#ff8fb8', '#ff6b4a', '#b98cff'];
  for (let i = 0; i < 520; i++) {
    const x = -30 + R() * 60, z = -17 + R() * 34.5;
    if (isWater(x, z) || isWater(x, z + 0.6) || isWater(x, z - 0.6)) continue;
    if (x > 11 && x < 23.6 && z > -4 && z < 12 + HOUSE_EXT) continue;
    {
      const { ax, az, bx, bz } = STONE_PATH; // pedras de passagem
      const ux = bx - ax, uz = bz - az;
      const t = Math.min(Math.max(((x - ax) * ux + (z - az) * uz) / (ux * ux + uz * uz), 0), 1);
      if (Math.hypot(x - ax - ux * t, z - az - uz * t) < 0.9) continue;
    }
    if (Math.abs(x - MURO.x) < 0.6 && z > 10.8 + HOUSE_EXT && z < MURO.z1 + 0.1) continue; // pé do muro
    if (Math.abs(x - BRIDGE.x) < 1.2 && z < -4.5 && z > -14) continue;
    if (x > DECK.x0 - 0.2 && x < DECK.x1 + 0.2 && z > DECK.z0 && z < DECK.z1 + 0.2) continue;
    if (R() < 0.12) {
      B.box(0.04, 0.22, 0.04, '#4f8f2b', x, 0.11, z);
      B.box(0.13, 0.1, 0.13, flowerCols[Math.floor(R() * 5)], x, 0.24, z);
    } else {
      const g = jit(R() > 0.5 ? '#6aa838' : '#88c24a', 0.05);
      for (let k = 0; k < 3; k++) B.box(0.07, 0.12 + R() * 0.12, 0.07, g, x + (R() - 0.5) * 0.18, 0.1, z + (R() - 0.5) * 0.18, (R() - 0.5) * 0.5, 0, (R() - 0.5) * 0.5);
    }
  }

  // MORROS ao fundo (como na foto)
  const hillGeo = new THREE.IcosahedronGeometry(1, 2);
  const hills = [
    [-70, -100, 60, 34, 34], [5, -118, 70, 44, 32], [70, -98, 55, 30, 34], [-120, -55, 45, 36, 50],
    [-105, 10, 32, 24, 48], [108, -20, 38, 28, 52], [100, 45, 34, 20, 40], [-60, 92, 55, 22, 26],
    [45, 98, 60, 26, 28], [-140, -110, 60, 50, 50], [140, -110, 60, 46, 50],
  ];
  for (const [x, z, sx, sy, sz] of hills) {
    H.add(hillGeo, jit(['#5f9e3a', '#6aa842', '#558f34'][Math.floor(R() * 3)], 0.05), x, -sy * 0.25, z, 0, R() * 3, 0, sx, sy, sz);
  }
  const hillMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 });
  scene.add(H.build(hillMat, { cast: false, receive: false }));

  // NUVENS voxel
  const cloudMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, emissive: '#ffffff', emissiveIntensity: 0.35, flatShading: true });
  world.cloudMat = cloudMat;
  for (let i = 0; i < 12; i++) {
    const CB = new Batcher();
    const n = 5 + Math.floor(R() * 6);
    for (let k = 0; k < n; k++) {
      const s = 2.5 + R() * 3.5;
      CB.box(s * 1.4, s * 0.8, s, '#ffffff', (R() - 0.5) * 9, (R() - 0.3) * 2, (R() - 0.5) * 5);
    }
    const mesh = CB.build(cloudMat, { cast: false, receive: false });
    mesh.position.set(-140 + R() * 280, 34 + R() * 14, -110 + R() * 150);
    scene.add(mesh);
    world.clouds.push({ mesh, speed: 0.8 + R() * 1.2 });
  }

  // ------------------------------------------------------------ montagem
  scene.add(B.build(solidMat));
  scene.add(L.build(leafMat));
  scene.add(W.build(windowMat, { cast: false }));

  return world;
}
