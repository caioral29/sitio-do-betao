import * as THREE from 'three';
import { RIVER, isRiverTile, mulberry32, vnoise } from './config.js';

export const GRID = { x0: -64, x1: 64, z0: -46, z1: 40 };

export function buildTerrain(scene) {
  const R = mulberry32(42);
  const patches = [];
  for (let i = 0; i < 18; i++) patches.push([-26 + R() * 52, -4 + R() * 21, 0.7 + R() * 1.5]);
  for (let i = 0; i < 10; i++) patches.push([-26 + R() * 52, -16 + R() * 3, 0.6 + R() * 1.2]);
  const inPatch = (x, z) => patches.some((p) => (x - p[0]) ** 2 + (z - p[1]) ** 2 < p[2] * p[2]);

  const tiles = [];
  const dirt = [];
  const c = new THREE.Color();

  for (let ix = GRID.x0; ix < GRID.x1; ix++) {
    for (let iz = GRID.z0; iz < GRID.z1; iz++) {
      const cx = ix + 0.5, cz = iz + 0.5;
      let top = 0, h = 0.22;
      if (iz >= 19 && iz <= 24) {
        top = -0.03;
        c.set('#56585d').offsetHSL(0, 0, (R() - 0.5) * 0.035);
      } else if (iz === 18 || iz === 25) {
        c.set((ix + iz) & 1 ? '#d88f46' : '#cc843f').offsetHSL(0, 0, (R() - 0.5) * 0.03);
      } else if (isRiverTile(ix, iz)) {
        top = RIVER.bedY + R() * 0.15;
        h = 0.6;
        c.set('#7d6d50').offsetHSL(0, 0, (R() - 0.5) * 0.06);
      } else {
        c.set((ix + iz) & 1 ? '#7fbb40' : '#77b23b');
        const n = vnoise(cx * 0.09, cz * 0.09);
        c.offsetHSL((n - 0.5) * 0.02, 0, (n - 0.5) * 0.08 + (R() - 0.5) * 0.025);
        const inside = cx > -28 && cx < 28 && cz > -17 && cz < 17.5;
        if (inside && inPatch(cx, cz) && R() > 0.4) {
          c.set(R() > 0.5 ? '#d9a04e' : '#e3ad5d').offsetHSL(0, 0, (R() - 0.5) * 0.04);
        }
        const bank = isRiverTile(ix, iz - 1) || isRiverTile(ix, iz + 1) || isRiverTile(ix - 1, iz) || isRiverTile(ix + 1, iz);
        if (bank) {
          c.offsetHSL(0, 0.02, -0.03);
          const d = new THREE.Color(R() > 0.5 ? '#8a6744' : '#7a5a3a');
          dirt.push({ x: cx, z: cz, top: -h, bottom: RIVER.bedY - 0.2, color: d });
        }
      }
      tiles.push({ x: cx, z: cz, top, h, color: c.clone() });
    }
  }

  const geo = new THREE.BoxGeometry(1, 1, 1);
  geo.translate(0, -0.5, 0);
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 });
  const mesh = new THREE.InstancedMesh(geo, mat, tiles.length);
  const m = new THREE.Matrix4();
  tiles.forEach((t, i) => {
    m.makeScale(1, t.h, 1).setPosition(t.x, t.top, t.z);
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, t.color);
  });
  mesh.receiveShadow = true;
  scene.add(mesh);

  const dmesh = new THREE.InstancedMesh(geo, mat, dirt.length);
  dirt.forEach((t, i) => {
    m.makeScale(1, t.top - t.bottom, 1).setPosition(t.x, t.top, t.z);
    dmesh.setMatrixAt(i, m);
    dmesh.setColorAt(i, t.color);
  });
  dmesh.receiveShadow = true;
  scene.add(dmesh);

  return { mesh };
}

// --------------------------------------------------------------- água
export function buildWater(scene) {
  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      uTime: { value: 0 },
      uDeep: { value: new THREE.Color('#0f86c2') },
      uShallow: { value: new THREE.Color('#2fc3e8') },
      uFoam: { value: new THREE.Color('#e9fbff') },
      uSkyColor: { value: new THREE.Color('#bfe4ff') },
      uSunDir: { value: new THREE.Vector3(0.3, 0.8, -0.4).normalize() },
      uSunColor: { value: new THREE.Color('#ffffff') },
      uLight: { value: 1 },
      uNight: { value: 0 },
      uBase: { value: RIVER.base },
      uAmp: { value: RIVER.amp },
      uFreq: { value: RIVER.freq },
      uPhase: { value: RIVER.phase },
      uHW: { value: RIVER.hw },
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
        float w = sin(wp.x * 0.8 + uTime * 1.6) * 0.035 + sin(wp.z * 1.3 - uTime * 1.2 + wp.x * 0.3) * 0.025;
        wp.y += w;
        vWorld = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uLight, uNight, uBase, uAmp, uFreq, uPhase, uHW;
      uniform vec3 uDeep, uShallow, uFoam, uSkyColor, uSunColor, uSunDir;
      varying vec3 vWorld;
      #include <fog_pars_fragment>
      float rc(float x) { return uBase + sin(x * uFreq + uPhase) * uAmp; }
      bool isRiver(vec2 t) { vec2 c = t + 0.5; return abs(c.y - rc(c.x)) < uHW; }
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      void main() {
        vec2 p = vWorld.xz;
        vec2 tile = floor(p);
        float d = 3.0;
        for (int i = -2; i <= 2; i++) {
          for (int j = -2; j <= 2; j++) {
            vec2 t = tile + vec2(float(i), float(j));
            if (!isRiver(t)) {
              vec2 q = clamp(p, t, t + 1.0);
              d = min(d, length(p - q));
            }
          }
        }
        vec2 flow = vec2(uTime * 0.35, 0.0);
        float n1 = noise(p * 1.3 - flow);
        float n2 = noise(p * 2.7 + vec2(-uTime * 0.5, uTime * 0.12));
        vec2 cell = floor(p * 3.0) / 3.0;
        float c = noise(cell * 1.7 - flow * 1.5);
        float depth = smoothstep(0.0, 1.9, d);
        vec3 col = mix(uShallow, uDeep, depth);
        col *= 0.92 + c * 0.16;
        col = mix(col, col * 1.12, n2 * 0.5);
        col *= uLight;
        float sp = step(0.84, noise(cell * 4.0 + vec2(uTime * 0.9, -uTime * 0.4)));
        float foam = 1.0 - smoothstep(0.04, 0.24 + n1 * 0.14, d);
        col = mix(col, uFoam * max(uLight, 0.25), foam * 0.85);
        vec3 V = normalize(cameraPosition - vWorld);
        float fres = pow(1.0 - max(V.y, 0.0), 3.0);
        col = mix(col, uSkyColor, fres * 0.4);
        vec3 N = normalize(vec3(-(n2 - 0.5) * 0.35, 1.0, -(n1 - 0.5) * 0.35));
        vec3 H = normalize(V + uSunDir);
        float spec = pow(max(dot(N, H), 0.0), 140.0);
        col += uSunColor * (spec * 1.4 + sp * 0.12 * (1.0 - uNight));
        float alpha = mix(0.78, 0.94, depth);
        gl_FragColor = vec4(col, alpha);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });

  const geo = new THREE.PlaneGeometry(128, 14, 256, 28);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(0, RIVER.waterY, -10);
  mesh.renderOrder = 2;
  scene.add(mesh);
  return { mesh, uniforms: mat.uniforms };
}
