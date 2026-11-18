import * as THREE from 'three';
import { RIVER, riverCenter, mulberry32, vnoise, clamp, GATE, PED_GATE, FENCE_Z, BRIDGE, DECK, HOUSE_EXT } from './config.js';
import { assets, tex } from './assets.js';
import { canvasTex } from './kit.js';

// Área do mapa de "pintura" do chão (trilhas, terra vermelha, areia)
export const SPLAT = { x0: -64, x1: 64, z0: -46, z1: 40, ppu: 4 };
const ROAD = { z0: 18.5, z1: 24.5 };

const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// relevo: chão plano no sítio, margens em rampa no rio e morros em volta (vale do rio e da estrada)
export function groundY(x, z) {
  const dz = Math.abs(z - riverCenter(x));
  // margem do rio: some de 0 até o leito
  let h = 0;
  const edge = RIVER.hw; // linha d'água
  if (dz < edge + 0.45) {
    const t = smooth(edge + 0.45, edge - 1.1, dz);
    h = -0.08 * smooth(edge + 0.45, edge, dz) + (RIVER.bedY + 0.12) * t;
  }
  // fora da área jogável: morros suaves
  const ox = Math.max(0, Math.abs(x) - 33);
  const ozN = Math.max(0, -21 - z);
  const ozS = Math.max(0, z - 29);
  let d = Math.hypot(ox, Math.max(ozN, ozS));
  if (d > 0) {
    const n = vnoise(x * 0.035 + 7, z * 0.035 - 3) * 0.6 + vnoise(x * 0.09, z * 0.09) * 0.4;
    let hill = Math.pow(smooth(0, 70, d), 1.3) * (22 + n * 26) + smooth(0, 10, d) * n * 3;
    // vales: o rio e a estrada atravessam os morros
    hill *= smooth(edge + 2.5, edge + 16, dz);
    hill *= smooth(2.5, 14, Math.max(ROAD.z0 - z, z - ROAD.z1, 0) + (z > ROAD.z0 - 1 && z < ROAD.z1 + 1 ? 0 : 3));
    h += hill;
  }
  return h;
}

