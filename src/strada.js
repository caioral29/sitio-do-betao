import * as THREE from 'three';
import { Batcher } from './world.js';
import { isWater, onDeck, clamp, damp, CHAR_SCALE, HIP, GATE, FENCE_Z } from './config.js';
import { Cockpit, makeFiatBadge } from './cockpit.js';

// Fiat Strada branca (cabine simples, santo antônio preto, capota marítima)
// Referencial local: +z = frente, +x = lado esquerdo (motorista), y = chão

export const CAR_PARK = { x: 4.6, z: 13.4, yaw: 0.69 }; // estacionada atrás do portão, de frente pra saída
const WB = 2.6; // entre-eixos
const CIRC = [-1.3, 0, 1.3]; // círculos de colisão ao longo do carro
const CR = 0.86;
const ROAD = { z0: 18.4, z1: 26.4, x: 56 };
const WHEEL_R = 0.4;

const WHITE = '#f2f0ea', BLACK = '#2a2a2e', BLACK2 = '#1c1c1f', SILVER = '#c9c9cc', SEAT = '#3a3a41';

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
const plateTex = () => canvasTex(256, 96, (g, w, h) => {
  g.fillStyle = '#2b2b2b';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#f4f3ee';
  g.fillRect(6, 6, w - 12, h - 12);
  g.fillStyle = '#2a2a2e';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '900 58px "Nunito", sans-serif';
  g.fillText('Strada', w / 2, h / 2 + 3);
});
const scriptTex = () => canvasTex(256, 80, (g, w, h) => {
  g.fillStyle = '#2f2f33';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '900 56px "Nunito", sans-serif';
  g.fillText('Strada', w / 2, h / 2 + 2);
});

