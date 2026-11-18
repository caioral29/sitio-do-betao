import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { assets, tex } from './assets.js';

// ----------------------------------------------------------------------------
// Kit de construção do cenário: materiais com textura (CC0), caixas com cantos
// arredondados e UV em metros, e "lotes" que juntam tudo por material (poucas draw calls)
// ----------------------------------------------------------------------------

export const timeU = { value: 0 };
// círculo de visão: o que fica entre a câmera e o Betão é "vazado" com dither
export const occ = {
  focus: { value: new THREE.Vector3(0, -100, 0) }, ndc: { value: new THREE.Vector2() }, depth: { value: 0 },
  res: { value: new THREE.Vector2(1, 1) }, r: { value: 0 }, near: { value: 1 },
  can: { value: Array.from({ length: 6 }, () => new THREE.Vector4()) }, canN: { value: 0 },
};
export const windU = { value: 1 };

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _c = new THREE.Color();
const _n = new THREE.Vector3();
const _nm = new THREE.Matrix3();

const BAYER = 'const float BAYER[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);';

// Vento + dither de oclusão. kind: 'solid' | 'leaf' (copas: somem quando tampam o Betão)
export function patchMaterial(mat, { kind = 'solid', sway = 0, swayFrom = 0, noFlip = false } = {}) {
  if (mat.userData.occPatched) return mat;
  mat.userData.occPatched = true;
  const own = Object.prototype.hasOwnProperty.call(mat, 'customProgramCacheKey') ? mat.customProgramCacheKey() : '';
  const key = `betao2-${kind}-${sway}-${swayFrom}-${noFlip}-${own}`;
  mat.customProgramCacheKey = () => key;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, r) => {
    if (prev) prev(shader, r);
    Object.assign(shader.uniforms, {
      uTime: timeU, uWind: windU, uFocus: occ.focus, uFocusNDC: occ.ndc, uFocusDepth: occ.depth, uRes: occ.res, uOccR: occ.r,
      uNearFade: occ.near, uCan: occ.can, uCanN: occ.canN,
    });
    shader.vertexShader = 'uniform float uTime;\nuniform float uWind;\nvarying vec3 vWPos;\n' + shader.vertexShader
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        ${sway ? `{
          vec4 wq = modelMatrix * vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            wq = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
          #endif
          float sw = max(wq.y - ${swayFrom.toFixed(2)}, 0.0) * ${sway.toFixed(4)} * uWind;
          transformed.x += (sin(uTime * 1.3 + wq.x * 0.35 + wq.z * 0.21) + 0.35 * sin(uTime * 3.1 + wq.x * 2.0 + wq.y)) * sw;
          transformed.z += (cos(uTime * 1.05 + wq.z * 0.3 + wq.x * 0.1) + 0.35 * cos(uTime * 2.7 + wq.z * 2.0)) * sw * 0.7;
        }` : ''}`)
      .replace('#include <project_vertex>', `#include <project_vertex>
        #ifdef USE_INSTANCING
          vWPos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
        #else
          vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        #endif`);
    // folhagem: o verso do cartão usa a mesma normal da frente (sem manchas escuras)
    if (noFlip) shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n normal = normalize(vNormal);');
    shader.fragmentShader = `uniform vec3 uFocus;\nuniform vec2 uFocusNDC;\nuniform float uFocusDepth;\nuniform vec2 uRes;\nuniform float uOccR;\nuniform float uNearFade;\nuniform vec4 uCan[6];\nuniform int uCanN;\nvarying vec3 vWPos;\n${BAYER}\n` + shader.fragmentShader.replace(
      '#include <clipping_planes_fragment>',
      `#include <clipping_planes_fragment>
      {
        float bay = (BAYER[int(mod(gl_FragCoord.y, 4.0)) * 4 + int(mod(gl_FragCoord.x, 4.0))] + 0.5) / 16.0;
        ${kind === 'leaf' ? `
        for (int i = 0; i < 6; i++) {
          if (i >= uCanN) break;
          vec3 dq = vWPos - uCan[i].xyz;
          dq.y *= 1.35;
          if (length(dq) < uCan[i].w && 0.72 > bay) discard;
        }` : ''}
        float cd = length(vWPos - cameraPosition);
        float nf = (1.0 - smoothstep(1.2, 3.2, cd)) * uNearFade;
        if (nf > bay) discard;
        if (uOccR > 0.0 && vWPos.y > uFocus.y - 0.45 && vViewPosition.z < uFocusDepth - 0.9) {
          vec2 dd = gl_FragCoord.xy / uRes * 2.0 - 1.0 - uFocusNDC;
          dd.x *= uRes.x / uRes.y;
          float fade = 1.0 - smoothstep(uOccR * 0.55, uOccR, length(dd));
          if (fade * 0.92 > bay) discard;
        }
      }`
    );
  };
  return mat;
}