// --------------------------------------------------------------------------- pintura do chão
function paintSplat(R) {
  const { x0, x1, z0, z1, ppu } = SPLAT;
  const W = (x1 - x0) * ppu, H = (z1 - z0) * ppu;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'lighter';
  const P = (x, z) => [(x - x0) * ppu, (z - z0) * ppu];
  // pincel macio: canal = 'r' (terra), 'g' (terra vermelha), 'b' (areia clara / pisoteado)
  const dab = (x, z, r, ch, a = 1) => {
    const [px, py] = P(x, z);
    const rr = r * ppu;
    const grd = g.createRadialGradient(px, py, 0, px, py, rr);
    const col = ch === 'r' ? '255,0,0' : ch === 'g' ? '0,255,0' : '0,0,255';
    grd.addColorStop(0, `rgba(${col},${a})`);
    grd.addColorStop(0.55, `rgba(${col},${a * 0.75})`);
    grd.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = grd;
    g.beginPath();
    g.arc(px, py, rr, 0, Math.PI * 2);
    g.fill();
  };
  const path = (pts, r, ch, a = 0.6, step = 0.35, wob = 0.25) => {
    const curve = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z)));
    const L = curve.getLength();
    for (let s = 0; s <= L; s += step) {
      const p = curve.getPointAt(s / L);
      dab(p.x + (R() - 0.5) * wob, p.z + (R() - 0.5) * wob, r * (0.8 + R() * 0.4), ch, a);
    }
  };
  // trilha da entrada de pedestre até a varanda, com ramal pra ponte e pro deck
  const pedX = (PED_GATE.x0 + PED_GATE.x1) / 2;
  path([[pedX, 18.6], [pedX, 16.2], [6.4, 12.5], [9.2, 7.5], [10.9, 3.4], [11.4, 1.75]], 0.62, 'r', 0.5);
  path([[6.4, 12.5], [4.2, 7.5], [3.2, 2.5], [2.4, -2.2], [BRIDGE.x, BRIDGE.z1 + 0.2]], 0.55, 'r', 0.45);
  path([[3.2, 2.5], [0.4, -0.9], [-2.6, -3.0], [(DECK.x0 + DECK.x1) / 2 + 1, DECK.z1 + 0.3]], 0.5, 'r', 0.4);
  // além da ponte, até a placa
  path([[BRIDGE.x, BRIDGE.z0 - 0.2], [3.4, -15.0], [5.5, -15.9]], 0.5, 'r', 0.4);
  // marcas de pneu da Strada: do estacionamento até o portão
  const gx = (GATE.x0 + GATE.x1) / 2;
  for (const off of [-0.72, 0.72]) {
    path([[4.6 + off * 0.75, 13.4 - off * 0.5], [5.8 + off * 0.8, 15.0], [gx + off, 16.6], [gx + off, 18.6]], 0.3, 'r', 0.5, 0.25, 0.08);
  }
  dab(4.6, 13.4, 2.3, 'b', 0.55); // chão batido onde ela estaciona
  // pisoteado em volta dos bancos e da rede
  dab(-3.7, 4.0, 1.6, 'b', 0.5);
  dab(-14.2, -14.2, 1.5, 'b', 0.5);
  dab(-0.4, 10.0, 1.8, 'b', 0.35);
  // pé dos coqueiros (areia)
  for (const [x, z] of [[-1.2, -1.0], [-5.6, 1.6], [-6.6, 6.2], [-2.4, 8.4], [1.6, 11.6]]) dab(x, z, 1.1, 'b', 0.55);
  // terra vermelha no canto do anexo (como na foto)
  const E = HOUSE_EXT;
  const red = (x, z, rx, rz, n) => {
    for (let i = 0; i < n; i++) {
      const a = R() * Math.PI * 2, d = Math.sqrt(R());
      dab(x + Math.cos(a) * d * rx, z + Math.sin(a) * d * rz, 0.35 + R() * 0.35, 'g', 0.55);
    }
  };
  red(15.8, 10.3 + E, 3.6, 0.28, 40);
  red(13.4, 11.0 + E, 1.0, 0.5, 10);
  red(21.0, 11.35 + E, 1.4, 0.25, 14);
  red(22.43, 14.6 + E / 2, 0.22, 2.4, 28);
  red(21.1, 12.1 + E, 0.7, 0.4, 10);
  // manchas de terra no gramado (como na referência)
  for (let i = 0; i < 26; i++) {
    const x = -27 + R() * 54, z = -16 + R() * 33;
    if (Math.abs(z - riverCenter(x)) < RIVER.hw + 2) continue;
    if (x > 10.5 && x < 24 && z > -4.5 && z < 14) continue;
    const n = 2 + Math.floor(R() * 4);
    for (let k = 0; k < n; k++) dab(x + (R() - 0.5) * 1.6, z + (R() - 0.5) * 1.6, 0.4 + R() * 0.6, 'r', 0.22 + R() * 0.2);
  }
  // sob a ponte e o deck: terra
  dab(BRIDGE.x, BRIDGE.z1, 1.2, 'r', 0.4);
  dab(BRIDGE.x, BRIDGE.z0, 1.2, 'r', 0.4);
  // calçada de terra na frente do portão
  for (let x = PED_GATE.x0 - 0.5; x < GATE.x1 + 0.5; x += 0.5) dab(x, FENCE_Z + 0.6, 0.65, 'r', 0.45);
  g.globalCompositeOperation = 'source-over';
  // borda zerada (fora do mapa = grama pura)
  g.strokeStyle = '#000';
  g.lineWidth = 4;
  g.strokeRect(0, 0, W, H);
  assets._splatCanvas = c;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// --------------------------------------------------------------------------- material do chão
export const groundUniforms = {
  uSplat: { value: null },
  uGrass: { value: null },
  uDirt: { value: null },
  uDirtN: { value: null },
  uRed: { value: null },
  uRiver: { value: new THREE.Vector4(RIVER.base, RIVER.amp, RIVER.freq, RIVER.phase) },
  uHW: { value: RIVER.hw },
  uWet: { value: 0 },
};

