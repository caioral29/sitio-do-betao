import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32, clamp } from './config.js';
import { M, patchMaterial, taperTube, canvasTex } from './kit.js';
import { modelParts } from './assets.js';

// ============================================================================
// Texturas pintadas (folhas, palha de coqueiro, capim, folha de bananeira)
// ============================================================================
function leafPath(g, len, wid) {
  g.beginPath();
  g.moveTo(0, 0);
  g.bezierCurveTo(wid * 0.9, len * 0.18, wid * 0.75, len * 0.72, 0, len);
  g.bezierCurveTo(-wid * 0.75, len * 0.72, -wid * 0.9, len * 0.18, 0, 0);
  g.closePath();
}

export function makeLeafClusterTex(seed, { light = '#7cc243', dark = '#2f6b1c', mid = '#4f9a2a', size = 512, n = 70, leafLen = [44, 70], leafWid = [16, 26], bg = null } = {}) {
  const R = mulberry32(seed);
  const T = canvasTex(size, size, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    if (bg) {
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
    }
    const cx = w / 2, cy = h / 2;
    // galhinhos
    g.strokeStyle = '#4b3420';
    g.lineCap = 'round';
    for (let i = 0; i < 7; i++) {
      const a = R() * Math.PI * 2;
      g.lineWidth = 3 + R() * 2;
      g.beginPath();
      g.moveTo(cx, cy);
      g.quadraticCurveTo(cx + Math.cos(a + 0.4) * w * 0.2, cy + Math.sin(a + 0.4) * h * 0.2, cx + Math.cos(a) * w * 0.38, cy + Math.sin(a) * h * 0.38);
      g.stroke();
    }
    const cols = [dark, mid, mid, light];
    for (let i = 0; i < n; i++) {
      const a = R() * Math.PI * 2;
      const d = Math.sqrt(R()) * w * (bg ? 0.7 : 0.33);
      const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
      const len = (leafLen[0] + R() * (leafLen[1] - leafLen[0])) * (size / 512);
      const wid = (leafWid[0] + R() * (leafWid[1] - leafWid[0])) * (size / 512);
      const rot = a - Math.PI / 2 + (R() - 0.5) * 1.1;
      g.save();
      g.translate(x, y);
      g.rotate(rot);
      const c = cols[Math.floor(R() * cols.length)];
      const grd = g.createLinearGradient(0, 0, 0, len);
      grd.addColorStop(0, shade(c, -0.25));
      grd.addColorStop(0.5, c);
      grd.addColorStop(1, shade(c, 0.12));
      g.fillStyle = grd;
      leafPath(g, len, wid);
      g.fill();
      g.strokeStyle = shade(c, -0.35);
      g.globalAlpha = 0.35;
      g.lineWidth = 1.2;
      g.stroke();
      g.globalAlpha = 0.5;
      g.strokeStyle = shade(c, 0.3);
      g.beginPath();
      g.moveTo(0, len * 0.05);
      g.lineTo(0, len * 0.9);
      g.stroke();
      g.globalAlpha = 1;
      g.restore();
    }
  }, { dilate: !bg });
  return T;
}

function shade(hex, k) {
  const c = new THREE.Color(hex);
  if (k > 0) c.lerp(new THREE.Color('#ffffff'), k);
  else c.multiplyScalar(1 + k);
  return '#' + c.getHexString();
}