function buildModel() {
  const group = new THREE.Group();
  const body = new THREE.Group(); // tudo que balança na suspensão
  group.add(body);
  const B = new Batcher();
  const G = new Batcher(); // vidros

  // ---------------------------------------------------------------- carroceria
  B.box(1.2, 0.2, 3.9, BLACK2, 0, 0.52, 0); // assoalho/chassi
  B.box(1.8, 0.62, 1.3, WHITE, 0, 0.93, 1.35); // frente (capô)
  B.box(1.0, 0.05, 1.1, '#f8f7f3', 0, 1.265, 1.33); // vinco do capô
  B.box(1.8, 0.56, 1.42, WHITE, 0, 0.9, -1.33); // caçamba
  B.box(1.64, 0.07, 1.3, '#25252a', 0, 1.2, -1.36); // capota marítima
  B.box(1.8, 0.62, 0.1, WHITE, 0, 0.93, -0.6); // parede de trás da cabine
  B.box(1.56, 0.05, 1.3, '#2b2b2f', 0, 0.56, 0.05); // piso
  for (const sd of [-1, 1]) {
    B.box(0.12, 0.62, 1.38, WHITE, sd * 0.84, 0.93, 0.05); // porta
    B.box(0.16, 0.2, 1.3, BLACK, sd * 0.86, 0.55, 0.05); // soleira
    B.box(0.03, 0.04, 0.18, BLACK, sd * 0.905, 1.12, -0.25); // maçaneta
    B.box(0.02, 0.5, 0.02, '#d8d6cf', sd * 0.905, 0.96, 0.7); // vinco da porta
    // pára-lamas de plástico preto
    for (const wz of [1.3, -1.28]) {
      B.box(0.14, 0.12, 1.06, BLACK, sd * 0.87, 0.84, wz);
      B.box(0.14, 0.3, 0.12, BLACK, sd * 0.87, 0.68, wz + 0.5);
      B.box(0.14, 0.3, 0.12, BLACK, sd * 0.87, 0.68, wz - 0.5);
    }
    // colunas
    B.box(0.1, 0.78, 0.1, BLACK, sd * 0.8, 1.56, 0.57, -0.58, 0, 0); // coluna A
    B.box(0.1, 0.64, 0.08, BLACK, sd * 0.83, 1.56, -0.12); // coluna B
    B.box(0.12, 0.64, 0.12, WHITE, sd * 0.8, 1.56, -0.58); // coluna C
    // vidros laterais (degraus acompanhando o pára-brisa)
    G.box(0.04, 0.62, 0.92, '#fff', sd * 0.82, 1.56, -0.13);
    G.box(0.04, 0.32, 0.33, '#fff', sd * 0.82, 1.4, 0.5);
    G.box(0.04, 0.16, 0.17, '#fff', sd * 0.82, 1.64, 0.42);
    // bancos
    B.box(0.56, 0.12, 0.5, SEAT, sd * 0.4, 0.6, -0.12);
    B.box(0.56, 0.62, 0.12, SEAT, sd * 0.4, 0.98, -0.45, -0.12, 0, 0);
    B.box(0.34, 0.16, 0.1, SEAT, sd * 0.4, 1.38, -0.5);
  }
  B.box(1.66, 0.08, 0.12, BLACK, 0, 1.26, 0.78); // base do pára-brisa
  B.box(1.66, 0.08, 0.1, BLACK, 0, 1.86, 0.37); // topo do pára-brisa
  G.box(1.52, 0.76, 0.04, '#fff', 0, 1.56, 0.57, -0.58, 0, 0); // pára-brisa
  G.box(1.48, 0.58, 0.04, '#fff', 0, 1.55, -0.6); // vidro traseiro
  B.box(1.66, 0.09, 1.0, WHITE, 0, 1.92, -0.12); // teto

  // rack de teto + antena
  for (const sd of [-1, 1]) {
    B.box(0.08, 0.06, 0.95, BLACK, sd * 0.62, 2.0, -0.12);
    B.box(0.08, 0.06, 0.08, BLACK, sd * 0.62, 1.96, -0.55);
    B.box(0.14, 0.16, 0.14, BLACK, sd * 0.62, 2.03, 0.33);
  }
  B.box(0.08, 0.05, 0.12, BLACK, 0, 1.98, 0.25);
  B.box(0.035, 0.5, 0.035, BLACK2, 0, 2.22, 0.25);

  // santo antônio com grade no vidro de trás
  for (const sd of [-1, 1]) {
    B.box(0.12, 0.78, 0.12, BLACK, sd * 0.8, 1.6, -0.76);
    B.box(0.2, 0.22, 0.22, BLACK2, sd * 0.8, 2.0, -0.76);
    B.box(0.1, 1.01, 0.1, BLACK, sd * 0.8, 1.585, -1.15, 0.76, 0, 0);
    B.box(0.05, 0.66, 0.05, BLACK, sd * 0.28, 1.56, -0.71);
  }
  B.box(1.72, 0.14, 0.16, BLACK, 0, 2.0, -0.76);
  B.box(1.5, 0.05, 0.05, BLACK, 0, 1.55, -0.71);

  // frente
  B.box(1.88, 0.34, 0.24, BLACK, 0, 0.6, 1.98); // pára-choque
  B.box(0.9, 0.12, 0.04, BLACK2, 0, 0.5, 2.11); // grade de baixo
  B.box(1.0, 0.07, 0.2, SILVER, 0, 0.42, 2.02); // protetor de cárter
  B.box(0.86, 0.24, 0.05, BLACK2, 0, 0.98, 2.02); // grade
  for (const yy of [0.93, 1.03]) B.box(0.82, 0.025, 0.02, '#3d3d43', 0, yy, 2.05);
  for (const sd of [-1, 1]) B.box(0.22, 0.18, 0.04, BLACK2, sd * 0.62, 0.6, 2.105); // moldura do farol de neblina

  // traseira
  B.box(1.88, 0.3, 0.24, BLACK, 0, 0.58, -1.98); // pára-choque
  for (const sd of [-1, 1]) {
    B.box(0.5, 0.08, 0.3, BLACK2, sd * 0.62, 0.42, -2.0); // estribo
    B.box(0.16, 0.08, 0.03, '#c3241c', sd * 0.62, 0.64, -2.105); // olho de gato
  }
  B.box(0.26, 0.05, 0.03, BLACK, 0, 1.1, -2.055); // puxador da tampa

  const paint = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.05 });
  const shell = B.build(paint);
  body.add(shell);
  const glassMat = new THREE.MeshStandardMaterial({
    color: '#36556f', roughness: 0.06, metalness: 0.3, transparent: true, opacity: 0.45, depthWrite: false,
  });
  const glass = G.build(glassMat, { cast: false, receive: false });
  body.add(glass);

  // ---------------------------------------------------------------- luzes
  const mats = {
    head: new THREE.MeshStandardMaterial({ color: '#ffbe4d', emissive: '#ffa22e', emissiveIntensity: 0.35, roughness: 0.2 }),
    drl: new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#fff6dc', emissiveIntensity: 0.4, roughness: 0.2 }),
    tail: new THREE.MeshStandardMaterial({ color: '#c3241c', emissive: '#ff2414', emissiveIntensity: 0.2, roughness: 0.25 }),
    rev: new THREE.MeshStandardMaterial({ color: '#f4f4f4', emissive: '#ffffff', emissiveIntensity: 0, roughness: 0.25 }),
  };
  const add = (w, h, d, mat, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    body.add(m);
    return m;
  };
  for (const sd of [-1, 1]) {
    add(0.3, 0.2, 0.05, mats.head, sd * 0.66, 1.0, 2.02); // farol (âmbar por fora)
    add(0.14, 0.15, 0.06, mats.drl, sd * 0.46, 1.0, 2.025); // parte branca por dentro
    add(0.14, 0.11, 0.04, mats.drl, sd * 0.62, 0.6, 2.12); // neblina
    add(0.26, 0.36, 0.06, mats.tail, sd * 0.78, 0.98, -2.06); // lanterna
    add(0.06, 0.36, 0.22, mats.tail, sd * 0.905, 0.98, -1.94); // lanterna (lateral)
    add(0.24, 0.07, 0.02, mats.rev, sd * 0.78, 0.98, -2.095); // luz de ré
  }
  add(0.36, 0.06, 0.04, mats.tail, 0, 2.0, -0.86); // brake light no santo antônio

  // decalques: placas, emblemas e escrita "Strada"
  const decal = (tex, w, h, x, y, z, ry = 0) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.4 }));
    m.position.set(x, y, z);
    m.rotation.y = ry;
    body.add(m);
  };
  const plate = plateTex(), badge = makeFiatBadge(128);
  decal(plate, 0.6, 0.2, 0, 0.66, 2.112);
  decal(plate, 0.6, 0.2, 0, 0.6, -2.112, Math.PI);
  decal(badge, 0.17, 0.17, 0, 0.98, 2.047);
  decal(badge, 0.19, 0.19, -0.12, 0.95, -2.042, Math.PI);
  decal(scriptTex(), 0.42, 0.13, 0.36, 0.93, -2.042, Math.PI);

  // farol de verdade (só à noite)
  const spot = new THREE.SpotLight('#fff0cc', 0, 30, 0.55, 0.6, 1.2);
  spot.position.set(0, 1.0, 2.1);
  spot.target.position.set(0, 0, 12);
  body.add(spot, spot.target);

  // banco do motorista (o volante, o painel e os retrovisores ficam em cockpit.js)
  const seat = new THREE.Object3D();
  seat.position.set(0.42, 0.66 - HIP * CHAR_SCALE + 0.17, -0.1);
  body.add(seat);

  // ---------------------------------------------------------------- rodas
  const tireGeo = new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.3, 12);
  tireGeo.rotateZ(Math.PI / 2);
  const tireMat = new THREE.MeshStandardMaterial({ color: '#1d1d20', roughness: 0.9, flatShading: true });
  const hubMat = new THREE.MeshStandardMaterial({ color: '#45454b', roughness: 0.5, metalness: 0.3 });
  const hubGeo = new THREE.BoxGeometry(0.31, 0.34, 0.34);
  const wheels = [];
  for (const wz of [1.3, -1.28]) {
    for (const sd of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(sd * 0.76, WHEEL_R, wz);
      const spin = new THREE.Group();
      const tire = new THREE.Mesh(tireGeo, tireMat);
      tire.castShadow = true;
      spin.add(tire, new THREE.Mesh(hubGeo, hubMat));
      pivot.add(spin);
      group.add(pivot);
      wheels.push({ pivot, spin, front: wz > 0 });
    }
  }

  group.traverse((o) => {
    if (o.isMesh && o !== glass) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return { group, body, wheels, seat, spot, mats, glassMat };
}

export class Strada {
  constructor(scene, world, audio, fx, saved) {
    this.world = world;
    this.audio = audio;
    this.fx = fx;
    const m = buildModel();
    Object.assign(this, m);
    scene.add(this.group);

    const ok = saved && Math.abs(saved.x) < 27 && saved.z > -15 && saved.z < 17 && Number.isFinite(saved.yaw);
    const p = ok ? saved : CAR_PARK;
    this.pos = new THREE.Vector3(p.x, 0, p.z);
    this.yaw = p.yaw;
    this.speed = 0;
    this.steer = 0;
    this.accel = 0;
    this.driving = false;
    this.braking = false;
    this.handbrake = false;
    this.eng = null;
    this.traffic = [];
    this.onCrash = null;
    this.hitCar = null;
    this.t = 0;
    this.gear = 'N';
    this.rpm = 0;
    this.throttle = 0;
    this.cockpit = new Cockpit(this); // painel, volante, retrovisores e visão de 1ª pessoa

    // o carro também é obstáculo pro Betão a pé
    this.circles = CIRC.map(() => ({ x: 0, z: 0, r: 0.9, car: true }));
    world.colliders.circles.push(...this.circles);
    this.syncCircles();
    this.place(0);
  }

  get onRoad() {
    return this.pos.z > ROAD.z0;
  }

  // local (lx, lz) -> mundo
  toWorld(lx, lz) {
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    return { x: this.pos.x + lx * c + lz * s, z: this.pos.z - lx * s + lz * c };
  }

  syncCircles() {
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    CIRC.forEach((o, i) => {
      this.circles[i].x = this.pos.x + s * o;
      this.circles[i].z = this.pos.z + c * o;
    });
  }

  blockedAt(cx, cz) {
    const r = CR;
    if (cz > ROAD.z0 - 0.2) {
      if (Math.abs(cx) > ROAD.x || cz > ROAD.z1) return true;
    } else if (cx < -28.5 + r || cx > 28.5 - r || cz < -16.8 + r) return true;
    if (isWater(cx, cz) || isWater(cx + r, cz) || isWater(cx - r, cz) || isWater(cx, cz + r) || isWater(cx, cz - r)) return true;
    if (onDeck(cx, cz, -r)) return true;
    for (const b of this.world.colliders.boxes) {
      if (b.active && cx > b.x0 - r && cx < b.x1 + r && cz > b.z0 - r && cz < b.z1 + r) return true;
    }
    for (const b of this.world.gate.leafBoxes) {
      if (b.active && cx > b.x0 - r && cx < b.x1 + r && cz > b.z0 - r && cz < b.z1 + r) return true;
    }
    for (const c of this.world.colliders.circles) {
      if (c.car) continue;
      const rr = c.r + r * 0.9;
      if ((cx - c.x) ** 2 + (cz - c.z) ** 2 < rr * rr) return true;
    }
    for (const t of this.traffic) {
      if (Math.abs(cx - t.g.position.x) < 1.6 + r * 0.8 && Math.abs(cz - t.lane) < 0.75 + r * 0.8) {
        this.hitCar = t;
        return true;
      }
    }
    return false;
  }

  // quantos círculos do carro estão encostando em algo
  overlap(x, z, yaw) {
    const s = Math.sin(yaw), c = Math.cos(yaw);
    let n = 0;
    for (const o of CIRC) if (this.blockedAt(x + s * o, z + c * o)) n++;
    return n;
  }

  enter() {
    this.driving = true;
    this.audio.door();
    setTimeout(() => {
      if (!this.driving) return;
      this.audio.engineStart();
      this.eng = this.audio.engine();
    }, 350);
  }
  exit() {
    this.driving = false;
    this.handbrake = false;
    if (this.eng) this.eng.stop();
    this.eng = null;
    this.audio.door();
  }

  // ponto livre para o Betão descer (porta do motorista primeiro)
  exitSpot(blocked) {
    const cands = [[1.5, 0.1], [-1.5, 0.1], [1.5, -1.2], [-1.5, -1.2], [1.5, 1.3], [-1.5, 1.3], [0, -2.9], [0, 2.9]];
    for (const [lx, lz] of cands) {
      const p = this.toWorld(lx, lz);
      if (blocked(p.x, p.z)) continue;
      if (this.world.colliders.circles.some((c) => Math.hypot(p.x - c.x, p.z - c.z) < c.r + 0.36)) continue;
      return p;
    }
    return null;
  }

  update(dt, input, night) {
    this.t += dt;
    const prev = this.speed;
    let s = this.speed;
    if (this.driving) {
      const ax = input.axis();
      const thr = ax.y;
      this.throttle = thr;
      const hb = input.down('Space');
      if (hb && !this.handbrake && Math.abs(s) > 6) this.audio.skid();
      this.handbrake = hb;
      const vmax = this.onRoad ? 19 : 10;
      if (hb) s = toward(s, 0, 20 * dt);
      else if (thr > 0.1) {
        if (s < -0.3) s = toward(s, 0, 18 * dt);
        else s += thr * 9 * Math.max(0.12, 1 - s / vmax) * dt;
      } else if (thr < -0.1) {
        if (s > 0.3) s = toward(s, 0, 16 * dt);
        else s = Math.max(-5, s + thr * 6 * dt);
      } else s = toward(s, 0, (2.2 + Math.abs(s) * 0.2) * dt);
      if (s > vmax) s = toward(s, vmax, 6 * dt);
      this.braking = hb || (thr > 0.1 && s < -0.3) || (thr < -0.1 && s > 0.3);
      const maxSt = 0.6 * (1 - 0.45 * Math.min(1, Math.abs(s) / 19));
      this.steer = damp(this.steer, ax.x * maxSt, 7, dt);
    } else {
      s = toward(s, 0, 25 * dt);
      this.braking = false;
      this.throttle = 0;
    }
    this.speed = s;

    // movimento (bicicleta) + colisão deslizando
    if (Math.abs(s) > 0.01) {
      const ny = this.yaw - (s * Math.tan(this.steer) / WB) * dt;
      const dx = Math.sin(ny) * s * dt, dz = Math.cos(ny) * s * dt;
      const { x, z } = this.pos;
      this.hitCar = null;
      // se já estiver encostado em algo (ex.: um carro bateu nele), aceita qualquer
      // movimento que não piore a situação — mas nunca deixa atravessar de vez
      const base = this.overlap(x, z, this.yaw);
      const hits = (hx, hz, hy) => this.overlap(hx, hz, hy) > base;
      if (!hits(x + dx, z + dz, ny)) {
        this.pos.x += dx;
        this.pos.z += dz;
        this.yaw = ny;
      } else if (!hits(x + Math.sin(this.yaw) * s * dt, z + Math.cos(this.yaw) * s * dt, this.yaw)) {
        // a curva bateria (ex.: no meio do portão): segue reto por enquanto
        this.pos.x += Math.sin(this.yaw) * s * dt;
        this.pos.z += Math.cos(this.yaw) * s * dt;
      } else if (!hits(x + dx, z, ny)) {
        this.pos.x += dx;
        this.yaw = ny;
        this.speed *= 1 - 2 * dt;
      } else if (!hits(x, z + dz, ny)) {
        this.pos.z += dz;
        this.yaw = ny;
        this.speed *= 1 - 2 * dt;
      } else {
        const v = Math.abs(s);
        if (v > 2.5) {
          this.audio.thud(Math.min(1.6, v / 7));
          this.fx.dust(this.toWorld(0, Math.sign(s) * 2.1));
          if (this.onCrash) this.onCrash(v, this.hitCar);
        }
        this.speed = -s * 0.25;
      }
      // ajudinha pra passar reto pelo portão
      if (this.driving && Math.abs(this.pos.z - FENCE_Z) < 2.6 && Math.abs(this.pos.x - (GATE.x0 + GATE.x1) / 2) < 1.6) {
        const nx = damp(this.pos.x, (GATE.x0 + GATE.x1) / 2, 1.5 * Math.min(1, Math.abs(s) / 4), dt);
        if (this.overlap(nx, this.pos.z, this.yaw) === 0) this.pos.x = nx;
      }
    }
    this.pos.y = this.onRoad ? -0.03 : 0;
    this.accel = damp(this.accel, (this.speed - prev) / Math.max(dt, 1e-4), 6, dt);
    this.syncCircles();
    this.place(dt);

    // luzes e som
    const on = this.driving;
    this.mats.head.emissiveIntensity = on ? 0.6 + night * 2.6 : 0.35;
    this.mats.drl.emissiveIntensity = on ? 0.9 + night * 1.5 : 0.2;
    this.mats.tail.emissiveIntensity = 0.15 + (on ? night * 1.1 : 0) + (this.braking ? 2.4 : 0);
    this.mats.rev.emissiveIntensity = on && this.speed < -0.2 ? 2.2 : 0;
    this.spot.intensity = on ? night * 45 : 0;
    this.updateGearbox(dt);
    if (this.eng) this.eng.set(0.6 + Math.max(0, this.throttle) * 0.3, 0, (this.rpm - 600) / 90);
    this.cockpit.update(dt, night);
  }

  // câmbio de 5 marchas simulado (ponteiro do conta-giros e ronco do motor)
  updateGearbox(dt) {
    const kmh = Math.abs(this.speed) * 3.6;
    const UP = [0, 16, 30, 44, 57]; // troca pra cima ao passar disso (km/h)
    let target;
    if (!this.driving) {
      this.gear = 'N';
      target = 0;
    } else if (this.speed < -0.15) {
      this.gear = 'R';
      target = 1000 + kmh * 170;
    } else if (kmh < 1 && this.throttle <= 0.1) {
      this.gear = 'N';
      target = 850;
    } else {
      let g = typeof this.gear === 'number' ? this.gear : 1;
      while (g < 5 && kmh > UP[g]) g++;
      while (g > 1 && kmh < UP[g - 1] - 4) g--;
      this.gear = g;
      const lo = g === 1 ? 0 : UP[g - 1] - 4, hi = g === 5 ? 80 : UP[g];
      const f = clamp((kmh - lo) / (hi - lo), 0, 1);
      target = (g === 1 ? 950 : 1900) + f * (g === 5 ? 2600 : 3500) + Math.max(0, this.throttle) * 250;
    }
    this.rpm = damp(this.rpm, target, this.gear === 'N' && this.throttle > 0.1 ? 4 : 9, dt);
  }

  place(dt) {
    const g = this.group;
    g.position.copy(this.pos);
    g.rotation.y = this.yaw;
    // suspensão: inclina nas curvas e nas freadas, vibra com o motor ligado
    const roll = clamp(this.speed * Math.tan(this.steer) * 0.012, -0.07, 0.07);
    const pitch = clamp(-this.accel * 0.006, -0.05, 0.05);
    const b = this.body;
    if (dt > 0) {
      b.rotation.z = damp(b.rotation.z, roll, 6, dt);
      b.rotation.x = damp(b.rotation.x, pitch, 6, dt);
    }
    b.position.y = this.driving ? Math.sin(this.t * 47) * 0.006 : 0;
    for (const w of this.wheels) {
      w.spin.rotation.x += (this.speed * dt) / WHEEL_R;
      if (w.front) w.pivot.rotation.y = -this.steer;
    }
    this.steering.rotation.z = this.steer * 2.6;
  }
}

function toward(v, target, step) {
  if (v < target) return Math.min(target, v + step);
  return Math.max(target, v - step);
}