function groundMaterial() {
  groundUniforms.uGrass.value = assets.tex.grass_col;
  groundUniforms.uDirt.value = assets.tex.dirt_col;
  groundUniforms.uDirtN.value = assets.tex.dirt_nrm;
  groundUniforms.uRed.value = assets.tex.redsoil_col;
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0, color: '#ffffff' });
  mat.customProgramCacheKey = () => 'betao2-ground';
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, groundUniforms);
    sh.vertexShader = 'varying vec3 vGW;\nvarying vec3 vGN;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vGW = (modelMatrix * vec4(position, 1.0)).xyz;
      vGN = normalize(mat3(modelMatrix) * normal);`);
    sh.fragmentShader = `
      uniform sampler2D uSplat, uGrass, uDirt, uDirtN, uRed;
      uniform vec4 uRiver;
      uniform float uHW, uWet;
      varying vec3 vGW;
      varying vec3 vGN;
      float gh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float gn(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(gh(i), gh(i + vec2(1, 0)), f.x), mix(gh(i + vec2(0, 1)), gh(i + vec2(1, 1)), f.x), f.y);
      }
      float fbm(vec2 p) { return gn(p) * 0.55 + gn(p * 2.1 + 3.1) * 0.3 + gn(p * 4.3 - 1.7) * 0.15; }
      vec3 grassCol(vec2 p) {
        // duas escalas (some a repetição) + tom verde vivo de jogo
        float a = dot(texture2D(uGrass, p * 0.33).rgb, vec3(0.3, 0.55, 0.15));
        float b = dot(texture2D(uGrass, vec2(p.y, -p.x) * 0.083 + 0.37).rgb, vec3(0.3, 0.55, 0.15));
        float l = mix(a, b, 0.4);
        float m = fbm(p * 0.07);
        float m2 = fbm(p * 0.21 + 9.0);
        vec3 g1 = vec3(0.2, 0.42, 0.07);
        vec3 g2 = vec3(0.33, 0.5, 0.09);
        vec3 g3 = vec3(0.14, 0.32, 0.06);
        vec3 c = mix(g1, g2, smoothstep(0.3, 0.75, m));
        c = mix(c, g3, smoothstep(0.55, 0.85, m2) * 0.55);
        return c * (0.55 + l * 1.25);
      }
    ` + sh.fragmentShader
      .replace('#include <map_fragment>', `
        vec2 wp = vGW.xz;
        vec2 suv = vec2((wp.x - (${SPLAT.x0.toFixed(1)})) / ${(SPLAT.x1 - SPLAT.x0).toFixed(1)}, (wp.y - (${SPLAT.z0.toFixed(1)})) / ${(SPLAT.z1 - SPLAT.z0).toFixed(1)});
        vec3 sp = texture2D(uSplat, vec2(suv.x, 1.0 - suv.y)).rgb;
        float brk = fbm(wp * 1.3);
        vec3 grass = grassCol(wp);
        vec3 dirt = texture2D(uDirt, wp * 0.42).rgb * vec3(1.18, 1.0, 0.78) * 1.05;
        vec3 red = texture2D(uRed, wp * 0.5).rgb * vec3(1.0, 0.86, 0.78);
        vec3 sand = dirt * vec3(1.25, 1.15, 0.95);
        // bordas irregulares nas trilhas
        float wDirt = smoothstep(0.25, 0.55, sp.r + (brk - 0.5) * 0.45);
        float wRed = smoothstep(0.3, 0.65, sp.g + (brk - 0.5) * 0.4) * 0.8;
        float wSand = smoothstep(0.25, 0.6, sp.b + (brk - 0.5) * 0.5) * 0.85;
        vec3 col = grass;
        col = mix(col, sand, wSand);
        col = mix(col, dirt, wDirt);
        col = mix(col, red, wRed);
        // margem do rio: barro úmido
        float rc = uRiver.x + sin(wp.x * uRiver.z + uRiver.w) * uRiver.y;
        float dz = abs(wp.y - rc);
        float bank = 1.0 - smoothstep(uHW + 0.1, uHW + 0.75 + brk * 0.5, dz);
        vec3 mud = dirt * vec3(0.62, 0.58, 0.5);
        col = mix(col, mud, bank);
        // encosta íngreme nos morros: terra aparecendo
        float slope = 1.0 - clamp(vGN.y, 0.0, 1.0);
        col = mix(col, dirt * 0.85, smoothstep(0.35, 0.6, slope + (brk - 0.5) * 0.2));
        // morros distantes: mais escuros (mata)
        float far = smoothstep(4.0, 22.0, vGW.y);
        col = mix(col, vec3(0.13, 0.27, 0.07) * (0.7 + fbm(wp * 0.15) * 0.6), far * 0.8);
        diffuseColor.rgb *= col;
        float groundWet = bank;
      `)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(0.97, 0.55, bank * 0.9);`);
  };
  return mat;
}

