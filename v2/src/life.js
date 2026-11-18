import * as THREE from 'three';
import { Batcher } from './world.js';
import { RIVER, riverCenter, mulberry32 } from './config.js';
import { makeFishMesh, FISH } from './fishing.js';
import { makeGlowTexture } from './textures.js';
import { canvasTex } from './kit.js';

// Vida ambiente: pássaros, borboletas, vaga-lumes, peixes pulando, carros e nuvens
export class Life {
  constructor(scene, world, audio, fx, player) {
    this.scene = scene;
    this.world = world;
    this.audio = audio;
    this.fx = fx;
    this.player = player;
    const R = (this.R = mulberry32(555));

    // pássaros
    this.birds = [];
    const birdMat = new THREE.MeshStandardMaterial({ color: '#2b2b33', roughness: 0.8 });
    for (let f = 0; f < 2; f++) {
      const center = new THREE.Vector3(-10 + f * 22, 16 + f * 5, -6 + f * 6);
      for (let i = 0; i < 4; i++) {
        const g = new THREE.Group();
        const bg = new THREE.SphereGeometry(1, 12, 8);
        bg.scale(0.08, 0.07, 0.24);
        const body = new THREE.Mesh(bg, birdMat);
        g.add(body);
        const tail = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.18, 6), birdMat);
        tail.rotation.x = -Math.PI / 2;
        tail.scale.set(1, 1, 0.3);
        tail.position.z = -0.26;
        g.add(tail);
        const wings = [];
        for (const s of [-1, 1]) {
          const piv = new THREE.Group();
          piv.position.x = s * 0.05;
          const wg = new THREE.SphereGeometry(1, 10, 6);
          wg.scale(0.3, 0.015, 0.11);
          const w = new THREE.Mesh(wg, birdMat);
          w.position.x = s * 0.28;
          piv.add(w);
          g.add(piv);
          wings.push({ piv, s });
        }
        scene.add(g);
        this.birds.push({ g, wings, center, r: 14 + f * 6 + i * 1.2, a: i * 0.35 + f, sp: (0.18 + f * 0.05) * (f ? -1 : 1), h: i * 0.6, ph: R() * 6 });
      }
    }

    // borboletas
    this.butterflies = [];
    const bcols = [['#ffcf2e', '#3a2a10'], ['#ffffff', '#5a5a5a'], ['#ff8fb8', '#4a1830'], ['#4fb8ff', '#0e2a55'], ['#ff9a3c', '#3a1a08']];
    const wingTex = bcols.map(([c, edge]) => canvasTex(128, 128, (g2, w, h) => {
      g2.clearRect(0, 0, w, h);
      const wing = (y0, rx, ry) => {
        g2.beginPath();
        g2.ellipse(w * 0.48, y0, rx, ry, 0.35, 0, Math.PI * 2);
        g2.fill();
      };
      g2.fillStyle = edge;
      wing(h * 0.36, 48, 34);
      wing(h * 0.72, 34, 26);
      g2.fillStyle = c;
      wing(h * 0.36, 40, 27);
      wing(h * 0.72, 27, 19);
      g2.fillStyle = edge;
      for (const [x, y] of [[0.62, 0.3], [0.5, 0.42], [0.55, 0.72]]) {
        g2.beginPath();
        g2.arc(w * x, h * y, 5, 0, Math.PI * 2);
        g2.fill();
      }
    }, { repeat: false, dilate: true }));
    const bodyMat = new THREE.MeshStandardMaterial({ color: '#2a221a', roughness: 0.7 });
    for (let i = 0; i < 12; i++) {
      const g = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ map: wingTex[i % wingTex.length], side: THREE.DoubleSide, roughness: 0.6, alphaTest: 0.4 });
      const wings = [];
      const bd = new THREE.Mesh(new THREE.CapsuleGeometry(0.008, 0.09, 3, 6), bodyMat);
      bd.rotation.x = Math.PI / 2;
      g.add(bd);
      for (const s of [-1, 1]) {
        const piv = new THREE.Group();
        const geo = new THREE.PlaneGeometry(0.17, 0.17);
        geo.rotateX(-Math.PI / 2);
        const w = new THREE.Mesh(geo, mat);
        w.position.x = s * 0.08;
        w.scale.x = s;
        piv.add(w);
        g.add(piv);
        wings.push({ piv, s });
      }
      const pos = new THREE.Vector3(-20 + R() * 30, 0.8 + R(), -2 + R() * 16);
      g.position.copy(pos);
      scene.add(g);
      this.butterflies.push({ g, wings, target: pos.clone(), ph: R() * 6, sp: 1 + R() * 0.6 });
    }

    // vaga-lumes
    const N = 90;
    this.ffPos = [];
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const x = -26 + R() * 52;
      let z = -15 + R() * 31;
      if (R() < 0.4) z = riverCenter(x) + (R() < 0.5 ? -1 : 1) * (RIVER.hw + 0.5 + R() * 2);
      this.ffPos.push({ x, y: 0.4 + R() * 2.2, z, ph: R() * 10, sp: 0.5 + R() });
    }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    fg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.ff = new THREE.Points(fg, new THREE.PointsMaterial({
      size: 0.32, map: makeGlowTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.ff.frustumCulled = false;
    scene.add(this.ff);

    // peixe pulando
    this.jumpT = 4;
    this.jumper = null;

    // carros
    this.cars = [];
    this.carT = 6;
    this.headMat = new THREE.MeshStandardMaterial({ color: '#fff7d6', emissive: '#fff2b0', emissiveIntensity: 0 });
    this.tailMat = new THREE.MeshStandardMaterial({ color: '#7a1010', emissive: '#ff2020', emissiveIntensity: 0 });
  }

  makeCar() {
    const R = this.R;
    const cols = ['#d93a3a', '#f0c330', '#2a9d8f', '#3d6bd8', '#f4f1ea', '#ff7a2f', '#6b3fd6', '#2f3337', '#9aa3ad'];
    const col = cols[Math.floor(R() * cols.length)];
    const pickup = R() < 0.35;
    const g = new THREE.Group();
    const paint = new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.3, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.08 });
    const black = new THREE.MeshStandardMaterial({ color: '#1f1f22', roughness: 0.6 });
    const glass = new THREE.MeshPhysicalMaterial({ color: '#203445', roughness: 0.05, metalness: 0.2, envMapIntensity: 1.5 });
    // perfil lateral (x = frente, y = cima), extrudado na largura (z)
    const sh = new THREE.Shape();
    const pts = pickup
      ? [[-1.6, 0.35], [-1.6, 1.0], [-0.25, 1.0], [-0.15, 1.02], [0.05, 1.62], [0.75, 1.62], [1.05, 1.08], [1.58, 1.0], [1.62, 0.5], [1.55, 0.35]]
      : [[-1.6, 0.35], [-1.62, 0.95], [-1.25, 1.05], [-0.85, 1.55], [0.45, 1.58], [0.98, 1.08], [1.58, 0.98], [1.64, 0.55], [1.55, 0.35]];
    pts.forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y)));
    sh.closePath();
    const bodyGeo = new THREE.ExtrudeGeometry(sh, { depth: 1.36, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 4, curveSegments: 8 });
    bodyGeo.translate(0, 0, -0.68);
    bodyGeo.computeVertexNormals();
    const body = new THREE.Mesh(bodyGeo, paint);
    g.add(body);
    // vidros (faixa escura um pouco pra fora da lataria)
    const gw = new THREE.Shape();
    const gp = pickup ? [[0.12, 1.1], [0.18, 1.56], [0.72, 1.56], [0.98, 1.1]] : [[-1.1, 1.08], [-0.8, 1.5], [0.42, 1.52], [0.88, 1.1]];
    gp.forEach(([x, y], i) => (i ? gw.lineTo(x, y) : gw.moveTo(x, y)));
    gw.closePath();
    const glassGeo = new THREE.ExtrudeGeometry(gw, { depth: 1.56, bevelEnabled: false });
    glassGeo.translate(0, 0, -0.78);
    g.add(new THREE.Mesh(glassGeo, glass));
    if (pickup) {
      const bedM = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.1, 1.36), black);
      bedM.position.set(-0.9, 1.0, 0);
      g.add(bedM);
    }
    // pára-choques
    for (const x of [-1.68, 1.68]) {
      const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 1.3, 4, 10), black);
      b.rotation.x = Math.PI / 2;
      b.position.set(x, 0.5, 0);
      g.add(b);
    }
    // rodas
    const wheels = [];
    const tire = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 24);
    tire.rotateX(Math.PI / 2);
    const rimGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.26, 18);
    rimGeo.rotateX(Math.PI / 2);
    const tm = new THREE.MeshStandardMaterial({ color: '#19191b', roughness: 0.85 });
    const rm = new THREE.MeshStandardMaterial({ color: '#c3c6cc', roughness: 0.3, metalness: 0.85 });
    for (const x of [-1.05, 1.05]) for (const z of [-0.74, 0.74]) {
      const w = new THREE.Mesh(tire, tm);
      w.position.set(x, 0.34, z);
      w.add(new THREE.Mesh(rimGeo, rm));
      w.castShadow = true;
      g.add(w);
      wheels.push(w);
    }
    for (const z of [-0.5, 0.5]) {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 0.3), this.headMat);
      hl.position.set(1.66, 0.82, z);
      g.add(hl);
      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 0.3), this.tailMat);
      tl.position.set(-1.66, 0.82, z);
      g.add(tl);
    }
    g.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    return { g, wheels };
  }

  spawnCar() {
    const dir = this.R() < 0.5 ? 1 : -1;
    const { g, wheels } = this.makeCar();
    const lane = dir === 1 ? 20.6 : 23.3;
    g.position.set(-dir * 75, -0.03, lane);
    g.rotation.y = dir === 1 ? 0 : Math.PI;
    this.scene.add(g);
    this.cars.push({ g, wheels, dir, lane, v: 9 + this.R() * 4, vmax: 9 + this.R() * 4, honked: false, eng: this.audio.engine() });
  }

  update(dt, time, sky) {
    const night = sky.night;
    const p = this.player.pos;

    // nuvens
    // (as nuvens agora fazem parte do céu)

    // pássaros
    const dayVis = night < 0.6;
    for (const b of this.birds) {
      b.g.visible = dayVis;
      if (!dayVis) continue;
      b.a += b.sp * dt;
      const x = b.center.x + Math.cos(b.a) * b.r;
      const z = b.center.z + Math.sin(b.a) * b.r;
      const y = b.center.y + b.h + Math.sin(time * 0.7 + b.ph) * 1.2;
      b.g.position.set(x, y, z);
      b.g.rotation.y = Math.atan2(-Math.sin(b.a) * b.sp, Math.cos(b.a) * b.sp);
      b.g.rotation.y = -b.a + (b.sp > 0 ? 0 : Math.PI);
      b.g.rotation.z = b.sp > 0 ? 0.25 : -0.25;
      const flap = Math.sin(time * 9 + b.ph) * 0.6;
      for (const w of b.wings) w.piv.rotation.z = w.s * flap;
    }

    // borboletas
    for (const bf of this.butterflies) {
      bf.g.visible = night < 0.5;
      if (!bf.g.visible) continue;
      const d = bf.g.position.distanceTo(bf.target);
      if (d < 0.5) {
        bf.target.set(-22 + Math.random() * 34, 0.5 + Math.random() * 1.6, -3 + Math.random() * 18);
        if (Math.random() < 0.3) bf.target.set(p.x + (Math.random() - 0.5) * 6, 1 + Math.random(), p.z + (Math.random() - 0.5) * 6);
      }
      const dir = bf.target.clone().sub(bf.g.position).normalize();
      bf.g.position.addScaledVector(dir, dt * bf.sp);
      bf.g.position.y += Math.sin(time * 6 + bf.ph) * dt * 0.8;
      bf.g.rotation.y = Math.atan2(dir.x, dir.z);
      const flap = Math.sin(time * 26 + bf.ph) * 1.1;
      for (const w of bf.wings) w.piv.rotation.z = w.s * flap;
    }

    // vaga-lumes
    const pa = this.ff.geometry.attributes.position.array;
    const ca = this.ff.geometry.attributes.color.array;
    const nightVis = Math.max(0, night - 0.3) / 0.7;
    this.ff.visible = nightVis > 0.01;
    if (this.ff.visible) {
      this.ffPos.forEach((f, i) => {
        pa[i * 3] = f.x + Math.sin(time * 0.4 * f.sp + f.ph) * 1.2;
        pa[i * 3 + 1] = f.y + Math.sin(time * 0.9 * f.sp + f.ph * 2) * 0.4;
        pa[i * 3 + 2] = f.z + Math.cos(time * 0.35 * f.sp + f.ph) * 1.2;
        const blink = Math.max(0, Math.sin(time * 1.6 * f.sp + f.ph * 3)) ** 3 * nightVis;
        ca[i * 3] = 0.85 * blink;
        ca[i * 3 + 1] = 1.0 * blink;
        ca[i * 3 + 2] = 0.35 * blink;
      });
      this.ff.geometry.attributes.position.needsUpdate = true;
      this.ff.geometry.attributes.color.needsUpdate = true;
    }

    // peixe pulando
    this.jumpT -= dt;
    if (this.jumpT < 0 && !this.jumper) {
      this.jumpT = 5 + Math.random() * 9;
      const x = p.x + (Math.random() - 0.5) * 40;
      const z = riverCenter(x) + (Math.random() - 0.5) * RIVER.hw;
      const sp = FISH[Math.floor(Math.random() * 4)];
      const m = makeFishMesh(sp, 0.9);
      const dir = Math.random() < 0.5 ? 1 : -1;
      m.position.set(x, RIVER.waterY, z);
      this.scene.add(m);
      this.jumper = { m, t: 0, x, z, dir };
      this.fx.splash(m.position, 0.5);
      const dd = Math.hypot(x - p.x, z - p.z);
      if (dd < 18) this.audio.splash(0.4, 1 - dd / 18);
    }
    if (this.jumper) {
      const j = this.jumper;
      j.t += dt / 0.75;
      const k = Math.min(j.t, 1);
      j.m.position.set(j.x + j.dir * (k - 0.5) * 1.6, RIVER.waterY + Math.sin(k * Math.PI) * 1.1, j.z);
      j.m.rotation.y = j.dir * Math.PI / 2;
      j.m.rotation.x = (k - 0.5) * 2.2 * 1;
      if (k >= 1) {
        this.fx.splash(j.m.position, 0.5);
        this.scene.remove(j.m);
        this.jumper = null;
      }
    }

    // carros
    this.carT -= dt;
    if (this.carT < 0) {
      this.carT = 12 + Math.random() * 22;
      this.spawnCar();
    }
    this.headMat.emissiveIntensity = night * 2.5;
    this.tailMat.emissiveIntensity = night * 1.5;
    // freia pro Betão, pra Strada e pro carro da frente
    const blockers = this.strada ? [p, this.strada.pos] : [p];
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const c = this.cars[i];
      let blocked = false, honk = false;
      for (const b of blockers) {
        const ahead = (b.x - c.g.position.x) * c.dir;
        if (Math.abs(b.z - c.lane) < 1.7 && ahead > 0 && ahead < 10.5) {
          blocked = true;
          if (ahead < 9) honk = true;
        }
      }
      for (const o of this.cars) {
        if (o === c || o.lane !== c.lane) continue;
        const ahead = (o.g.position.x - c.g.position.x) * c.dir;
        if (ahead > 0 && ahead < 6.5) blocked = true;
      }
      c.v += ((blocked ? 0 : c.vmax) - c.v) * Math.min(1, dt * (blocked ? 5 : 1));
      if (honk && !c.honked) {
        c.honked = true;
        this.audio.honk();
      }
      if (!blocked) c.honked = false;
      c.g.position.x += c.dir * c.v * dt;
      for (const w of c.wheels) w.rotation.z -= (c.v * dt) / 0.34;
      const dx = c.g.position.x - p.x;
      const dist = Math.hypot(dx, c.lane - p.z);
      if (c.eng) c.eng.set(Math.max(0, 1 - dist / 40), dx / 25, c.v);
      if (Math.abs(c.g.position.x) > 80) {
        if (c.eng) c.eng.stop();
        this.scene.remove(c.g);
        this.cars.splice(i, 1);
      }
    }
  }
}