// palha do coqueiro: v = ao longo da palha (0 base, 1 ponta), u = largura
function makeFrondTex() {
  const R = mulberry32(31);
  return canvasTex(256, 1024, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const cx = w / 2;
    for (let i = 0; i < 84; i++) {
      const t = 0.05 + (i / 84) * 0.93;
      const y = h - t * h;
      const prof = Math.sin(Math.PI * Math.pow(t, 0.75)) * (1 - t * 0.25);
      const len = (0.15 + prof * 0.85) * w * 0.5;
      for (const sd of [-1, 1]) {
        const ang = sd * (0.5 + t * 0.25);
        g.save();
        g.translate(cx, y);
        g.rotate(-ang);
        const c = ['#4c8f2a', '#5ea232', '#3f7d24', '#6cae3a'][Math.floor(R() * 4)];
        const grd = g.createLinearGradient(0, 0, 0, -len);
        grd.addColorStop(0, shade(c, -0.3));
        grd.addColorStop(0.7, c);
        grd.addColorStop(1, shade(c, 0.18));
        g.fillStyle = grd;
        g.beginPath();
        const wd = 9 + R() * 3;
        g.moveTo(0, 0);
        g.quadraticCurveTo(wd, -len * 0.5, 0, -len);
        g.quadraticCurveTo(-wd * 0.6, -len * 0.5, 0, 0);
        g.fill();
        g.restore();
      }
    }
    // talo
    const grd = g.createLinearGradient(0, h, 0, 0);
    grd.addColorStop(0, '#8a7a3a');
    grd.addColorStop(1, '#9fb046');
    g.strokeStyle = grd;
    g.lineCap = 'round';
    g.lineWidth = 9;
    g.beginPath();
    g.moveTo(cx, h);
    g.lineTo(cx, 6);
    g.stroke();
  }, { dilate: true });
}

function makeGrassTex() {
  const R = mulberry32(12);
  return canvasTex(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) {
      const x = w * 0.12 + R() * w * 0.76;
      const lean = (R() - 0.5) * w * 0.35;
      const hh = h * (0.45 + R() * 0.5);
      const c = ['#5d9a2a', '#6fae31', '#82bd3a', '#4f8c26'][Math.floor(R() * 4)];
      const grd = g.createLinearGradient(0, h, 0, h - hh);
      grd.addColorStop(0, shade(c, -0.12));
      grd.addColorStop(0.6, c);
      grd.addColorStop(1, shade(c, 0.28));
      g.fillStyle = grd;
      g.beginPath();
      const bw = 2 + R() * 2.2;
      g.moveTo(x - bw, h);
      g.quadraticCurveTo(x + lean * 0.4, h - hh * 0.6, x + lean, h - hh);
      g.quadraticCurveTo(x + lean * 0.4 + bw * 0.5, h - hh * 0.55, x + bw, h);
      g.fill();
    }
  }, { dilate: true });
}

function makeBananaTex() {
  return canvasTex(256, 512, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const cx = w / 2;
    const grd = g.createLinearGradient(0, 0, w, 0);
    grd.addColorStop(0, '#3f8a2a');
    grd.addColorStop(0.5, '#62ad3a');
    grd.addColorStop(1, '#3b8226');
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(cx, h);
    g.bezierCurveTo(w * 1.02, h * 0.85, w * 1.02, h * 0.12, cx, 0);
    g.bezierCurveTo(-w * 0.02, h * 0.12, -w * 0.02, h * 0.85, cx, h);
    g.fill();
    // nervuras
    g.strokeStyle = 'rgba(30,70,20,0.35)';
    g.lineWidth = 1.5;
    for (let y = 20; y < h - 10; y += 9) {
      for (const sd of [-1, 1]) {
        g.beginPath();
        g.moveTo(cx, y);
        g.lineTo(cx + sd * w * 0.48, y - 22);
        g.stroke();
      }
    }
    // rasgos típicos da folha de bananeira
    g.globalCompositeOperation = 'destination-out';
    const R = mulberry32(5);
    for (let i = 0; i < 9; i++) {
      const y = 60 + R() * (h - 120);
      const sd = R() < 0.5 ? -1 : 1;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(cx + sd * 10, y);
      g.lineTo(cx + sd * w * 0.6, y - 26);
      g.stroke();
    }
    g.globalCompositeOperation = 'source-over';
    g.strokeStyle = '#b5c86a';
    g.lineWidth = 7;
    g.beginPath();
    g.moveTo(cx, h);
    g.lineTo(cx, 4);
    g.stroke();
  }, { dilate: true });
}