export function buildTerrain(scene) {
  const R = mulberry32(42);
  const splat = paintSplat(R);
  groundUniforms.uSplat.value = splat;
  const mat = groundMaterial();

  // malha de dentro (fina, por causa das margens) + malha de fora (grossa, morros)
  const inner = new THREE.PlaneGeometry(SPLAT.x1 - SPLAT.x0, SPLAT.z1 - SPLAT.z0, (SPLAT.x1 - SPLAT.x0) * 2, (SPLAT.z1 - SPLAT.z0) * 2);
  inner.rotateX(-Math.PI / 2);
  inner.translate((SPLAT.x0 + SPLAT.x1) / 2, 0, (SPLAT.z0 + SPLAT.z1) / 2);
  const p = inner.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, groundY(p.getX(i), p.getZ(i)));
  inner.computeVertexNormals();
  const mesh = new THREE.Mesh(inner, mat);
  mesh.receiveShadow = true;
  scene.add(mesh);

  const outer = new THREE.PlaneGeometry(460, 380, 184, 152);
  outer.rotateX(-Math.PI / 2);
  outer.translate(0, 0, -10);
  const q = outer.attributes.position;
  for (let i = 0; i < q.count; i++) {
    const x = q.getX(i), z = q.getZ(i);
    const inside = x > SPLAT.x0 + 1 && x < SPLAT.x1 - 1 && z > SPLAT.z0 + 1 && z < SPLAT.z1 - 1;
    q.setY(i, inside ? groundY(x, z) - 0.6 : groundY(x, z));
  }
  outer.computeVertexNormals();
  const om = new THREE.Mesh(outer, mat);
  om.receiveShadow = true;
  scene.add(om);
  return { mesh };
}

