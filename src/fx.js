import * as THREE from 'three';
import { makeNoteTexture } from './textures.js';
import { RIVER } from './config.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

export class FX {
  constructor(scene) {
    this.scene = scene;
    const MAX = 900;
    this.max = MAX;
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.6 });
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    for (let i = 0; i < MAX; i++) {
      this.mesh.setMatrixAt(i, _m.makeScale(0, 0, 0));
      this.mesh.setColorAt(i, _c.set('#ffffff'));
    }
    scene.add(this.mesh);
    this.ps = [];
    for (let i = 0; i < MAX; i++) this.ps.push({ alive: false, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Vector3(), w: new THREE.Vector3() });
    this.cursor = 0;

    // ondinhas
    this.ripples = [];
    const rg = new THREE.RingGeometry(0.85, 1, 32);
    rg.rotateX(-Math.PI / 2);
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false }));
      m.visible = false;
      scene.add(m);
      this.ripples.push({ m, t: 0, life: 1, size: 1 });
    }

    // notas musicais
    const tex = [makeNoteTexture('♪', '#ffd23f'), makeNoteTexture('♫', '#ff6fb5'), makeNoteTexture('♪', '#5fd3ff'), makeNoteTexture('♫', '#9dff6a')];
    this.notes = [];
    for (let i = 0; i < 24; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex[i % 4], transparent: true, depthWrite: false }));
      sp.visible = false;
      sp.scale.setScalar(0.5);
      scene.add(sp);
      this.notes.push({ sp, t: 0, life: 1, v: new THREE.Vector3() });
    }
  }

  emit({ pos, count = 10, color = '#ffffff', colors = null, speed = 3, spread = 1, up = 3, life = 1, size = 0.12, gravity = -12, drag = 0.5, ground = -99, jitter = 0.2, spin = 6 }) {
    for (let i = 0; i < count; i++) {
      const idx = this.cursor;
      const p = this.ps[idx];
      this.cursor = (this.cursor + 1) % this.max;
      p.alive = true;
      p.p.set(pos.x + (Math.random() - 0.5) * jitter, pos.y + (Math.random() - 0.5) * jitter * 0.5, pos.z + (Math.random() - 0.5) * jitter);
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.6);
      p.v.set(Math.cos(a) * s * spread, up * (0.6 + Math.random() * 0.6), Math.sin(a) * s * spread);
      p.life = life * (0.7 + Math.random() * 0.6);
      p.t = 0;
      p.size = size * (0.6 + Math.random() * 0.8);
      p.g = gravity;
      p.drag = drag;
      p.ground = ground;
      p.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      p.w.set((Math.random() - 0.5) * spin, (Math.random() - 0.5) * spin, (Math.random() - 0.5) * spin);
      this.mesh.setColorAt(idx, _c.set(colors ? colors[Math.floor(Math.random() * colors.length)] : color));
    }
    this.mesh.instanceColor.needsUpdate = true;
  }

  splash(pos, size = 1) {
    this.emit({ pos, count: Math.round(14 * size), colors: ['#bdeeff', '#7fd6f5', '#ffffff'], speed: 2.2 * size, up: 4 * size, life: 0.7, size: 0.11, gravity: -14, ground: RIVER.waterY - 0.1 });
    this.ripple(pos, 0.9 * size, 1.1);
    this.ripple(pos, 0.5 * size, 0.8);
  }
  ripple(pos, size = 1, life = 1.2) {
    const r = this.ripples.find((x) => !x.m.visible) || this.ripples[0];
    r.m.visible = true;
    r.m.position.set(pos.x, RIVER.waterY + 0.04, pos.z);
    r.t = 0;
    r.life = life;
    r.size = size;
  }
  dust(pos) {
    this.emit({ pos, count: 3, colors: ['#d8c39a', '#c9b38a', '#e6d6b2'], speed: 0.8, up: 1.2, life: 0.45, size: 0.1, gravity: -2, jitter: 0.3, spin: 3 });
  }
  leaves(pos) {
    this.emit({ pos, count: 14, colors: ['#6fb53a', '#8fd14f', '#5ea333'], speed: 1.8, up: 0.5, life: 2.2, size: 0.14, gravity: -2.2, drag: 1.6, jitter: 1.4, spin: 8, ground: 0.02 });
  }
  confetti(pos, n = 50) {
    this.emit({ pos, count: n, colors: ['#ff4d6d', '#ffd23f', '#3ec1ff', '#7cff6b', '#c58bff', '#ffffff'], speed: 4, up: 6, life: 2.2, size: 0.1, gravity: -6, drag: 1.4, jitter: 0.4, spin: 12, ground: 0.02 });
  }
  sparkle(pos, color = '#fff2a8', n = 8) {
    this.emit({ pos, count: n, color, speed: 1.5, up: 1.6, life: 0.7, size: 0.07, gravity: -1, jitter: 0.5 });
  }
  note(pos) {
    const n = this.notes.find((x) => !x.sp.visible);
    if (!n) return;
    n.sp.visible = true;
    n.sp.position.copy(pos);
    n.t = 0;
    n.life = 1.6;
    n.v.set((Math.random() - 0.5) * 0.8, 1.1 + Math.random() * 0.5, (Math.random() - 0.5) * 0.8);
    n.sp.material.rotation = (Math.random() - 0.5) * 0.6;
  }

  update(dt) {
    let any = false;
    for (let i = 0; i < this.max; i++) {
      const p = this.ps[i];
      if (!p.alive) continue;
      any = true;
      p.t += dt;
      if (p.t >= p.life) {
        p.alive = false;
        this.mesh.setMatrixAt(i, _m.makeScale(0, 0, 0));
        continue;
      }
      p.v.y += p.g * dt;
      p.v.multiplyScalar(Math.exp(-p.drag * dt));
      p.p.addScaledVector(p.v, dt);
      if (p.p.y < p.ground) {
        p.p.y = p.ground;
        p.v.set(p.v.x * 0.5, 0, p.v.z * 0.5);
        p.w.multiplyScalar(0.8);
      }
      p.r.addScaledVector(p.w, dt);
      const k = p.t / p.life;
      const s = p.size * (k < 0.75 ? 1 : 1 - (k - 0.75) / 0.25);
      _e.set(p.r.x, p.r.y, p.r.z);
      _q.setFromEuler(_e);
      _m.compose(p.p, _q, _s.set(s, s, s));
      this.mesh.setMatrixAt(i, _m);
    }
    if (any || this._wasAny) this.mesh.instanceMatrix.needsUpdate = true;
    this._wasAny = any;

    for (const r of this.ripples) {
      if (!r.m.visible) continue;
      r.t += dt;
      const k = r.t / r.life;
      if (k >= 1) {
        r.m.visible = false;
        continue;
      }
      r.m.scale.setScalar(0.15 + k * r.size);
      r.m.material.opacity = (1 - k) * 0.55;
    }
    for (const n of this.notes) {
      if (!n.sp.visible) continue;
      n.t += dt;
      const k = n.t / n.life;
      if (k >= 1) {
        n.sp.visible = false;
        continue;
      }
      n.sp.position.addScaledVector(n.v, dt);
      n.sp.position.x += Math.sin(n.t * 6) * dt * 0.4;
      n.sp.material.opacity = k < 0.15 ? k / 0.15 : 1 - Math.max(0, (k - 0.6) / 0.4);
      n.sp.scale.setScalar(0.35 + Math.min(k * 2, 1) * 0.2);
    }
  }
}