// ----------------------------------------------------------------------------- texturas derivadas
function canvasTex(w, h, draw, { srgb = true, repeat = true, dilate = false } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d', { willReadFrequently: dilate });
  draw(g, w, h);
  if (dilate) return dilatedTex(g, w, h, srgb, repeat);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = assets.maxAniso;
  return t;
}
// Texturas recortadas (folhas, capim): a cor "vaza" pros pixels transparentes,
// senão o filtro/mipmap puxa preto pras bordas (contorno escuro nas folhas)
function dilatedTex(g, w, h, srgb, repeat) {
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  const a0 = new Uint8Array(w * h);
  let sr = 0, sg = 0, sb = 0, n = 0;
  for (let i = 0; i < w * h; i++) {
    if (d[i * 4 + 3] > 8) {
      a0[i] = 1;
      sr += d[i * 4];
      sg += d[i * 4 + 1];
      sb += d[i * 4 + 2];
      n++;
    }
  }
  const out = new Uint8Array(d);
  let known = a0;
  for (let pass = 0; pass < 6; pass++) {
    const next = known.slice();
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (known[i]) continue;
        let r = 0, gg = 0, b = 0, c = 0;
        for (let oy = -1; oy <= 1; oy++) {
          const yy = y + oy;
          if (yy < 0 || yy >= h) continue;
          for (let ox = -1; ox <= 1; ox++) {
            const xx = x + ox;
            if (xx < 0 || xx >= w) continue;
            const j = yy * w + xx;
            if (!known[j]) continue;
            r += out[j * 4];
            gg += out[j * 4 + 1];
            b += out[j * 4 + 2];
            c++;
          }
        }
        if (c) {
          out[i * 4] = r / c;
          out[i * 4 + 1] = gg / c;
          out[i * 4 + 2] = b / c;
          next[i] = 1;
        }
      }
    }
    known = next;
  }
  if (n) {
    for (let i = 0; i < w * h; i++) {
      if (known[i]) continue;
      out[i * 4] = sr / n;
      out[i * 4 + 1] = sg / n;
      out[i * 4 + 2] = sb / n;
    }
  }
  for (let i = 0; i < w * h; i++) out[i * 4 + 3] = d[i * 4 + 3];
  const t = new THREE.DataTexture(out, w, h, THREE.RGBAFormat);
  t.flipY = true;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = assets.maxAniso;
  t.needsUpdate = true;
  return t;
}

// uma tábua só (sem emendas) recortada da textura de tábuas
function plankStrip(name, y0, y1, srgb) {
  const img = assets.tex[name].image;
  const t = canvasTex(1024, 128, (g, w, h) => g.drawImage(img, 0, y0 * img.height / 1024, img.width, (y1 - y0) * img.height / 1024, 0, 0, w, h), { srgb });
  t.wrapT = THREE.MirroredRepeatWrapping;
  return t;
}

