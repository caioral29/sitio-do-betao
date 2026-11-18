import * as THREE from 'three';
import { mulberry32, clamp } from './config.js';

// cores do céu e das luzes ao longo do dia (h = hora)
const KEYS = [
  { h: 0, top: '#040816', hor: '#16203d', sun: '#9fb6ff', sunI: 0.75, hs: '#3d5590', hg: '#1a2238', hi: 0.62, night: 1, env: 0.1, cloud: '#232c46' },
  { h: 4.6, top: '#0a1028', hor: '#26304f', sun: '#9fb6ff', sunI: 0.75, hs: '#3d5590', hg: '#1a2238', hi: 0.62, night: 1, env: 0.1, cloud: '#2a3350' },
  { h: 5.7, top: '#30438a', hor: '#f7a76a', sun: '#ffb37a', sunI: 0.82, hs: '#8a90b8', hg: '#4a3a2c', hi: 0.425, night: 0.35, env: 0.125, cloud: '#ffc9a8' },
  { h: 7.0, top: '#3f8ae6', hor: '#ffe0b0', sun: '#ffe6c2', sunI: 2.13, hs: '#bcd8ff', hg: '#6b5a3a', hi: 0.468, night: 0, env: 0.275, cloud: '#fff1df' },
  { h: 12, top: '#2a7ee8', hor: '#c6e8ff', sun: '#fffaf0', sunI: 2.71, hs: '#cfe6ff', hg: '#7a6a45', hi: 0.468, night: 0, env: 0.375, cloud: '#ffffff' },
  { h: 15.5, top: '#3486e6', hor: '#d6eeff', sun: '#fff1d8', sunI: 2.62, hs: '#d0e6ff', hg: '#7a6a45', hi: 0.468, night: 0, env: 0.36, cloud: '#ffffff' },
  { h: 17.3, top: '#4a7fd0', hor: '#ffd29a', sun: '#ffc47a', sunI: 2.6, hs: '#cfd8f0', hg: '#7a6040', hi: 0.5, night: 0, env: 0.3, cloud: '#ffe3c2' },
  { h: 18.3, top: '#3f4f96', hor: '#ff9a5a', sun: '#ff9a4a', sunI: 2.1, hs: '#a9b2e0', hg: '#5a4a40', hi: 0.62, night: 0.15, env: 0.2, cloud: '#ffab7d' },
  { h: 19.2, top: '#1a2150', hor: '#8a5480', sun: '#b0a0ff', sunI: 0.8, hs: '#5a5a90', hg: '#1a1a28', hi: 0.55, night: 0.75, env: 0.14, cloud: '#6a5276' },
  { h: 20.5, top: '#070c22', hor: '#1d2747', sun: '#9fb6ff', sunI: 0.75, hs: '#3d5590', hg: '#1a2238', hi: 0.62, night: 1, env: 0.1, cloud: '#273050' },
  { h: 24, top: '#040816', hor: '#16203d', sun: '#9fb6ff', sunI: 0.75, hs: '#3d5590', hg: '#1a2238', hi: 0.62, night: 1, env: 0.1, cloud: '#232c46' },
].map((k) => ({
  ...k, top: new THREE.Color(k.top), hor: new THREE.Color(k.hor), sun: new THREE.Color(k.sun), hs: new THREE.Color(k.hs),
  hg: new THREE.Color(k.hg), cloud: new THREE.Color(k.cloud),
}));

