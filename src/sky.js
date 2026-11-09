import * as THREE from 'three';
import { mulberry32, clamp } from './config.js';

const KEYS = [
  { h: 0, top: '#050914', hor: '#16203d', sun: '#8fa6ff', sunI: 0.32, hs: '#2a3b6b', hg: '#0d1220', hi: 0.32, night: 1, env: 0.05 },
  { h: 4.6, top: '#0a1028', hor: '#26304f', sun: '#8fa6ff', sunI: 0.3, hs: '#2f3e6e', hg: '#101626', hi: 0.34, night: 1, env: 0.05 },
  { h: 5.7, top: '#2b3c78', hor: '#f0a26b', sun: '#ffb37a', sunI: 0.9, hs: '#8a90b8', hg: '#4a3a2c', hi: 0.55, night: 0.35, env: 0.15 },
  { h: 7.0, top: '#4a92e0', hor: '#ffd9a8', sun: '#ffe1b5', sunI: 2.3, hs: '#bcd8ff', hg: '#6b5a3a', hi: 0.85, night: 0, env: 0.3 },
  { h: 12, top: '#2f80e0', hor: '#bfe4ff', sun: '#fffaf0', sunI: 3.0, hs: '#cfe6ff', hg: '#7a6a45', hi: 1.0, night: 0, env: 0.38 },
  { h: 15.5, top: '#3a88e2', hor: '#d3ebff', sun: '#fff0d6', sunI: 2.9, hs: '#d0e6ff', hg: '#7a6a45', hi: 0.95, night: 0, env: 0.36 },
  { h: 17.3, top: '#4a7fd0', hor: '#ffcf8f', sun: '#ffc27a', sunI: 2.7, hs: '#f0dcc8', hg: '#7a6040', hi: 0.95, night: 0, env: 0.32 },
  { h: 18.3, top: '#3f4f96', hor: '#ff9a5a', sun: '#ff9050', sunI: 2.0, hs: '#f0b8a8', hg: '#6a4a38', hi: 0.85, night: 0.15, env: 0.24 },
  { h: 19.2, top: '#1a2150', hor: '#8a5480', sun: '#b0a0ff', sunI: 0.45, hs: '#5a5a90', hg: '#1a1a28', hi: 0.5, night: 0.75, env: 0.1 },
  { h: 20.5, top: '#070c22', hor: '#1d2747', sun: '#9db0ff', sunI: 0.32, hs: '#2f3d6e', hg: '#0e1322', hi: 0.34, night: 1, env: 0.05 },
  { h: 24, top: '#050914', hor: '#16203d', sun: '#8fa6ff', sunI: 0.32, hs: '#2a3b6b', hg: '#0d1220', hi: 0.32, night: 1, env: 0.05 },
].map((k) => ({ ...k, top: new THREE.Color(k.top), hor: new THREE.Color(k.hor), sun: new THREE.Color(k.sun), hs: new THREE.Color(k.hs), hg: new THREE.Color(k.hg) }));

export class Sky {
  constructor(scene) {
    this.scene = scene;
    this.uniforms = {
      uTop: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uMoonDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Color() },
      uNight: { value: 0 },
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
        uniform vec3 uTop, uHorizon, uSunColor, uSunDir, uMoonDir;
        uniform float uNight;
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 col = mix(uHorizon, uTop, pow(smoothstep(-0.02, 0.65, h), 0.8));
          col = mix(col, uHorizon * 0.8, smoothstep(0.0, -0.25, h));
          float sd = max(dot(d, uSunDir), 0.0);
          col += uSunColor * (pow(sd, 6.0) * 0.18 + pow(sd, 48.0) * 0.35) * (1.0 - uNight);
          col += uSunColor * smoothstep(0.9993, 0.9996, sd) * 2.0 * (1.0 - uNight);
          float md = max(dot(d, uMoonDir), 0.0);
          col += vec3(0.85, 0.9, 1.0) * smoothstep(0.9990, 0.9993, md) * 1.2 * uNight;
          col += vec3(0.5, 0.6, 0.9) * pow(md, 40.0) * 0.12 * uNight;
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10;
    scene.add(this.mesh);

    // estrelas
    const R = mulberry32(99);
    const pos = [];
    for (let i = 0; i < 1400; i++) {
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
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -30; sc.right = 30; sc.top = 30; sc.bottom = -30; sc.near = 1; sc.far = 140;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    scene.add(this.sun);
    scene.add(this.sun.target);

    scene.fog = new THREE.Fog('#d3ebff', 70, 260);
    this.state = { night: 0, light: 1, sunDir: new THREE.Vector3(), horizon: new THREE.Color(), top: new THREE.Color(), env: 0.3 };
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
    return {
      top: a.top.clone().lerp(b.top, s),
      hor: a.hor.clone().lerp(b.hor, s),
      sun: a.sun.clone().lerp(b.sun, s),
      hs: a.hs.clone().lerp(b.hs, s),
      hg: a.hg.clone().lerp(b.hg, s),
      sunI: a.sunI + (b.sunI - a.sunI) * s,
      hi: a.hi + (b.hi - a.hi) * s,
      night: a.night + (b.night - a.night) * s,
      env: a.env + (b.env - a.env) * s,
    };
  }

  update(hour, focus, camera) {
    const k = this.sample(hour);
    const u = this.uniforms;
    u.uTop.value.copy(k.top);
    u.uHorizon.value.copy(k.hor);
    u.uSunColor.value.copy(k.sun);
    u.uNight.value = k.night;

    // sol nasce no leste (+x) e se põe no oeste; pende para o norte (hemisfério sul!)
    const a = ((hour - 6) / 12) * Math.PI;
    const sunDir = new THREE.Vector3(Math.cos(a), Math.sin(a), -0.45).normalize();
    const am = ((hour - 18) / 12) * Math.PI;
    const moonDir = new THREE.Vector3(Math.cos(am) * 0.8, Math.sin(am) * 0.9 + 0.1, 0.35).normalize();
    u.uSunDir.value.copy(sunDir);
    u.uMoonDir.value.copy(moonDir);

    const blend = clamp((sunDir.y + 0.12) / 0.24, 0, 1);
    const lightDir = moonDir.clone().lerp(sunDir, blend);
    lightDir.y = Math.max(lightDir.y, 0.35);
    lightDir.normalize();

    this.sun.color.copy(k.sun);
    this.sun.intensity = k.sunI;
    this.hemi.color.copy(k.hs);
    this.hemi.groundColor.copy(k.hg);
    this.hemi.intensity = k.hi;

    // sombra segue o jogador (com snap ao texel para não tremer)
    const texel = 60 / 2048;
    const fx = Math.round(focus.x / texel) * texel, fz = Math.round(focus.z / texel) * texel;
    this.sun.target.position.set(fx, 0, fz);
    this.sun.position.set(fx + lightDir.x * 60, lightDir.y * 60, fz + lightDir.z * 60);

    this.scene.fog.color.copy(k.hor).lerp(k.top, 0.15);
    this.starMat.opacity = clamp(k.night * 1.1 - 0.1, 0, 1);
    this.mesh.position.copy(camera.position);
    this.stars.position.copy(camera.position);
    this.stars.rotation.y = hour * 0.02;

    const st = this.state;
    st.night = k.night;
    st.light = Math.max(k.sunI / 3.0 * 0.75 + k.hi * 0.25, 0.18);
    st.sunDir.copy(sunDir.y > -0.05 ? sunDir : moonDir);
    st.horizon.copy(k.hor);
    st.top.copy(k.top);
    st.sunColor = k.sun;
    st.env = k.env;
    return st;
  }
}