// --------------------------------------------------------------------------- estrada
export function buildRoad(scene) {
  const g = new THREE.PlaneGeometry(460, ROAD.z1 - ROAD.z0, 1, 1);
  g.rotateX(-Math.PI / 2);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 460 / 4, uv.getY(i) * (ROAD.z1 - ROAD.z0) / 4);
  // faixa amarela tracejada + bordas brancas pintadas numa textura do tamanho da pista
  const lines = canvasTex(512, 128, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    c.fillStyle = 'rgba(240,190,40,0.95)';
    c.fillRect(0, h / 2 - 3, w * 0.55, 6);
    c.fillStyle = 'rgba(245,245,240,0.9)';
    c.fillRect(0, 6, w, 4);
    c.fillRect(0, h - 10, w, 4);
  });
  lines.wrapT = THREE.ClampToEdgeWrapping;
  const mat = new THREE.MeshStandardMaterial({
    map: tex('asphalt_col', 1, 1), normalMap: tex('asphalt_nrm', 1, 1), roughness: 0.9, color: '#9a9a9a',
  });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uLines = { value: lines };
    sh.vertexShader = 'varying vec2 vRoad;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vRoad = vec2((modelMatrix * vec4(position, 1.0)).x / 6.4, uv.y * 4.0 / ${(ROAD.z1 - ROAD.z0).toFixed(1)});`);
    sh.fragmentShader = 'uniform sampler2D uLines;\nvarying vec2 vRoad;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      vec4 ln = texture2D(uLines, vec2(fract(vRoad.x), vRoad.y));
      diffuseColor.rgb = mix(diffuseColor.rgb, ln.rgb, ln.a);`);
  };
  const m = new THREE.Mesh(g, mat);
  m.position.set(0, -0.025, (ROAD.z0 + ROAD.z1) / 2);
  m.receiveShadow = true;
  scene.add(m);
  // meio-fio de concreto
  const curbMat = new THREE.MeshStandardMaterial({ map: tex('stonetile_col', 60, 0.3), color: '#d8d2c6', roughness: 0.85 });
  for (const z of [ROAD.z0 - 0.06, ROAD.z1 + 0.06]) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(460, 0.1, 0.16), curbMat);
    c.position.set(0, 0.0, z);
    c.receiveShadow = true;
    scene.add(c);
  }
}

// --------------------------------------------------------------------------- água
export function buildWater(scene) {
  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      uTime: { value: 0 },
      uDeep: { value: new THREE.Color('#0d6f8f') },
      uShallow: { value: new THREE.Color('#3fbfc4') },
      uFoam: { value: new THREE.Color('#f2fbff') },
      uSkyColor: { value: new THREE.Color('#bfe4ff') },
      uSunDir: { value: new THREE.Vector3(0.3, 0.8, -0.4).normalize() },
      uSunColor: { value: new THREE.Color('#ffffff') },
      uLight: { value: 1 },
      uNight: { value: 0 },
      uRiver: { value: new THREE.Vector4(RIVER.base, RIVER.amp, RIVER.freq, RIVER.phase) },
      uHW: { value: RIVER.hw },
      uBed: { value: RIVER.bedY },
    },
  ]);

  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    fog: true,
    vertexShader: /* glsl */ `
      uniform float uTime;
      varying vec3 vWorld;
      #include <fog_pars_vertex>
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        wp.y += sin(wp.x * 0.8 + uTime * 1.6) * 0.02 + sin(wp.z * 1.3 - uTime * 1.2 + wp.x * 0.3) * 0.015;
        vWorld = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uLight, uNight, uHW, uBed;
      uniform vec4 uRiver;
      uniform vec3 uDeep, uShallow, uFoam, uSkyColor, uSunColor, uSunDir;
      varying vec3 vWorld;
      #include <fog_pars_fragment>
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      float fbm(vec2 p) { return noise(p) * 0.5 + noise(p * 2.03 + 1.7) * 0.3 + noise(p * 4.1 - 2.3) * 0.2; }
      void main() {
        vec2 p = vWorld.xz;
        float rc = uRiver.x + sin(p.x * uRiver.z + uRiver.w) * uRiver.y;
        float d = uHW - abs(p.y - rc); // distância até a margem (positiva dentro)
        vec2 flow = vec2(uTime * 0.32, 0.0);
        float n1 = fbm(p * 1.1 - flow);
        float n2 = fbm(p * 2.6 + vec2(-uTime * 0.45, uTime * 0.1));
        float n3 = fbm(p * 5.5 + vec2(-uTime * 0.8, -uTime * 0.2));
        float depth = smoothstep(0.0, 1.6, d);
        vec3 col = mix(uShallow, uDeep, depth);
        // cáusticas suaves no raso
        float ca = smoothstep(0.55, 0.85, n2) * (1.0 - depth) * 0.25;
        col += vec3(0.6, 0.9, 0.85) * ca;
        col *= 0.92 + n1 * 0.16;
        col *= uLight;
        vec3 V = normalize(cameraPosition - vWorld);
        vec3 N = normalize(vec3(-(n2 - 0.5) * 0.28 - (n3 - 0.5) * 0.12, 1.0, -(n1 - 0.5) * 0.28 - (n3 - 0.5) * 0.1));
        float fres = 0.04 + 0.96 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
        col = mix(col, uSkyColor * (0.55 + 0.45 * uLight), clamp(fres * 0.9 + 0.12, 0.0, 0.85));
        vec3 H = normalize(V + uSunDir);
        float spec = pow(max(dot(N, H), 0.0), 220.0);
        col += uSunColor * spec * 2.2 * (1.0 - uNight * 0.7);
        // espuma na beira
        float foam = 1.0 - smoothstep(0.02, 0.18 + n1 * 0.18, d);
        foam += smoothstep(0.78, 0.9, n3) * (1.0 - smoothstep(0.0, 0.6, d)) * 0.5;
        col = mix(col, uFoam * max(uLight, 0.22), clamp(foam, 0.0, 1.0) * 0.8);
        float alpha = mix(0.72, 0.93, depth);
        alpha = max(alpha, foam * 0.9);
        alpha *= smoothstep(-0.12, 0.02, d);
        gl_FragColor = vec4(col, alpha);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });

  const geo = new THREE.PlaneGeometry(460, 14, 460, 28);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(0, RIVER.waterY, -10);
  mesh.renderOrder = 2;
  scene.add(mesh);
  return { mesh, uniforms: mat.uniforms };
}