export const M = {}; // materiais compartilhados
export function makeMaterials() {
  if (M.ready) return M;
  const std = (o) => new THREE.MeshStandardMaterial({ vertexColors: true, ...o });
  // madeira: veio da tábua (1 unidade de UV = 1 m; a tábua tem ~1,1 m x 0,14 m)
  const grain = plankStrip('wood_col', 262, 374, true);
  const grainN = plankStrip('wood_nrm', 262, 374, false);
  const rep = (t, x, y) => {
    t.repeat.set(x, y);
    return t;
  };
  rep(grain, 0.8, 5);
  rep(grainN, 0.8, 5);
  M.wood = patchMaterial(std({ map: grain, normalMap: grainN, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.78 }));
  M.paint = patchMaterial(std({ roughness: 0.5, normalMap: tex('plaster_nrm', 0.8), normalScale: new THREE.Vector2(0.25, 0.25) }));
  M.plaster = patchMaterial(std({ map: tex('plaster_col', 0.45), normalMap: tex('plaster_nrm', 0.45), normalScale: new THREE.Vector2(0.5, 0.5), roughness: 0.92, color: new THREE.Color(1.32, 1.3, 1.26) }));
  M.stone = patchMaterial(std({ map: tex('rock_col', 0.7), normalMap: tex('rock_nrm', 0.7), roughness: 0.9, color: new THREE.Color(1.45, 1.4, 1.3) }));
  M.tile = patchMaterial(std({ map: tex('stonetile_col', 0.55), normalMap: tex('stonetile_nrm', 0.55), roughness: 0.75 }));
  M.deck = patchMaterial(std({ map: tex('deck_col', 0.62), normalMap: tex('deck_nrm', 0.62), roughnessMap: tex('deck_rgh', 0.62), roughness: 1 }));
  M.bark = patchMaterial(std({ map: tex('bark_col', 1.2, 0.6), normalMap: tex('bark_nrm', 1.2, 0.6), roughness: 0.95 }));
  M.palm = patchMaterial(std({ map: tex('palmbark_col', 1, 0.8), normalMap: tex('palmbark_nrm', 1, 0.8), normalScale: new THREE.Vector2(1.4, 1.4), roughness: 0.92 }));
  M.metal = patchMaterial(std({ roughness: 0.38, metalness: 0.65 }));
  M.plastic = patchMaterial(std({ roughness: 0.55 }));
  M.rubber = patchMaterial(std({ roughness: 0.85 }));
  M.cloth = patchMaterial(std({ roughness: 0.95, side: THREE.DoubleSide }));
  M.roof = patchMaterial(new THREE.MeshStandardMaterial({
    map: tex('roof_col', 0.7), normalMap: tex('roof_nrm', 0.7), roughnessMap: tex('roof_rgh', 0.7), roughness: 1, vertexColors: true,
    normalScale: new THREE.Vector2(1.2, 1.2),
  }));
  M.ready = true;
  return M;
}

// ----------------------------------------------------------------------------- UV em metros
// projeção "caixa" no espaço local: cada face usa as duas coordenadas do seu plano;
// `long` = eixo (0 x, 1 y, 2 z) que deve correr ao longo do U (veio da madeira)
export function boxUV(geo, long = -1) {
  const p = geo.attributes.position, n = geo.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    const c = [p.getX(i), p.getY(i), p.getZ(i)];
    let a, b; // eixos do plano
    if (ax >= ay && ax >= az) [a, b] = [2, 1];
    else if (ay >= az) [a, b] = [0, 2];
    else [a, b] = [0, 1];
    if (long === b) [a, b] = [b, a];
    uv[i * 2] = c[a];
    uv[i * 2 + 1] = c[b];
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

const _rbCache = new Map();
export function rbox(w, h, d, r = 0.02, seg = 1) {
  const rr = Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3);
  if (rr <= 0.004) return new THREE.BoxGeometry(w, h, d);
  return new RoundedBoxGeometry(w, h, d, seg, rr);
}