// ============================================================================
// Materiais da folhagem
// ============================================================================
export const F = {};
export function makeFloraMaterials() {
  if (F.ready) return F;
  const leafStd = (map, extra = {}) => new THREE.MeshStandardMaterial({
    map, alphaTest: 0.45, side: THREE.DoubleSide, vertexColors: true, roughness: 0.82, metalness: 0, ...extra,
  });
  F.texBroad = makeLeafClusterTex(7, { light: '#86c44a', mid: '#4f962a', dark: '#2c641b', n: 64, leafLen: [52, 84], leafWid: [20, 32] });
  F.texSmall = makeLeafClusterTex(9, { light: '#a5d65a', mid: '#69b03a', dark: '#3c7f24', n: 120, leafLen: [30, 48], leafWid: [11, 18] });
  F.texDark = makeLeafClusterTex(13, { light: '#5fa83a', mid: '#3a7d26', dark: '#1f4f17', n: 90, leafLen: [40, 66], leafWid: [15, 24] });
  F.broad = patchMaterial(leafStd(F.texBroad), { kind: 'leaf', sway: 0.03, swayFrom: 1.6, noFlip: true });
  F.small = patchMaterial(leafStd(F.texSmall), { kind: 'leaf', sway: 0.03, swayFrom: 1.6, noFlip: true });
  F.dark = patchMaterial(leafStd(F.texDark), { kind: 'leaf', sway: 0.03, swayFrom: 1.6, noFlip: true });
  F.texFill = makeLeafClusterTex(17, { light: '#5e9e34', mid: '#3f7f27', dark: '#2a5c1b', n: 160, leafLen: [40, 66], leafWid: [15, 24], bg: '#2f6620' });
  F.fill = patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, map: F.texFill }), { kind: 'leaf', sway: 0.03, swayFrom: 1.6, noFlip: true });
  F.frond = patchMaterial(leafStd(makeFrondTex(), { roughness: 0.7 }), { kind: 'leaf', sway: 0.022, swayFrom: 2.5, noFlip: true });
  F.banana = patchMaterial(leafStd(makeBananaTex(), { roughness: 0.6, alphaTest: 0.4 }), { kind: 'leaf', sway: 0.03, swayFrom: 1.2, noFlip: true });
  F.grass = patchMaterial(new THREE.MeshStandardMaterial({ map: makeGrassTex(), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.9 }), { sway: 0.32, swayFrom: 0.02, noFlip: true });
  F.ready = true;
  return F;
}

// ============================================================================
// Árvores "fofas": tronco + galhos (tubo afunilado) e copa de cartões de folha
// ============================================================================
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m4 = new THREE.Matrix4();
const QUAD = new THREE.PlaneGeometry(1, 1);