export class Sky {
  constructor(scene) {
    this.scene = scene;
    this.uniforms = {
      uTop: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uMoonDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Color() },
      uCloud: { value: new THREE.Color() },
      uNight: { value: 0 },
      uTime: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 p = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * p;
          gl_Position.z = gl_Position.w;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uTop, uHorizon, uSunColor, uSunDir, uMoonDir, uCloud;
        uniform float uNight, uTime;
        varying vec3 vDir;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
        }
        float fbm(vec2 p) {
          float v = 0.0, a = 0.5;
          for (int i = 0; i < 5; i++) { v += noise(p) * a; p = p * 2.03 + vec2(1.7, -2.3); a *= 0.5; }
          return v;
        }
        float clouds(vec2 uv) {
          float base = fbm(uv * 0.55 + vec2(uTime * 0.006, 0.0));
          float det = fbm(uv * 1.9 - vec2(uTime * 0.01, uTime * 0.004));
          float c = base * 0.75 + det * 0.35;
          return smoothstep(0.52, 0.78, c);
        }
        void main() {
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 col = mix(uHorizon, uTop, pow(smoothstep(-0.02, 0.6, h), 0.75));
          col = mix(col, uHorizon * 0.85, smoothstep(0.0, -0.25, h));
          float sd = max(dot(d, uSunDir), 0.0);
          float day = 1.0 - uNight;
          col += uSunColor * (pow(sd, 5.0) * 0.22 + pow(sd, 40.0) * 0.4) * day;
          col += uSunColor * smoothstep(0.99935, 0.99962, sd) * 3.0 * day;
          float md = max(dot(d, uMoonDir), 0.0);
          col += vec3(0.85, 0.9, 1.0) * smoothstep(0.9991, 0.9994, md) * 1.4 * uNight;
          col += vec3(0.5, 0.6, 0.9) * pow(md, 40.0) * 0.15 * uNight;
          // nuvens fofas (projeção num plano alto)
          if (h > 0.0) {
            vec2 uv = d.xz / (h + 0.12) * 1.6;
            float c = clouds(uv);
            float cs = clouds(uv + uSunDir.xz * 0.18); // amostra rumo ao sol: lado de sombra
            float lit = clamp(1.0 - (cs - c) * 1.6, 0.0, 1.0);
            vec3 shade = mix(uCloud * vec3(0.62, 0.66, 0.78), uCloud, lit);
            shade += uSunColor * pow(sd, 8.0) * 0.35 * day;
            float fade = smoothstep(0.0, 0.18, h);
            col = mix(col, shade, c * fade * 0.95);
          }
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(500, 48, 24), mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10;
    scene.add(this.mesh);

    // estrelas
    const R = mulberry32(99);
    const pos = [];
    for (let i = 0; i < 1600; i++) {
      const u = R() * 2 - 1, a = R() * Math.PI * 2;
      const y = Math.abs(u) * 0.95 + 0.05;
      const r = Math.sqrt(1 - y * y);
      pos.push(Math.cos(a) * r * 470, y * 470, Math.sin(a) * r * 470);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    this.starMat = new THREE.PointsMaterial({ color: '#ffffff', size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
    this.stars = new THREE.Points(sg, this.starMat);
    this.stars.frustumCulled = false;
    scene.add(this.stars);

    // luzes
    this.hemi = new THREE.HemisphereLight('#cfe6ff', '#7a6a45', 1);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#ffffff', 3);
    this.sun.castShadow = true;
    const coarse = matchMedia('(pointer: coarse)').matches;
    this.sun.shadow.mapSize.set(coarse ? 1024 : 2048, coarse ? 1024 : 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -26; sc.right = 26; sc.top = 26; sc.bottom = -26; sc.near = 1; sc.far = 150;
    this.sun.shadow.bias = -0.0003;
    this.sun.shadow.normalBias = 0.025;
    this.sun.shadow.radius = 3;
    scene.add(this.sun);
    scene.add(this.sun.target);

    scene.fog = new THREE.Fog('#d3ebff', 80, 330);
    this.state = { night: 0, light: 1, sunDir: new THREE.Vector3(), horizon: new THREE.Color(), top: new THREE.Color(), env: 0.6 };
  }

  sample(hour) {
    let a = KEYS[0], b = KEYS[1];
    for (let i = 0; i < KEYS.length - 1; i++) {
      if (hour >= KEYS[i].h && hour <= KEYS[i + 1].h) {
        a = KEYS[i];
        b = KEYS[i + 1];
        break;
      }
    }
    const t = (hour - a.h) / (b.h - a.h || 1);
    const s = t * t * (3 - 2 * t);
    const L = (k) => a[k].clone().lerp(b[k], s);
    const N = (k) => a[k] + (b[k] - a[k]) * s;
    return {
      top: L('top'), hor: L('hor'), sun: L('sun'), hs: L('hs'), hg: L('hg'), cloud: L('cloud'),
      sunI: N('sunI'), hi: N('hi'), night: N('night'), env: N('env'),
    };
  }

  update(hour, focus, camera, time = 0) {
    const k = this.sample(hour);
    const u = this.uniforms;
    u.uTop.value.copy(k.top);
    u.uHorizon.value.copy(k.hor);
    u.uSunColor.value.copy(k.sun);
    u.uCloud.value.copy(k.cloud);
    u.uNight.value = k.night;
    u.uTime.value = time;

    // sol nasce no leste (+x) e se põe no oeste; pende para o norte (hemisfério sul!)
    const a = ((hour - 6) / 12) * Math.PI;
    const sunDir = new THREE.Vector3(Math.cos(a), Math.sin(a), -0.45).normalize();
    const am = ((hour - 18) / 12) * Math.PI;
    const moonDir = new THREE.Vector3(Math.cos(am) * 0.8, Math.sin(am) * 0.9 + 0.1, 0.35).normalize();
    u.uSunDir.value.copy(sunDir);
    u.uMoonDir.value.copy(moonDir);

    const blend = clamp((sunDir.y + 0.12) / 0.24, 0, 1);
    const lightDir = moonDir.clone().lerp(sunDir, blend);
    lightDir.y = Math.max(lightDir.y, 0.32);
    lightDir.normalize();

    this.sun.color.copy(k.sun);
    this.sun.intensity = k.sunI;
    // sol baixo: mais bias na sombra (evita "acne" pontilhada no chão)
    const low = 1 - clamp((lightDir.y - 0.32) / 0.6, 0, 1);
    this.sun.shadow.bias = -0.0003 - low * 0.0009;
    this.sun.shadow.normalBias = 0.025 + low * 0.06;
    this.hemi.color.copy(k.hs);
    this.hemi.groundColor.copy(k.hg);
    this.hemi.intensity = k.hi;

    // sombra segue o jogador (com snap ao texel para não tremer)
    const texel = 52 / 2048;
    const fx = Math.round(focus.x / texel) * texel, fz = Math.round(focus.z / texel) * texel;
    this.sun.target.position.set(fx, 0, fz);
    this.sun.position.set(fx + lightDir.x * 70, lightDir.y * 70, fz + lightDir.z * 70);

    this.scene.fog.color.copy(k.hor).lerp(k.top, 0.2);
    this.starMat.opacity = clamp(k.night * 1.1 - 0.1, 0, 1);
    this.mesh.position.copy(camera.position);
    this.stars.position.copy(camera.position);
    this.stars.rotation.y = hour * 0.02;

    const st = this.state;
    st.night = k.night;
    st.light = Math.max(k.sunI / 3.2 * 0.75 + k.hi * 0.45, 0.18);
    st.sunDir.copy(sunDir.y > -0.05 ? sunDir : moonDir);
    st.horizon.copy(k.hor);
    st.top.copy(k.top);
    st.sunColor = k.sun;
    st.env = k.env;
    return st;
  }
}
