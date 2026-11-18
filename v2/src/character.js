import * as THREE from 'three';
import { mergeVertices, mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CHAR_SCALE, HIP, mulberry32 } from './config.js';
import { canvasTex } from './kit.js';

// ============================================================================
// O Betão — personagem estilizado (proporções humanas, visual "de jogo de vida")
// Referência: fotos do rosto (cabelo grisalho curto, sobrancelhas grossas, barba
// por fazer, olhar sério) + figurino (regata preta, bermuda cargo marinho, chinelo)
// Espaço do modelo: y = 0 na sola, +z = frente. HIP = altura do quadril.
// ============================================================================

export const SKIN = '#c99a7c';
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const interp = (tab, x) => {
  for (let i = 1; i < tab.length; i++) {
    if (x <= tab[i][0]) {
      const [x0, y0] = tab[i - 1], [x1, y1] = tab[i];
      return y0 + (y1 - y0) * smooth(0, 1, (x - x0) / (x1 - x0));
    }
  }
  return tab[tab.length - 1][1];
};
function hash3(x, y, z) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}
function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const L = (a, b, t) => a + (b - a) * t;
  const h = (i, j, k) => hash3(xi + i, yi + j, zi + k);
  return L(L(L(h(0, 0, 0), h(1, 0, 0), u), L(h(0, 1, 0), h(1, 1, 0), u), v), L(L(h(0, 0, 1), h(1, 0, 1), u), L(h(0, 1, 1), h(1, 1, 1), u), v), w);
}

// ----------------------------------------------------------------------------- materiais
function makeMats() {
  const skin = new THREE.MeshPhysicalMaterial({
    color: SKIN, roughness: 0.55, sheen: 0.35, sheenColor: new THREE.Color('#ff9f84'), sheenRoughness: 0.6,
  });
  const cloth = (c, r = 0.9) => new THREE.MeshPhysicalMaterial({ color: c, roughness: r, sheen: 0.6, sheenColor: new THREE.Color('#9aa6c0'), sheenRoughness: 0.8, vertexColors: true });
  return {
    skin,
    top: new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.8, sheen: 0.4, sheenColor: new THREE.Color('#b8aca6'), sheenRoughness: 0.7, vertexColors: true }), // regata (tecido preto + pele nos ombros)
    shorts: cloth('#253b6e', 0.88),
    shortsD: cloth('#1c2e58', 0.9),
    rubber: new THREE.MeshStandardMaterial({ color: '#17171a', roughness: 0.7 }),
    hair: new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.62, sheen: 0.35, sheenColor: new THREE.Color('#7d7a80'), sheenRoughness: 0.5 }),
    brow: new THREE.MeshStandardMaterial({ color: '#33302e', roughness: 0.95 }),
    eye: new THREE.MeshPhysicalMaterial({ map: eyeTex(), roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.05 }),
    lip: new THREE.MeshPhysicalMaterial({ color: '#b27662', roughness: 0.5, sheen: 0.3, sheenColor: new THREE.Color('#ffb0a0') }),
  };
}