// cartões de folha em volta de "bolhas"; normais saem do centro da copa (sombreado macio)
function canopyCards(blobs, center, R, { count, size, tint = [0.75, 1.15] }) {
  const pos = [], nor = [], uv = [], col = [], idx = [];
  const base = QUAD.attributes.position, buv = QUAD.attributes.uv;
  let vi = 0;
  const top = Math.max(...blobs.map((b) => b.y + b.r)), bot = Math.min(...blobs.map((b) => b.y - b.r));
  for (let i = 0; i < count; i++) {
    const b = blobs[Math.floor(R() * blobs.length)];
    let u, v, w;
    do {
      u = R() * 2 - 1;
      v = R() * 2 - 1;
      w = R() * 2 - 1;
    } while (u * u + v * v + w * w > 1);
    const l = Math.hypot(u, v, w) || 1;
    const rr = b.r * (0.55 + 0.45 * Math.pow(l, 0.35));
    const px = b.x + (u / l) * rr, py = b.y + (v / l) * rr * 0.85, pz = b.z + (w / l) * rr;
    const s = size * (0.75 + R() * 0.5);
    _q.setFromEuler(new THREE.Euler(R() * Math.PI, R() * Math.PI, R() * Math.PI));
    // normal "esférica" (do centro da copa), um pouco puxada pra cima
    const n = _v.set(px - center.x, (py - center.y) * 0.8 + 0.35, pz - center.z).normalize().clone();
    // tom: mais claro em cima e por fora, mais escuro embaixo e por dentro (oclusão falsa)
    const hgt = clamp((py - bot) / (top - bot + 1e-3), 0, 1);
    const k = (tint[0] + (tint[1] - tint[0]) * (0.25 + 0.75 * hgt)) * (0.85 + 0.25 * Math.pow(l, 2)) * (0.92 + R() * 0.16);
    for (let j = 0; j < base.count; j++) {
      _v.set(base.getX(j) * s, base.getY(j) * s, 0).applyQuaternion(_q);
      pos.push(px + _v.x, py + _v.y, pz + _v.z);
      nor.push(n.x, n.y, n.z);
      uv.push(buv.getX(j), buv.getY(j));
      col.push(k, k, k * 0.95);
    }
    const bi = QUAD.index.array;
    for (let j = 0; j < bi.length; j++) idx.push(vi + bi[j]);
    vi += base.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g.toNonIndexed();
}

// bolhas internas escuras (tapam o "céu" através da copa)
function fillBlob(b, center, R, shadeK = 0.55, det = 2) {
  const g = new THREE.IcosahedronGeometry(b.r * 0.7, det);
  const p = g.attributes.position;
  const col = [];
  const uv = [];
  for (let i = 0; i < p.count; i++) {
    _v.set(p.getX(i), p.getY(i), p.getZ(i));
    const k = 1 + (Math.sin(_v.x * 3.1 + b.x) * Math.sin(_v.y * 2.7 + b.z) * Math.sin(_v.z * 3.3)) * 0.18;
    _v.multiplyScalar(k);
    _v.y *= 0.85;
    p.setXYZ(i, _v.x + b.x, _v.y + b.y, _v.z + b.z);
    const hk = shadeK * (0.8 + 0.4 * clamp((_v.y / b.r) * 0.5 + 0.5, 0, 1));
    col.push(hk, hk, hk);
    uv.push((_v.x + _v.z) * 0.6, _v.y * 0.6);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  // normais esféricas a partir do centro da copa
  const n = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    _v.set(p.getX(i) - center.x, p.getY(i) - center.y + 0.3, p.getZ(i) - center.z).normalize();
    n.setXYZ(i, _v.x, _v.y, _v.z);
  }
  return g.toNonIndexed();
}

// devolve { bark: [geos], leaves: {mat: [geos]}, fill: [geos], canopy: {x,y,z,r} }
export function treeGeometry(x, z, s, R, style = 'broad', detail = 1) {
  const out = { bark: [], leaves: [], fill: [] };
  const th = (2.1 + R() * 0.8) * s; // altura até a copa
  const lean = new THREE.Vector3((R() - 0.5) * 0.5 * s, 0, (R() - 0.5) * 0.5 * s);
  const top = new THREE.Vector3(x + lean.x, th, z + lean.z);
  const trunk = new THREE.CatmullRomCurve3([
    new THREE.Vector3(x, -0.15, z),
    new THREE.Vector3(x + lean.x * 0.2 + (R() - 0.5) * 0.15 * s, th * 0.4, z + lean.z * 0.2 + (R() - 0.5) * 0.15 * s),
    new THREE.Vector3(x + lean.x * 0.7, th * 0.8, z + lean.z * 0.7),
    top,
  ]);
  const r0 = 0.24 * s, r1 = 0.13 * s;
  out.bark.push(taperTube(trunk, r0, r1, detail > 0.5 ? 12 : 5, detail > 0.5 ? 12 : 6, { uvLen: 0.6, uvAround: 1.5, wobble: 0.12, seed: x * 3 + z }));
  // raízes aparentes na base
  if (detail > 0.5) {
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + R();
      const c = new THREE.CatmullRomCurve3([
        new THREE.Vector3(x, 0.45 * s, z),
        new THREE.Vector3(x + Math.cos(a) * 0.3 * s, 0.12 * s, z + Math.sin(a) * 0.3 * s),
        new THREE.Vector3(x + Math.cos(a) * 0.6 * s, -0.05, z + Math.sin(a) * 0.6 * s),
      ]);
      out.bark.push(taperTube(c, 0.12 * s, 0.03 * s, 6, 6, { uvLen: 0.6, uvAround: 0.6 }));
    }
  }
  // copa: bolhas em volta do topo
  const cr = (1.75 + R() * 0.35) * s;
  const center = new THREE.Vector3(top.x, th + cr * 0.7, top.z);
  const nb = 4 + Math.floor(R() * 3);
  const blobs = [{ x: center.x, y: center.y + cr * 0.15, z: center.z, r: cr * 0.85 }];
  for (let i = 0; i < nb; i++) {
    const a = (i / nb) * Math.PI * 2 + R() * 0.6;
    const d = cr * (0.55 + R() * 0.25);
    blobs.push({ x: center.x + Math.cos(a) * d, y: center.y + (R() - 0.45) * cr * 0.55, z: center.z + Math.sin(a) * d, r: cr * (0.5 + R() * 0.22) });
  }
  // galhos do topo do tronco até as bolhas
  for (const b of blobs.slice(1)) {
    const mid = new THREE.Vector3((top.x + b.x) / 2, (top.y + b.y) / 2 - 0.1 * s, (top.z + b.z) / 2);
    const c = new THREE.CatmullRomCurve3([top.clone().setY(top.y - 0.35 * s), mid, new THREE.Vector3(b.x, b.y, b.z)]);
    out.bark.push(taperTube(c, r1 * 0.8, 0.03 * s, detail > 0.5 ? 6 : 3, detail > 0.5 ? 7 : 4, { uvLen: 0.6, uvAround: 0.8 }));
  }
  const count = Math.round((detail > 0.5 ? 260 : 70) * s * s * (0.9 + R() * 0.2));
  out.leaves.push(canopyCards(blobs, center, R, { count, size: (detail > 0.5 ? 1.25 : 1.8) * Math.sqrt(s) }));
  for (const b of blobs) out.fill.push(fillBlob(b, center, R, style === 'dark' ? 0.75 : 0.9, detail > 0.5 ? 2 : 1));
  out.canopy = { x: center.x, y: center.y, z: center.z, r: cr * 1.45 };
  out.style = style;
  return out;
}