// ----------------------------------------------------------------------------- lotes
export class Batch {
  constructor(material) {
    this.material = material;
    this.parts = [];
  }
  // geo já com uv (ou sem: recebe projeção caixa), cor = tom multiplicado pela textura
  add(geo, color = '#ffffff', x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, { uv = 'box', long = -1 } = {}) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (uv === 'box' || !g.attributes.uv) {
      // a projeção usa o tamanho real (escala já aplicada)
      if (sx !== 1 || sy !== 1 || sz !== 1) {
        g.scale(sx, sy, sz);
        sx = sy = sz = 1;
      }
      boxUV(g, long);
    }
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
    return g;
  }
  // caixa com cantos arredondados; o veio corre no maior lado
  box(w, h, d, color, x, y, z, rx = 0, ry = 0, rz = 0, r = 0.02) {
    const long = w >= h && w >= d ? 0 : h >= d ? 1 : 2;
    return this.add(rbox(w, h, d, r), color, x, y, z, rx, ry, rz, 1, 1, 1, { long });
  }
  cyl(rt, rb, h, color, x, y, z, rx = 0, ry = 0, rz = 0, seg = 14) {
    const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1);
    // uv: volta do cilindro em metros, altura em metros
    const uv = g.attributes.uv;
    const circ = Math.PI * 2 * Math.max(rt, rb);
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * circ, uv.getY(i) * h);
    return this.add(g, color, x, y, z, rx, ry, rz, 1, 1, 1, { uv: 'keep' });
  }
  build({ cast = true, receive = true } = {}) {
    if (!this.parts.length) return null;
    const g = mergeGeometries(this.parts, false);
    this.parts.length = 0;
    const mesh = new THREE.Mesh(g, this.material);
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    return mesh;
  }
}

// um lote por material
export class Kit {
  constructor() {
    this.b = {};
  }
  get(name) {
    if (!this.b[name]) this.b[name] = new Batch(M[name]);
    return this.b[name];
  }
  box(mat, w, h, d, color, x, y, z, rx, ry, rz, r) {
    return this.get(mat).box(w, h, d, color, x, y, z, rx, ry, rz, r);
  }
  cyl(mat, rt, rb, h, color, x, y, z, rx, ry, rz, seg) {
    return this.get(mat).cyl(rt, rb, h, color, x, y, z, rx, ry, rz, seg);
  }
  add(mat, geo, color, x, y, z, rx, ry, rz, sx, sy, sz, opts) {
    return this.get(mat).add(geo, color, x, y, z, rx, ry, rz, sx, sy, sz, opts);
  }
  build(parent, opts) {
    const out = [];
    for (const k of Object.keys(this.b)) {
      const m = this.b[k].build(opts);
      if (m) {
        parent.add(m);
        out.push(m);
      }
    }
    this.b = {};
    return out;
  }
}

// tubo afunilado ao longo de uma curva (troncos, galhos, cordas)
export function taperTube(curve, r0, r1, segs = 16, radial = 10, { uvLen = 1, uvAround = 1, wobble = 0, seed = 1 } = {}) {
  const pos = [], nor = [], uv = [], idx = [];
  const frames = curve.computeFrenetFrames(segs, false);
  const P = new THREE.Vector3(), N = new THREE.Vector3();
  let len = 0;
  let prev = curve.getPointAt(0);
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const c = curve.getPointAt(t);
    len += c.distanceTo(prev);
    prev = c;
    const r = r0 + (r1 - r0) * t;
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const w = wobble ? 1 + wobble * Math.sin(a * 3 + seed + t * 7) * Math.sin(a * 2 + seed * 1.7) : 1;
      N.copy(frames.normals[i]).multiplyScalar(Math.cos(a)).addScaledVector(frames.binormals[i], Math.sin(a)).normalize();
      P.copy(c).addScaledVector(N, r * w);
      pos.push(P.x, P.y, P.z);
      nor.push(N.x, N.y, N.z);
      uv.push((j / radial) * uvAround, len * uvLen);
    }
  }
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j, b = a + radial + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

export { canvasTex };