function eyeTex() {
  return canvasTex(256, 128, (g, w, h) => {
    g.fillStyle = '#f2ece6';
    g.fillRect(0, 0, w, h);
    // íris (castanho escuro), centrada em u = 0.25 (+z, frente da esfera)
    const cx = w * 0.25, cy = h * 0.5;
    const grd = g.createRadialGradient(cx, cy, 2, cx, cy, 22);
    grd.addColorStop(0, '#1a0f08');
    grd.addColorStop(0.32, '#1a0f08');
    grd.addColorStop(0.38, '#4a2c17');
    grd.addColorStop(0.8, '#6b4226');
    grd.addColorStop(1, '#2a180c');
    g.fillStyle = grd;
    g.beginPath();
    g.arc(cx, cy, 19, 0, Math.PI * 2);
    g.fill();
    // veias/sombra nas bordas
    const v = g.createLinearGradient(0, 0, 0, h);
    v.addColorStop(0, 'rgba(120,80,70,0.35)');
    v.addColorStop(0.3, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(120,80,70,0.25)');
    g.fillStyle = v;
    g.fillRect(0, 0, w, h);
  }, { repeat: false });
}

// ----------------------------------------------------------------------------- cabeça
// Ponto da superfície da cabeça a partir de uma direção da esfera unitária
const HC = new THREE.Vector3(0, 0.165, 0.004); // centro do crânio (espaço da cabeça)
function headPoint(dx, dy, dz, out = new THREE.Vector3()) {
  const front = smooth(-0.1, 0.6, dz);
  let X = dx * 0.099, Y = dy * (dy < 0 ? 0.15 : 0.136), Z = dz * (dz > 0 ? 0.11 : 0.118);
  // maxilar quadrado, queixo pra frente
  const low = smooth(-0.15, -0.95, dy);
  X *= 1 - 0.13 * low * smooth(0.0, 0.8, Math.abs(dx) + 0.2) + 0.07 * smooth(-0.35, -0.6, dy) * (1 - smooth(-0.8, -0.97, dy));
  Z += 0.014 * smooth(-0.55, -0.92, dy) * front;
  // testa um pouco mais reta, nuca arredondada
  Z -= 0.006 * smooth(0.45, 0.85, dy) * front;
  Z -= 0.008 * smooth(-0.2, -0.75, dy) * smooth(0.0, -0.6, dz); // nuca fina embaixo
  // arco da sobrancelha
  const ax = Math.abs(dx);
  Z += 0.0065 * Math.exp(-(((dy - 0.33) / 0.09) ** 2)) * smooth(0.55, 0.85, dz) * (1 - smooth(0.4, 0.62, ax));
  // órbitas dos olhos (afundam)
  Z -= 0.011 * Math.exp(-(((ax - 0.35) / 0.15) ** 2 + ((dy - 0.04) / 0.12) ** 2)) * front;
  // bochechas mais cheias (rosto largo)
  X *= 1 + 0.06 * Math.exp(-(((dy + 0.3) / 0.32) ** 2)) * smooth(-0.3, 0.4, dz);
  // maçãs do rosto
  X += Math.sign(dx) * 0.004 * Math.exp(-(((ax - 0.62) / 0.2) ** 2 + ((dy + 0.08) / 0.16) ** 2)) * front;
  Z += 0.004 * Math.exp(-(((ax - 0.5) / 0.18) ** 2 + ((dy + 0.08) / 0.15) ** 2)) * front;
  // boca: leve volume
  Z += 0.004 * Math.exp(-((dx / 0.25) ** 2 + ((dy + 0.62) / 0.12) ** 2)) * front;
  // bochecha junto do nariz (sulco nasolabial)
  Z -= 0.0025 * Math.exp(-(((ax - 0.3) / 0.06) ** 2 + ((dy + 0.45) / 0.18) ** 2)) * front;
  return out.set(HC.x + X, HC.y + Y, HC.z + Z);
}

// textura do rosto (multiplicada): projeção frontal u = 0.5 + x/0.24, v = 0.5 + (y-0.14)/0.32
const FU = (x) => 0.5 + x / 0.24, FV = (y) => 0.5 + (y - 0.14) / 0.32;
function faceTex() {
  const S = 1024;
  const R = mulberry32(21);
  return canvasTex(S, S, (g) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, S, S);
    const P = (x, y) => [FU(x) * S, (1 - FV(y)) * S];
    const blob = (x, y, rx, ry, col, a) => {
      const [px, py] = P(x, y);
      g.save();
      g.translate(px, py);
      g.scale(rx / ry, 1);
      const r = (ry / 0.32) * S;
      const grd = g.createRadialGradient(0, 0, 0, 0, 0, r);
      grd.addColorStop(0, `rgba(${col},${a})`);
      grd.addColorStop(1, `rgba(${col},0)`);
      g.fillStyle = grd;
      g.beginPath();
      g.arc(0, 0, r, 0, Math.PI * 2);
      g.fill();
      g.restore();
    };
    const stroke = (pts, w, col, a, blur = 0) => {
      g.save();
      g.filter = blur ? `blur(${blur}px)` : 'none';
      g.strokeStyle = `rgba(${col},${a})`;
      g.lineWidth = w;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.beginPath();
      pts.forEach(([x, y], i) => {
        const [px, py] = P(x, y);
        if (i === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      });
      g.stroke();
      g.restore();
    };
    // calor nas bochechas e nariz
    blob(-0.05, 0.12, 0.03, 0.025, '200,90,70', 0.18);
    blob(0.05, 0.12, 0.03, 0.025, '200,90,70', 0.18);
    blob(0, 0.13, 0.015, 0.02, '190,90,70', 0.15);
    // olheiras e pálpebras
    for (const sd of [-1, 1]) {
      blob(sd * 0.034, 0.152, 0.022, 0.009, '90,55,50', 0.35);
      blob(sd * 0.036, 0.181, 0.022, 0.008, '80,50,40', 0.25);
      // pés de galinha
      stroke([[sd * 0.058, 0.172], [sd * 0.066, 0.168]], 2, '110,70,55', 0.35, 1);
      stroke([[sd * 0.057, 0.163], [sd * 0.066, 0.158]], 2, '110,70,55', 0.3, 1);
    }
    // sobrancelhas pintadas (base das peças 3D)
    for (const sd of [-1, 1]) {
      g.save();
      g.filter = 'blur(2px)';
      g.fillStyle = 'rgba(30,24,22,0.85)';
      g.beginPath();
      const pts = [[sd * 0.01, 0.191], [sd * 0.03, 0.2], [sd * 0.052, 0.199], [sd * 0.066, 0.192], [sd * 0.064, 0.187], [sd * 0.05, 0.191], [sd * 0.03, 0.191], [sd * 0.012, 0.184]];
      pts.forEach(([x, y], i) => {
        const [px, py] = P(x, y);
        if (i === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      });
      g.closePath();
      g.fill();
      // pelinhos
      g.filter = 'none';
      g.strokeStyle = 'rgba(25,20,18,0.6)';
      g.lineWidth = 1.5;
      for (let i = 0; i < 60; i++) {
        const t = R();
        const x = sd * (0.012 + t * 0.052);
        const y = 0.187 + Math.sin(t * Math.PI) * 0.01 + (R() - 0.5) * 0.006;
        const [px, py] = P(x, y);
        g.beginPath();
        g.moveTo(px, py);
        g.lineTo(px + sd * (4 + R() * 6), py - 2 - R() * 4);
        g.stroke();
      }
      g.restore();
    }
    // sulcos nasolabiais e rugas da testa
    for (const sd of [-1, 1]) stroke([[sd * 0.018, 0.118], [sd * 0.03, 0.098], [sd * 0.035, 0.074]], 5, '120,70,55', 0.32, 3);
    for (const y of [0.24, 0.255]) stroke([[-0.04, y], [0, y + 0.003], [0.04, y]], 3, '140,90,70', 0.18, 2);
    stroke([[-0.008, 0.215], [-0.006, 0.205]], 3, '120,75,60', 0.25, 1.5);
    stroke([[0.008, 0.215], [0.006, 0.205]], 3, '120,75,60', 0.25, 1.5);
    // barba por fazer (sombra + pontinhos)
    const beard = (x, y) => {
      const ax = Math.abs(x);
      const jaw = y < 0.098 - ax * 0.45 && ax < 0.1;
      const must = y > 0.082 && y < 0.106 && ax < 0.03;
      const lips = Math.abs(y - 0.073) < 0.008 && ax < 0.027;
      return (jaw || must) && !lips;
    };
    for (let i = 0; i < 16000; i++) {
      const x = (R() - 0.5) * 0.22, y = -0.02 + R() * 0.14;
      if (!beard(x, y)) continue;
      const [px, py] = P(x, y);
      g.fillStyle = `rgba(${60 + R() * 30},${56 + R() * 20},${60 + R() * 20},${0.08 + R() * 0.16})`;
      g.fillRect(px, py, 1.6 + R() * 1.4, 1.6 + R() * 1.4);
    }
    g.save();
    g.filter = 'blur(10px)';
    g.fillStyle = 'rgba(80,82,100,0.14)';
    g.beginPath();
    for (let a = 0; a <= 40; a++) {
      const t = a / 40;
      const x = (t - 0.5) * 0.2;
      const y = 0.095 - Math.abs(x) * 0.45;
      const [px, py] = P(x, y);
      if (a === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    for (let a = 40; a >= 0; a--) {
      const t = a / 40;
      const x = (t - 0.5) * 0.2;
      const y = -0.01 + Math.abs(x) * 0.6;
      const [px, py] = P(x, y);
      g.lineTo(px, py);
    }
    g.fill();
    g.restore();
    // boca: linha e cantinhos (sorriso discreto de canto)
    stroke([[-0.025, 0.074], [-0.012, 0.0715], [0, 0.0715], [0.012, 0.072], [0.026, 0.076]], 3.5, '70,30,25', 0.7, 1);
    blob(0.027, 0.077, 0.004, 0.003, '90,40,30', 0.4);
  });
}

function buildHead(mats) {
  const head = new THREE.Group();
  // ---- crânio + rosto
  let g = new THREE.SphereGeometry(1, 96, 72);
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  g = mergeVertices(g, 1e-6);
  const p = g.attributes.position;
  const tmp = new THREE.Vector3();
  const uv = new Float32Array(p.count * 2);
  const col = new Float32Array(p.count * 3);
  const skin = new THREE.Color(SKIN);
  const stubble = new THREE.Color('#4c4d5a');
  for (let i = 0; i < p.count; i++) {
    const dx = p.getX(i), dy = p.getY(i), dz = p.getZ(i);
    headPoint(dx, dy, dz, tmp);
    p.setXYZ(i, tmp.x, tmp.y, tmp.z);
    uv[i * 2] = FU(tmp.x);
    uv[i * 2 + 1] = FV(tmp.y);
    // barba nas laterais/queixo (sombra macia por vértice, a frente vem da textura)
    const ax = Math.abs(dx);
    const a = Math.atan2(dx, dz);
    const jaw = smooth(-0.1, -0.35, dy) * smooth(1.75, 1.35, Math.abs(a)) * smooth(-1.0, -0.85, dy);
    const side = smooth(0.35, 0.7, ax) * jaw;
    const c = skin.clone().multiply(new THREE.Color(1, 1, 1).lerp(stubble.clone().multiplyScalar(2.1), side * 0.3));
    col.set([c.r / skin.r, c.g / skin.g, c.b / skin.b], i * 3);
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  const faceMap = faceTex();
  const faceMat = mats.skin.clone();
  faceMat.map = faceMap;
  faceMat.vertexColors = true;
  faceMat.onBeforeCompile = (sh) => {
    sh.vertexShader = 'varying float vFront;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvFront = normal.z;');
    sh.fragmentShader = 'varying float vFront;\n' + sh.fragmentShader.replace('#include <map_fragment>', `
      #ifdef USE_MAP
        vec4 fc = texture2D(map, vMapUv);
        diffuseColor.rgb *= mix(vec3(1.0), fc.rgb, smoothstep(0.05, 0.45, vFront));
      #endif`);
  };
  faceMat.customProgramCacheKey = () => 'betao-face';
  const skull = new THREE.Mesh(g, faceMat);
  skull.castShadow = true;
  head.add(skull);

  // ---- nariz (peça própria: ponte reta, ponta arredondada, asas)
  {
    const n = new THREE.SphereGeometry(1, 28, 20);
    const q = n.attributes.position;
    for (let i = 0; i < q.count; i++) {
      let x = q.getX(i), y = q.getY(i), z = q.getZ(i);
      const t = (y + 1) / 2; // 0 ponta (embaixo) .. 1 raiz
      const w = 0.0115 + 0.007 * (1 - t) * (1 - t) + 0.0095 * Math.exp(-(((t - 0.08) / 0.15) ** 2));
      x *= w;
      z = z * (0.011 + 0.009 * (1 - t)) + (1 - t) * 0.012 - t * 0.003;
      y = -0.002 + y * 0.025;
      q.setXYZ(i, x, y, z);
    }
    n.computeVertexNormals();
    const nose = new THREE.Mesh(n, mats.skin);
    nose.position.set(0, 0.138, 0.098);
    nose.rotation.x = 0.12;
    nose.castShadow = true;
    head.add(nose);
    for (const sd of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.SphereGeometry(0.0094, 14, 10), mats.skin);
      wing.scale.set(1, 0.8, 0.9);
      wing.position.set(sd * 0.0142, 0.119, 0.0995);
      head.add(wing);
    }
  }
  // ---- orelhas
  for (const sd of [-1, 1]) {
    const e = new THREE.SphereGeometry(1, 20, 16);
    const q = e.attributes.position;
    for (let i = 0; i < q.count; i++) {
      const x = q.getX(i), y = q.getY(i), z = q.getZ(i);
      // concha: achata e curva pra frente na borda
      q.setXYZ(i, x * 0.007 + (y * y) * 0.004, y * 0.026, z * 0.016 - Math.abs(x) * 0.003);
    }
    e.computeVertexNormals();
    const ear = new THREE.Mesh(e, mats.skin);
    ear.position.set(sd * 0.099, 0.15, -0.012);
    const concha = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), new THREE.MeshStandardMaterial({ color: '#8f5f4a', roughness: 0.8 }));
    concha.scale.set(0.004, 0.016, 0.009);
    concha.position.set(sd * 0.1045, 0.148, -0.01);
    head.add(concha);
    ear.rotation.set(0, sd * 0.35, sd * 0.08);
    ear.scale.x = sd;
    ear.castShadow = true;
    head.add(ear);
  }
  // ---- olhos (globo + pálpebras grossas: olhar sério)
  for (const sd of [-1, 1]) {
    const eg = new THREE.SphereGeometry(0.0142, 24, 16);
    const eye = new THREE.Mesh(eg, mats.eye);
    eye.position.set(sd * 0.034, 0.168, 0.0905);
    eye.rotation.y = -sd * 0.03;
    head.add(eye);
    const lid = new THREE.Mesh(new THREE.SphereGeometry(0.0154, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.4), mats.skin);
    lid.position.copy(eye.position);
    lid.rotation.x = 0.06;
    // dobra da pálpebra (sombra)
    const crease = new THREE.Mesh(new THREE.TorusGeometry(0.0152, 0.0012, 6, 20, Math.PI), mats.brow);
    crease.position.copy(eye.position).add(new THREE.Vector3(0, 0.0015, 0.002));
    crease.rotation.set(-0.5, 0, 0);
    crease.material = new THREE.MeshStandardMaterial({ color: '#7a5240', roughness: 0.9 });
    head.add(crease);
    head.add(lid);
    const low = new THREE.Mesh(new THREE.SphereGeometry(0.015, 22, 10, 0, Math.PI * 2, Math.PI * 0.74, Math.PI * 0.26), mats.skin);
    low.position.copy(eye.position);
    low.rotation.x = -0.3;
    head.add(low);
    // sobrancelha 3D (grossa e reta, levemente descida no meio)
    const pts = [];
    for (let k = 0; k <= 8; k++) {
      const t = k / 8;
      const x = sd * (0.011 + t * 0.054);
      const y = 0.192 + Math.sin(t * Math.PI * 0.9) * 0.008 - t * 0.002;
      // acha a superfície da testa nesse x,y (procura z pela direção)
      const dx = x / 0.094, dy = (y - HC.y) / 0.136;
      const dz = Math.sqrt(Math.max(0.05, 1 - dx * dx - dy * dy));
      const sp = headPoint(dx, dy, dz);
      pts.push(new THREE.Vector3(x, y, sp.z + 0.003));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const bg = new THREE.TubeGeometry(curve, 12, 0.0031, 6, false);
    const bp = bg.attributes.position;
    for (let i = 0; i < bp.count; i++) {
      // achata (mais alta no meio, fina na ponta de fora)
      const x = bp.getX(i);
      const t = Math.abs(x) / 0.065;
      const c = curve.getPointAt(Math.min(1, Math.max(0, (Math.abs(x) - 0.011) / 0.054)));
      const dy = bp.getY(i) - c.y;
      bp.setY(i, c.y + dy * (1.15 - t * 0.65));
      bp.setZ(i, c.z + (bp.getZ(i) - c.z) * 0.35);
    }
    bg.computeVertexNormals();
    head.add(new THREE.Mesh(bg, mats.brow));
  }
  // ---- lábios
  {
    const lg = new THREE.SphereGeometry(1, 20, 10);
    const q = lg.attributes.position;
    for (let i = 0; i < q.count; i++) q.setXYZ(i, q.getX(i) * 0.022, q.getY(i) * 0.0038, q.getZ(i) * 0.003 - Math.abs(q.getX(i)) ** 2 * 0.006);
    lg.computeVertexNormals();
    const upper = new THREE.Mesh(lg, mats.lip);
    upper.position.set(0, 0.0768, 0.0948);
    head.add(upper);
    const lower = new THREE.Mesh(lg, mats.lip);
    lower.position.set(0, 0.0692, 0.0942);
    lower.scale.set(0.9, 1.15, 1.05);
    head.add(lower);
  }
  // ---- cabelo: casca sobre o crânio, curto, volume em cima, grisalho dos lados
  head.add(buildHair(mats));
  return head;
}

function buildHair(mats) {
  let g = new THREE.SphereGeometry(1, 112, 84);
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  g = mergeVertices(g, 1e-6);
  const p = g.attributes.position;
  const col = new Float32Array(p.count * 3);
  const dark = new THREE.Color('#141315'), mid = new THREE.Color('#2e2c2c'), gray = new THREE.Color('#8f8d8a');
  const EDGE = [[0, 0.49], [0.3, 0.5], [0.55, 0.55], [0.8, 0.4], [1.05, 0.14], [1.22, -0.05], [1.36, 0.0], [1.46, 0.34], [1.66, 0.3], [1.9, -0.18], [2.4, -0.45], [Math.PI, -0.5]];
  const tmp = new THREE.Vector3(), nrm = new THREE.Vector3();
  const c = new THREE.Color();
  const skinTone = new THREE.Color(SKIN).multiplyScalar(0.8);
  for (let i = 0; i < p.count; i++) {
    const dx = p.getX(i), dy = p.getY(i), dz = p.getZ(i);
    const a = Math.abs(Math.atan2(dx, dz));
    const hl = interp(EDGE, a);
    const inside = smooth(hl - 0.02, hl + 0.16, dy);
    headPoint(dx, dy, dz, tmp);
    nrm.copy(tmp).sub(HC).normalize();
    // volume: maior no topo/frente, curtinho dos lados
    const top = smooth(0.35, 0.95, dy);
    const sides = smooth(0.9, 1.6, a) * (1 - smooth(2.2, 2.8, a));
    const curl = noise3(dx * 11 + 1.3, dy * 11 + 2.1, dz * 11 + 0.7) - 0.5;
    const tufts = noise3(dx * 4.5 + 3, dy * 4.5, dz * 4.5) - 0.5;
    // sulcos de fios: em cima correm da testa pra nuca, dos lados correm pra trás
    const groove = Math.sin((dx * (1 - sides) + dy * sides) * 150 + tufts * 6) * 0.0016;
    const quiff = smooth(0.25, 0.75, dz) * smooth(0.45, 0.8, dy); // topete na frente
    const crop = smooth(0.9, 1.5, a) * (1 - smooth(2.3, 2.9, a)) * smooth(0.55, 0.2, dy); // máquina nas laterais
    let th = (0.009 + 0.02 * top + 0.008 * quiff + curl * 0.003 + tufts * 0.007 + groove) * inside * (1 - crop * 0.8);
    th = -0.0035 + (th + 0.005) * inside;
    tmp.addScaledVector(nrm, th);
    p.setXYZ(i, tmp.x, tmp.y, tmp.z);
    // cor: preto com fios brancos; grisalho nas têmporas e laterais
    const temple = smooth(0.75, 1.2, a) * (1 - smooth(1.55, 2.0, a)) * smooth(0.5, 0.15, dy);
    const grayK = Math.min(1, temple * 0.85 + smooth(0.25, -0.3, dy) * 0.25 + (noise3(dx * 38, dy * 38, dz * 38) > 0.76 ? 0.3 : 0) + (noise3(dx * 7, dy * 7, dz * 7) - 0.55) * 0.2);
    c.copy(dark).lerp(mid, Math.max(0, curl + 0.5) * 0.7 + Math.max(0, groove) * 120).lerp(gray, Math.max(0, grayK) * 0.85);
    // perto da borda o couro cabeludo aparece (degradê suave em vez de "boné")
    c.lerp(skinTone, (1 - inside) * 0.85 + crop * 0.12);
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mats.hair);
  m.castShadow = true;
  return m;
}

// ----------------------------------------------------------------------------- corpo
// tubo de anéis (tronco): rings = [{y, rx, rzF, rzB, x?, z?}]
function ringBody(rings, segs, colorAt, pw = 2.4) {
  const pos = [], cols = [], idx = [];
  const nr = rings.length;
  for (let r = 0; r < nr; r++) {
    const R0 = rings[r];
    for (let j = 0; j <= segs; j++) {
      const th = (j / segs) * Math.PI * 2;
      const s = Math.sin(th), c = Math.cos(th);
      const ex = 2 / pw;
      const x = (R0.x || 0) + R0.rx * Math.sign(s) * Math.pow(Math.abs(s), ex);
      const z = (R0.z || 0) + (c > 0 ? R0.rzF : R0.rzB) * Math.sign(c) * Math.pow(Math.abs(c), ex);
      pos.push(x, R0.y, z);
      const cc = colorAt(x, R0.y, z, th);
      cols.push(cc.r, cc.g, cc.b);
    }
  }
  for (let r = 0; r < nr - 1; r++) {
    for (let j = 0; j < segs; j++) {
      const a = r * (segs + 1) + j, b = a + segs + 1;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  let g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.setIndex(idx);
  g = mergeVertices(g, 1e-6);
  g.computeVertexNormals();
  return g;
}

// membro torneado (eixo -y a partir da junta): prof = [[y, r], ...] (y negativo)
function limb(prof, seg = 22, { flatZ = 1 } = {}) {
  // a revolução precisa do perfil de baixo pra cima (normais pra fora)
  const pts = prof.map(([y, r]) => new THREE.Vector2(r, y)).reverse();
  let g = new THREE.LatheGeometry(pts, seg);
  g.scale(1, 1, flatZ);
  // solda a costura da revolução (senão aparece uma linha/facetas no sombreado)
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g, 1e-5);
  g.computeVertexNormals();
  return g;
}

// densifica uma tabela de perfil com interpolação suave
function denseRings(tab, n) {
  const out = [];
  const y0 = tab[0].y, y1 = tab[tab.length - 1].y;
  for (let i = 0; i <= n; i++) {
    const y = y0 + (y1 - y0) * (i / n);
    let k = 1;
    while (k < tab.length - 1 && y > tab[k].y) k++;
    const a = tab[k - 1], b = tab[k];
    const t = smooth(0, 1, (y - a.y) / (b.y - a.y));
    const o = { y };
    for (const key of ['rx', 'rzF', 'rzB', 'x', 'z']) o[key] = (a[key] || 0) + ((b[key] || 0) - (a[key] || 0)) * t;
    out.push(o);
  }
  return out;
}

const POSE_KEYS = ['legL', 'legR', 'armLx', 'armRx', 'armLz', 'armRz', 'upX', 'upY', 'upZ', 'headX', 'headY', 'headZ', 'bodyY', 'bodyZ', 'bodyRY', 'wristL', 'wristR'];

export class Betao {
  constructor() {
    this.root = new THREE.Group();
    this.model = new THREE.Group();
    this.model.scale.setScalar(CHAR_SCALE);
    this.root.add(this.model);
    this.body = new THREE.Group();
    this.model.add(this.body);
    const mats = (this.mats = makeMats());
    this.mats.mSkin = mats.skin;
    const add = (parent, geo, mat, x = 0, y = 0, z = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      m.receiveShadow = true;
      parent.add(m);
      return m;
    };
    const white = new THREE.Color(1, 1, 1);
    const flat = (g, c = white) => {
      const n = g.attributes.position.count;
      const a = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
      g.setAttribute('color', new THREE.BufferAttribute(a, 3));
      return g;
    };

    // ------------------------------------------------ quadril (bermuda)
    {
      const rings = denseRings([
        { y: -0.12, rx: 0.17, rzF: 0.12, rzB: 0.13 },
        { y: 0.0, rx: 0.185, rzF: 0.125, rzB: 0.135 },
        { y: 0.09, rx: 0.172, rzF: 0.12, rzB: 0.12 },
        { y: 0.13, rx: 0.165, rzF: 0.118, rzB: 0.116 },
      ], 10);
      const band = new THREE.Color(0.8, 0.8, 0.85);
      const g = ringBody(rings, 32, (x, y) => (y > 0.085 ? band : white), 2.2);
      add(this.body, g, mats.shorts, 0, HIP - 0.02, 0);
      // fundo do quadril (tampa)
      add(this.body, flat(new THREE.SphereGeometry(0.17, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2)), mats.shorts, 0, HIP - 0.12, 0).scale.set(1.05, 0.7, 0.76);
      // passadores e cós
      for (const sx of [-0.12, 0, 0.12]) add(this.body, flat(new THREE.BoxGeometry(0.018, 0.04, 0.012)), mats.shortsD, sx, HIP + 0.085, 0.118);
      add(this.body, flat(new THREE.BoxGeometry(0.02, 0.1, 0.01)), mats.shortsD, 0.0, HIP + 0.02, 0.125); // braguilha
    }

    // ------------------------------------------------ pernas (coxa na bermuda, canela, pé com chinelo)
    const makeLeg = (side) => {
      const g = new THREE.Group();
      g.position.set(side * 0.095, HIP, 0);
      // coxa/bermuda folgada até logo acima do joelho
      const th = limb([[0.02, 0.0], [0.02, 0.112], [-0.1, 0.115], [-0.3, 0.104], [-0.4, 0.1], [-0.41, 0.0]], 22);
      flat(th);
      add(g, th, mats.shorts, 0, 0, 0);
      // barra da bermuda (dobra)
      add(g, flat(new THREE.TorusGeometry(0.1, 0.008, 6, 24)), mats.shortsD, 0, -0.395, 0).rotation.x = Math.PI / 2;
      // bolso cargo na lateral (com lapela)
      const pocket = add(g, flat(new RoundedBoxGeometry(0.02, 0.13, 0.12, 2, 0.008)), mats.shortsD, side * 0.104, -0.23, 0.0);
      pocket.rotation.z = side * 0.05;
      add(g, flat(new RoundedBoxGeometry(0.024, 0.03, 0.13, 2, 0.008)), mats.shorts, side * 0.107, -0.16, 0.0).rotation.z = side * 0.05;
      // joelho
      const knee = new THREE.Group();
      knee.position.y = -0.42;
      g.add(knee);
      const shin = limb([[0.04, 0.0], [0.04, 0.052], [0.0, 0.058], [-0.1, 0.062], [-0.2, 0.052], [-0.33, 0.041], [-0.4, 0.038], [-0.41, 0.0]], 20);
      add(knee, flat(shin), mats.skin, 0, 0, 0);
      // pé
      const ankle = new THREE.Group();
      ankle.position.y = -0.41;
      knee.add(ankle);
      const foot = new THREE.SphereGeometry(1, 22, 14);
      const fp = foot.attributes.position;
      for (let i = 0; i < fp.count; i++) {
        const x = fp.getX(i), y = fp.getY(i), z = fp.getZ(i);
        const fwd = Math.max(0, z);
        fp.setXYZ(i, x * (0.045 + fwd * 0.012), Math.max(y, -0.55) * (0.034 - fwd * 0.012) , z * 0.12);
      }
      foot.computeVertexNormals();
      add(ankle, flat(foot), mats.skin, 0, -0.035, 0.05);
      // chinelo: sola + tiras em V
      const sole = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 24), mats.rubber);
      sole.scale.set(0.058, 0.02, 0.135);
      sole.position.set(0, -0.08, 0.05);
      sole.castShadow = true;
      ankle.add(sole);
      for (const sd of [-1, 1]) {
        const strap = new THREE.Mesh(new THREE.CapsuleGeometry(0.006, 0.07, 4, 8), mats.rubber);
        strap.position.set(sd * 0.025, -0.045, 0.07);
        strap.rotation.set(Math.PI / 2 - 0.5, sd * 0.6, 0);
        ankle.add(strap);
      }
      this.body.add(g);
      return { g, knee };
    };
    const LL = makeLeg(1), LR = makeLeg(-1);
    this.legL = LL.g;
    this.legR = LR.g;
    this.kneeL = LL.knee;
    this.kneeR = LR.knee;

    // ------------------------------------------------ tronco com regata preta (pele nos ombros/decote)
    this.upper = new THREE.Group();
    this.upper.position.y = HIP + 0.09;
    this.body.add(this.upper);
    {
      const tab = [
        { y: -0.06, rx: 0.168, rzF: 0.118, rzB: 0.122 },
        { y: 0.05, rx: 0.172, rzF: 0.13, rzB: 0.12 }, // barriguinha
        { y: 0.17, rx: 0.176, rzF: 0.127, rzB: 0.116 },
        { y: 0.29, rx: 0.19, rzF: 0.125, rzB: 0.112 }, // peito
        { y: 0.38, rx: 0.2, rzF: 0.112, rzB: 0.108 },
        { y: 0.435, rx: 0.198, rzF: 0.095, rzB: 0.1 }, // ombros
        { y: 0.475, rx: 0.165, rzF: 0.08, rzB: 0.088 }, // trapézio
        { y: 0.505, rx: 0.115, rzF: 0.066, rzB: 0.074 },
        { y: 0.525, rx: 0.075, rzF: 0.056, rzB: 0.062 },
        { y: 0.54, rx: 0.062, rzF: 0.05, rzB: 0.055 },
      ];
      const g = ringBody(denseRings(tab, 48), 64, () => white, 2.3);
      // regata: o recorte (cava funda + decote) é calculado por pixel -> borda lisa
      const topMat = mats.top;
      topMat.onBeforeCompile = (sh) => {
        sh.uniforms.uSkin = { value: new THREE.Color(SKIN) };
        sh.uniforms.uCloth = { value: new THREE.Color('#1c1c21') };
        sh.vertexShader = 'varying vec3 vLP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvLP = position;');
        sh.fragmentShader = 'uniform vec3 uSkin, uCloth;\nvarying vec3 vLP;\nfloat tankSkin;\n' + sh.fragmentShader
          .replace('#include <color_fragment>', `#include <color_fragment>
            float ax = abs(vLP.x);
            vec2 ah = vec2((ax - 0.205) / 0.088, (vLP.y - 0.43) / 0.175);
            float arm = 1.0 - length(ah);
            vec2 nk = vLP.z > 0.0 ? vec2(vLP.x / 0.078, (vLP.y - 0.565) / 0.14) : vec2(vLP.x / 0.07, (vLP.y - 0.565) / 0.085);
            float neck = 1.0 - length(nk);
            float m = max(arm, neck);
            float aa = fwidth(m) * 1.2 + 1e-4;
            tankSkin = smoothstep(-aa, aa, m);
            // costura/bainha um pouco mais escura junto da borda
            float hem = smoothstep(-0.12, -0.02, m) * (1.0 - tankSkin);
            diffuseColor.rgb = mix(uCloth * (1.0 - hem * 0.35), uSkin, tankSkin);`)
          .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.55, tankSkin);');
      };
      topMat.customProgramCacheKey = () => 'betao-tank';
      add(this.upper, g, topMat, 0, 0, 0);
      // pescoço
      add(this.upper, flat(limb([[0.1, 0.0], [0.1, 0.056], [0.04, 0.058], [-0.02, 0.064], [-0.05, 0.076], [-0.051, 0.0]], 22)), mats.skin, 0, 0.5, -0.006);
    }

    // ------------------------------------------------ cabeça
    this.head = new THREE.Group();
    this.head.position.y = 0.552;
    this.upper.add(this.head);
    this.headMesh = buildHead(mats);
    this.headMesh.scale.setScalar(1.1);
    this.head.add(this.headMesh);

    // ------------------------------------------------ braços (ombro → cotovelo → punho → mão)
    const makeArm = (side) => {
      const g = new THREE.Group();
      g.position.set(side * 0.212, 0.425, -0.005);
      // deltoide
      add(g, flat(new THREE.SphereGeometry(0.074, 28, 18)), mats.skin, side * 0.006, -0.014, 0).scale.set(1, 1.1, 0.95);
      const up = limb([[0.0, 0.0], [0.0, 0.066], [-0.07, 0.068], [-0.15, 0.06], [-0.24, 0.051], [-0.29, 0.046], [-0.3, 0.0]], 28);
      const upper = add(g, flat(up), mats.skin, side * 0.008, 0, 0);
      upper.rotation.z = side * 0.06;
      const elbow = new THREE.Group();
      elbow.position.set(side * 0.026, -0.285, 0);
      g.add(elbow);
      add(elbow, flat(new THREE.SphereGeometry(0.045, 18, 12)), mats.skin, 0, 0, 0);
      const fo = limb([[0.0, 0.0], [0.0, 0.045], [-0.07, 0.048], [-0.18, 0.038], [-0.245, 0.031], [-0.255, 0.0]], 24, { flatZ: 0.88 });
      add(elbow, flat(fo), mats.skin, 0, 0, 0);
      const wrist = new THREE.Group();
      wrist.position.set(0, -0.25, 0);
      elbow.add(wrist);
      // mão: palma + dedos levemente fechados + polegar
      const palm = add(wrist, flat(new THREE.SphereGeometry(1, 18, 12)), mats.skin, 0, -0.045, 0.004);
      palm.scale.set(0.025, 0.052, 0.045);
      const fingers = add(wrist, flat(new THREE.SphereGeometry(1, 18, 12)), mats.skin, 0, -0.105, 0.016);
      fingers.scale.set(0.021, 0.038, 0.041);
      fingers.rotation.x = 0.45;
      const thumb = add(wrist, flat(new THREE.CapsuleGeometry(0.011, 0.035, 4, 10)), mats.skin, -side * 0.0, -0.045, 0.04);
      thumb.rotation.set(0.9, 0, side * 0.5);
      const grip = new THREE.Group();
      grip.position.set(0, -0.07, 0.03);
      wrist.add(grip);
      this.upper.add(g);
      return { g, elbow, wrist, grip };
    };
    const L = makeArm(1), Rr = makeArm(-1);
    this.armL = L.g;
    this.armR = Rr.g;
    this.elbowL = L.elbow;
    this.elbowR = Rr.elbow;
    this.wristL = L.wrist;
    this.wristR = Rr.wrist;
    this.gripL = L.grip;
    this.gripR = Rr.grip;

    this.root.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });

    this.pose = {};
    this.target = {};
    for (const key of POSE_KEYS) {
      this.pose[key] = 0;
      this.target[key] = 0;
    }
  }

  resetTarget() {
    for (const key of POSE_KEYS) this.target[key] = 0;
    return this.target;
  }

  update(dt, sharp = 12) {
    const a = 1 - Math.exp(-sharp * dt);
    const P = this.pose, T = this.target;
    for (const key of POSE_KEYS) P[key] += (T[key] - P[key]) * a;
    this.legL.rotation.x = P.legL;
    this.legR.rotation.x = P.legR;
    // joelhos e cotovelos acompanham (dobram quando a perna/braço vai pra frente)
    const knee = (l) => Math.max(0, -l) * 0.95 + Math.max(0, l) * 0.45;
    this.kneeL.rotation.x = knee(P.legL);
    this.kneeR.rotation.x = knee(P.legR);
    const elbow = (ax) => -(0.18 + 0.62 * Math.exp(-(((ax + 1.15) / 0.75) ** 2)));
    this.elbowL.rotation.x = elbow(P.armLx);
    this.elbowR.rotation.x = elbow(P.armRx);
    this.armL.rotation.set(P.armLx, 0, P.armLz);
    this.armR.rotation.set(P.armRx, 0, -P.armRz);
    this.wristL.rotation.y = P.wristL;
    this.wristR.rotation.y = P.wristR;
    this.upper.rotation.set(P.upX, P.upY, P.upZ);
    this.head.rotation.set(P.headX, P.headY, P.headZ);
    this.body.position.y = P.bodyY;
    this.body.rotation.z = P.bodyZ;
    this.body.rotation.y = P.bodyRY;
  }
}