// ============================================================================
// Coqueiro (tronco anelado + caiação branca na base, palhas curvas e cocos)
// ============================================================================
// o centro do tronco segue a mesma curva do jogo antigo (a rede amarra nele)
export function palmOffset(palm, y) {
  const segs = 11;
  const t = Math.max(0, y / (palm.height / segs) - 0.5) / segs;
  const off = palm.lean * t * t;
  return { x: Math.cos(palm.leanA) * off, z: Math.sin(palm.leanA) * off };
}

function frondGeometry(R, len, yaw, pitch0, width = 1.0) {
  const segs = 14;
  const pos = [], uv = [], idx = [], col = [];
  const p = new THREE.Vector3(0, 0, 0);
  let pitch = pitch0;
  const fold = 0.38 + R() * 0.2;
  const twist = (R() - 0.5) * 0.3;
  for (let i = 0; i <= segs; i++) {
    const s = i / segs;
    const d = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    const side = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const up = new THREE.Vector3().crossVectors(side, d).normalize();
    const w = width * (0.1 + 0.9 * Math.sin(Math.PI * Math.pow(s, 0.7))) * (1 - s * 0.35) * 0.5;
    const roll = twist * s;
    for (const k of [-1, 0, 1]) {
      const v = p.clone();
      if (k !== 0) {
        const sd = side.clone().applyAxisAngle(d, roll);
        v.addScaledVector(sd, k * w * Math.cos(fold)).addScaledVector(up, w * Math.sin(fold) * 1.0 - w * 0.12);
      }
      pos.push(v.x, v.y, v.z);
      uv.push(k * 0.5 + 0.5, s);
      const c = 0.8 + s * 0.25;
      col.push(c, c, c);
    }
    p.addScaledVector(d, len / segs);
    pitch -= (0.85 + R() * 0.3) / segs * (1 + s * 1.3);
  }
  for (let i = 0; i < segs; i++) {
    for (let k = 0; k < 2; k++) {
      const a = i * 3 + k, b = a + 3;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // normais mais "pra cima": palha bem iluminada de longe
  const n = g.attributes.normal;
  for (let i = 0; i < n.count; i++) {
    _v.set(n.getX(i), n.getY(i), n.getZ(i));
    if (_v.y < 0) _v.negate();
    _v.y += 0.6;
    _v.normalize();
    n.setXYZ(i, _v.x, _v.y, _v.z);
  }
  return g;
}

export function buildPalmModel(palm, R, { coconuts = true, coconutGeo, coconutMat } = {}) {
  const { height: h } = palm;
  const group = new THREE.Group();
  // tronco
  const pts = [];
  for (let i = 0; i <= 10; i++) {
    const y = (i / 10) * h;
    const o = palmOffset(palm, y);
    pts.push(new THREE.Vector3(o.x, y - (i === 0 ? 0.1 : 0), o.z));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const tube = taperTube(curve, 0.2, 0.135, 24, 14, { uvLen: 0.85, uvAround: 1 });
  // base mais grossa (bulbo) e anéis
  const p = tube.attributes.position;
  const ringCol = [];
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const o = palmOffset(palm, y);
    const dx = p.getX(i) - o.x, dz = p.getZ(i) - o.z;
    const k = 1 + Math.max(0, 0.9 - y) * 0.45 + Math.sin(y * 9.5) * 0.025;
    p.setX(i, o.x + dx * k);
    p.setZ(i, o.z + dz * k);
    // caiação branca até ~1,15 m
    const white = y < 1.12 ? 1 : 0;
    ringCol.push(white ? 2.3 : 0.72, white ? 2.3 : 0.64, white ? 2.25 : 0.55);
  }
  tube.setAttribute('color', new THREE.Float32BufferAttribute(ringCol, 3));
  tube.computeVertexNormals();
  const trunk = new THREE.Mesh(tube, M.palm);
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  group.add(trunk);

  const top = palmOffset(palm, h);
  const crown = new THREE.Group();
  crown.position.set(top.x, h, top.z);
  group.add(crown);
  // palhas
  const geos = [];
  const nF = 18;
  for (let f = 0; f < nF; f++) {
    const yaw = (f / nF) * Math.PI * 2 + R() * 0.35;
    const young = f % 5 === 0;
    const pitch = young ? 1.0 + R() * 0.3 : 0.35 + R() * 0.35;
    const len = (young ? 2.0 : 2.7 + R() * 0.7) * (h / 5.6);
    const g = frondGeometry(R, len, yaw, pitch, young ? 0.9 : 1.35 + R() * 0.25);
    g.translate(0, 0.05, 0);
    geos.push(g);
  }
  const fronds = new THREE.Mesh(mergeGeometries(geos), F.frond);
  fronds.castShadow = true;
  crown.add(fronds);
  // "coração" do coqueiro (bainhas das palhas)
  const heartGeo = new THREE.SphereGeometry(0.15, 14, 10);
  heartGeo.setAttribute('color', new THREE.Float32BufferAttribute(new Array(heartGeo.attributes.position.count * 3).fill(0.55), 3));
  const heart = new THREE.Mesh(heartGeo, M.palm);
  heart.scale.set(1, 1.4, 1);
  heart.position.y = -0.1;
  heart.castShadow = true;
  crown.add(heart);
  const slots = [];
  if (coconuts) {
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + 0.4;
      const m = new THREE.Mesh(coconutGeo, coconutMat);
      m.position.set(Math.cos(a) * 0.27, -0.3 - (k % 2) * 0.08, Math.sin(a) * 0.27);
      m.rotation.set(R() * 0.5, R() * 3, R() * 0.5);
      m.castShadow = true;
      crown.add(m);
      slots.push({ mesh: m, has: true, regrow: 0, grow: 1 });
    }
  }
  return { group, crown, slots, top };
}

// ============================================================================
// Bananeira (pseudocaule + folhas grandes)
// ============================================================================
export function bananaGeometry(x, z, s, R) {
  const stems = [], leaves = [];
  const n = 2 + Math.floor(R() * 2);
  for (let k = 0; k < n; k++) {
    const bx = x + (R() - 0.5) * 0.9 * s, bz = z + (R() - 0.5) * 0.9 * s;
    const hh = (1.6 + R() * 0.9) * s * (k === 0 ? 1 : 0.7);
    const c = new THREE.CatmullRomCurve3([new THREE.Vector3(bx, -0.05, bz), new THREE.Vector3(bx + (R() - 0.5) * 0.1, hh * 0.5, bz), new THREE.Vector3(bx + (R() - 0.5) * 0.2, hh, bz + (R() - 0.5) * 0.2)]);
    stems.push(taperTube(c, 0.13 * s, 0.08 * s, 6, 8, { uvLen: 0.7, uvAround: 0.7 }));
    const top = c.getPointAt(1);
    const nl = 6 + Math.floor(R() * 3);
    for (let i = 0; i < nl; i++) {
      const yaw = (i / nl) * Math.PI * 2 + R() * 0.4;
      const len = (1.3 + R() * 0.6) * s;
      const g = frondGeometry(R, len, yaw, 0.9 + R() * 0.5, 0.75 * s);
      g.translate(top.x, top.y - 0.05, top.z);
      leaves.push(g);
    }
  }
  return { stems, leaves };
}

// ============================================================================
// Gramado: tufos instanciados (3 cartões cruzados)
// ============================================================================
export function grassTuftGeometry() {
  const parts = [];
  for (let i = 0; i < 3; i++) {
    const g = new THREE.PlaneGeometry(0.55, 0.42);
    g.translate(0, 0.21, 0);
    g.rotateY((i / 3) * Math.PI);
    parts.push(g);
  }
  const g = mergeGeometries(parts);
  const n = g.attributes.normal;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  return g;
}

export function scatterGrass(scene, spots, R) {
  const geo = grassTuftGeometry();
  const mesh = new THREE.InstancedMesh(geo, F.grass, spots.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
  spots.forEach((sp, i) => {
    q.setFromEuler(new THREE.Euler(0, R() * Math.PI, 0));
    const k = sp.s;
    s.set(k, k * (0.8 + R() * 0.5), k);
    m.compose(p.set(sp.x, sp.y || 0, sp.z), q, s);
    mesh.setMatrixAt(i, m);
    c.setHSL(0.235 + R() * 0.04, 0.5 + R() * 0.15, 0.42 + R() * 0.1);
    mesh.setColorAt(i, c.multiplyScalar(1.6));
  });
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

// ============================================================================
// Modelos CC0 (flores, samambaias, pedras): instâncias por variação
// ============================================================================
export function scatterModel(scene, model, placements, { cast = true, sway = 0, tint = null, roughness = null } = {}) {
  if (!placements.length) return [];
  const parts = modelParts(model);
  const byPart = parts.map(() => []);
  for (const pl of placements) byPart[pl.v % parts.length].push(pl);
  const out = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  parts.forEach((part, pi) => {
    const list = byPart[pi];
    if (!list.length) return;
    for (const src of part.meshes) {
      const geo = src.geometry.clone();
      // traz a variação pra origem (as variações vêm lado a lado no arquivo)
      src.updateWorldMatrix(true, false);
      const local = src.matrixWorld.clone();
      local.premultiply(new THREE.Matrix4().makeTranslation(-part.origin.x, -part.origin.y, -part.origin.z));
      geo.applyMatrix4(local);
      let mat = src.material;
      if (!mat.userData.betao) {
        mat = mat.clone();
        mat.userData.betao = true;
        if (tint) mat.color.set(tint);
        if (roughness !== null) mat.roughness = roughness;
        patchMaterial(mat, { sway, swayFrom: 0.05 });
        src.material = mat;
      }
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((pl, i) => {
        q.setFromEuler(new THREE.Euler(0, pl.ry ?? 0, 0));
        s.setScalar(pl.s ?? 1);
        if (pl.sy) s.y *= pl.sy;
        m.compose(p.set(pl.x, pl.y ?? 0, pl.z), q, s);
        im.setMatrixAt(i, m);
      });
      im.castShadow = cast;
      im.receiveShadow = true;
      scene.add(im);
      out.push(im);
    }
  });
  return out;
}
