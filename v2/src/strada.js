import * as THREE from 'three';
import { Batcher } from './world.js';
import { isWater, onDeck, clamp, damp, CHAR_SCALE, HIP, SIT_LIFT, GATE, FENCE_Z } from './config.js';
import { Cockpit, makeFiatBadge } from './cockpit.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

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

// carroceria extrudada a partir do perfil lateral (z = frente, y = cima), com bordas arredondadas
function sideShape(pts) {
  const s = new THREE.Shape();
  pts.forEach((p, i) => {
    if (p.arc) s.absarc(p.arc[0], p.arc[1], p.arc[2], p.arc[3], p.arc[4], p.arc[5] ?? true);
    else if (p.q) s.quadraticCurveTo(p.q[0], p.q[1], p.q[2], p.q[3]);
    else if (i === 0) s.moveTo(p[0], p[1]);
    else s.lineTo(p[0], p[1]);
  });
  s.closePath();
  return s;
}
// extrusão "de lado": o perfil (z, y) é extrudado ao longo de x, centrado
function extrudeSide(shape, width, bevel = 0.05, curveSegments = 18) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: width - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 4, curveSegments,
  });
  g.translate(0, 0, -(width - bevel * 2) / 2);
  g.rotateY(-Math.PI / 2); // (x do shape = z do carro) ... depois: shape x -> z, profundidade -> x
  g.computeVertexNormals();
  return g;
}

function buildModel() {
  const group = new THREE.Group();
  const body = new THREE.Group(); // tudo que balança na suspensão
  group.add(body);
  const paint = new THREE.MeshPhysicalMaterial({ color: WHITE, roughness: 0.32, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.08 });
  const plastic = new THREE.MeshStandardMaterial({ color: '#232327', roughness: 0.62 });
  const plasticG = new THREE.MeshStandardMaterial({ color: '#1a1a1d', roughness: 0.45 });
  const chrome = new THREE.MeshStandardMaterial({ color: '#e4e6ea', roughness: 0.16, metalness: 1 });
  const silver = new THREE.MeshStandardMaterial({ color: '#b9bcc2', roughness: 0.3, metalness: 0.85 });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: '#2c4253', roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.55, depthWrite: false, envMapIntensity: 1.6,
  });
  const B = new Batcher(); // peças pequenas de cor única
  const mesh = (geo, mat, x = 0, y = 0, z = 0, parent = body) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  const rb = (w, h, d, r) => new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3));

  // ---------------------------------------------------------------- carroceria
  // frente (capô + paralamas) com recorte da roda
  const front = sideShape([
    [0.62, 0.48], [0.8, 0.48], { arc: [1.3, 0.42, 0.5, Math.PI, 0, true] }, [1.86, 0.48],
    [1.93, 0.6], { q: [1.99, 0.82, 1.96, 1.0] }, { q: [1.92, 1.13, 1.76, 1.16] }, [0.84, 1.21], [0.62, 1.21],
  ]);
  mesh(extrudeSide(front, 1.8, 0.07), paint);
  // caçamba
  const bed = sideShape([
    [-0.6, 0.48], [-0.78, 0.48], { arc: [-1.28, 0.42, 0.5, 0, Math.PI, false] }, [-1.82, 0.48], [-1.95, 0.5],
    { q: [-2.0, 0.8, -1.98, 1.06] }, { q: [-1.97, 1.13, -1.9, 1.13] }, [-0.6, 1.13],
  ]);
  mesh(extrudeSide(bed, 1.8, 0.07), paint);
  // portas (laterais da cabine) e parede de trás
  const door = sideShape([[-0.6, 0.48], [0.62, 0.48], [0.62, 1.25], [-0.6, 1.25]]);
  for (const sd of [-1, 1]) {
    const g = extrudeSide(door, 0.1, 0.03, 4);
    mesh(g, paint, sd * 0.85, 0, 0);
    // vinco da porta e maçaneta
    B.box(0.012, 0.6, 0.012, '#d9d7d0', sd * 0.903, 0.92, 0.6);
    B.box(0.012, 0.6, 0.012, '#d9d7d0', sd * 0.903, 0.92, -0.58);
    mesh(rb(0.03, 0.035, 0.17, 0.012), plasticG, sd * 0.905, 1.12, -0.25);
    // soleira preta
    mesh(rb(0.09, 0.12, 1.26, 0.03), plastic, sd * 0.86, 0.5, 0.01);
  }
  mesh(rb(1.72, 0.8, 0.09, 0.03), paint, 0, 0.88, -0.6);
  mesh(rb(1.56, 0.05, 1.3, 0.02), plastic, 0, 0.56, 0.05); // piso
  B.box(1.2, 0.2, 3.9, '#141416', 0, 0.42, 0); // chassi

  // ---------------------------------------------------------------- cabine (colunas, teto, vidros)
  const tube = (a, b, r, mat) => {
    const c = new THREE.LineCurve3(a, b);
    return mesh(new THREE.TubeGeometry(c, 1, r, 10, false), mat);
  };
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  for (const sd of [-1, 1]) {
    // coluna A acompanha o pára-brisa
    mesh(rb(0.09, 0.82, 0.1, 0.035), plasticG, sd * 0.8, 1.565, 0.565).rotation.x = -0.58;
    mesh(rb(0.08, 0.66, 0.08, 0.03), plasticG, sd * 0.83, 1.58, -0.12); // B
    mesh(rb(0.12, 0.68, 0.14, 0.05), paint, sd * 0.79, 1.58, -0.58); // C (cor do carro)
    // vidros laterais
    const sw = new THREE.Shape();
    sw.moveTo(-0.52, 1.28); sw.lineTo(0.3, 1.28); sw.lineTo(0.58, 1.3); sw.lineTo(0.27, 1.87); sw.lineTo(-0.52, 1.87);
    sw.closePath();
    const sg = new THREE.ShapeGeometry(sw);
    sg.rotateY(-Math.PI / 2);
    const gm = new THREE.Mesh(sg, glassMat);
    gm.position.x = sd * 0.83;
    body.add(gm);
    // borracha da janela
    tube(V3(sd * 0.835, 1.28, -0.54), V3(sd * 0.835, 1.28, 0.62), 0.018, plasticG);
  }
  // teto
  mesh(rb(1.68, 0.1, 1.08, 0.05), paint, 0, 1.92, -0.14);
  mesh(rb(1.66, 0.08, 0.12, 0.04), plasticG, 0, 1.86, 0.36); // topo do pára-brisa
  mesh(rb(1.66, 0.08, 0.12, 0.04), plasticG, 0, 1.27, 0.78); // base do pára-brisa
  const ws = new THREE.Mesh(new THREE.PlaneGeometry(1.54, 0.78), glassMat);
  ws.position.set(0, 1.565, 0.57);
  ws.rotation.set(-0.58 - Math.PI / 2 + Math.PI / 2, 0, 0);
  ws.rotation.x = -0.58;
  body.add(ws);
  const rw = new THREE.Mesh(new THREE.PlaneGeometry(1.48, 0.58), glassMat);
  rw.position.set(0, 1.56, -0.61);
  rw.rotation.y = Math.PI;
  body.add(rw);
  // rack de teto + antena
  for (const sd of [-1, 1]) {
    mesh(rb(0.06, 0.05, 0.98, 0.02), plasticG, sd * 0.6, 2.0, -0.14);
    for (const z of [-0.56, 0.3]) mesh(rb(0.09, 0.07, 0.1, 0.03), plasticG, sd * 0.6, 1.98, z);
  }
  tube(V3(0, 1.97, 0.22), V3(0, 2.45, 0.1), 0.008, plasticG);

  // santo antônio (tubo preto) com grade no vidro de trás
  for (const sd of [-1, 1]) {
    const c = new THREE.CatmullRomCurve3([V3(sd * 0.8, 1.18, -0.75), V3(sd * 0.8, 1.88, -0.76), V3(sd * 0.76, 2.02, -0.8)]);
    mesh(new THREE.TubeGeometry(c, 12, 0.05, 12, false), plasticG);
    tube(V3(sd * 0.8, 1.92, -0.78), V3(sd * 0.8, 1.2, -1.32), 0.04, plasticG);
    tube(V3(sd * 0.3, 1.3, -0.68), V3(sd * 0.3, 1.86, -0.68), 0.018, plasticG);
  }
  tube(V3(-0.78, 2.02, -0.8), V3(0.78, 2.02, -0.8), 0.055, plasticG);
  tube(V3(-0.75, 1.56, -0.68), V3(0.75, 1.56, -0.68), 0.016, plasticG);
  // capota marítima
  mesh(rb(1.7, 0.06, 1.38, 0.03), new THREE.MeshStandardMaterial({ color: '#1e1e21', roughness: 0.82 }), 0, 1.235, -1.33);

  // ---------------------------------------------------------------- pára-lamas de plástico preto
  for (const sd of [-1, 1]) {
    for (const [wz, front] of [[1.3, true], [-1.28, false]]) {
      const arch = new THREE.TorusGeometry(0.53, 0.06, 8, 26, Math.PI);
      arch.scale(1, 1, 1.4);
      const m = mesh(arch, plastic, sd * 0.88, 0.42, wz);
      m.rotation.y = Math.PI / 2;
      // ponta dos pára-lamas
      for (const e of [-1, 1]) mesh(rb(0.1, 0.12, 0.12, 0.04), plastic, sd * 0.88, 0.48, wz + e * 0.53);
    }
  }

  // ---------------------------------------------------------------- frente
  mesh(rb(1.9, 0.36, 0.26, 0.1), plastic, 0, 0.62, 2.0); // pára-choque
  mesh(rb(0.95, 0.14, 0.06, 0.04), plasticG, 0, 0.52, 2.12); // grade de baixo
  mesh(rb(1.0, 0.07, 0.22, 0.03), silver, 0, 0.44, 2.04); // protetor de cárter
  mesh(rb(0.92, 0.26, 0.06, 0.05), plasticG, 0, 0.99, 2.03); // grade
  for (const yy of [0.94, 1.04]) mesh(rb(0.86, 0.022, 0.02, 0.01), chrome, 0, yy, 2.065);
  for (const sd of [-1, 1]) mesh(rb(0.24, 0.2, 0.05, 0.05), plasticG, sd * 0.62, 0.62, 2.115); // moldura neblina
  mesh(rb(0.36, 0.11, 0.03, 0.02), new THREE.MeshStandardMaterial({ color: '#2a2a2e', roughness: 0.5 }), 0, 0.64, 2.14); // placa (moldura)

  // ---------------------------------------------------------------- traseira
  mesh(rb(1.9, 0.3, 0.26, 0.1), plastic, 0, 0.6, -1.98); // pára-choque
  for (const sd of [-1, 1]) {
    mesh(rb(0.5, 0.07, 0.3, 0.03), plasticG, sd * 0.62, 0.44, -2.0); // estribo
    mesh(rb(0.16, 0.08, 0.03, 0.02), new THREE.MeshStandardMaterial({ color: '#b3231c', roughness: 0.3 }), sd * 0.62, 0.66, -2.11);
  }
  mesh(rb(0.28, 0.05, 0.03, 0.02), plasticG, 0, 1.1, -2.075); // puxador da tampa

  const small = B.build(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 }));
  body.add(small);

  // ---------------------------------------------------------------- luzes
  const mats = {
    head: new THREE.MeshPhysicalMaterial({ color: '#ffd68a', emissive: '#ffb340', emissiveIntensity: 0.35, roughness: 0.05, clearcoat: 1 }),
    drl: new THREE.MeshPhysicalMaterial({ color: '#ffffff', emissive: '#fff6dc', emissiveIntensity: 0.4, roughness: 0.05, clearcoat: 1 }),
    tail: new THREE.MeshPhysicalMaterial({ color: '#c3241c', emissive: '#ff2414', emissiveIntensity: 0.2, roughness: 0.1, clearcoat: 1 }),
    rev: new THREE.MeshPhysicalMaterial({ color: '#f4f4f4', emissive: '#ffffff', emissiveIntensity: 0, roughness: 0.1, clearcoat: 1 }),
  };
  for (const sd of [-1, 1]) {
    mesh(rb(0.34, 0.22, 0.08, 0.06), chrome, sd * 0.65, 1.0, 2.0); // carcaça do farol
    mesh(rb(0.3, 0.18, 0.06, 0.05), mats.head, sd * 0.67, 1.0, 2.03);
    mesh(rb(0.12, 0.13, 0.06, 0.05), mats.drl, sd * 0.5, 1.0, 2.04);
    const fog = mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.04, 18), mats.drl, sd * 0.62, 0.62, 2.13);
    fog.rotation.x = Math.PI / 2;
    mesh(rb(0.24, 0.38, 0.08, 0.05), mats.tail, sd * 0.79, 0.95, -2.04); // lanterna
    mesh(rb(0.06, 0.38, 0.22, 0.03), mats.tail, sd * 0.9, 0.95, -1.93);
    mesh(rb(0.2, 0.07, 0.03, 0.02), mats.rev, sd * 0.79, 0.96, -2.083);
    // retrovisor (carcaça branca)
    mesh(rb(0.1, 0.05, 0.08, 0.02), plasticG, sd * 0.93, 1.3, 0.64);
    mesh(rb(0.24, 0.16, 0.1, 0.05), paint, sd * 1.05, 1.34, 0.645);
  }
  mesh(rb(0.36, 0.06, 0.05, 0.02), mats.tail, 0, 2.0, -0.86); // brake light no santo antônio

  // decalques: placas, emblemas e escrita "Strada"
  const decal = (tex, w, h, x, y, z, ry = 0) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.35 }));
    m.position.set(x, y, z);
    m.rotation.y = ry;
    body.add(m);
  };
  const plate = plateTex(), badge = makeFiatBadge(128);
  decal(plate, 0.34, 0.1, 0, 0.64, 2.158);
  decal(plate, 0.6, 0.2, 0, 0.6, -2.116, Math.PI);
  decal(badge, 0.15, 0.15, 0, 0.99, 2.072);
  decal(badge, 0.19, 0.19, -0.12, 0.95, -2.056, Math.PI);
  decal(scriptTex(), 0.42, 0.13, 0.36, 0.93, -2.056, Math.PI);

  // farol de verdade (só à noite)
  const spot = new THREE.SpotLight('#fff0cc', 0, 30, 0.55, 0.6, 1.2);
  spot.position.set(0, 1.0, 2.1);
  spot.target.position.set(0, 0, 12);
  body.add(spot, spot.target);

  // banco do motorista (o volante, o painel e os retrovisores ficam em cockpit.js)
  const seat = new THREE.Object3D();
  seat.position.set(0.42, 0.66 - HIP * CHAR_SCALE + SIT_LIFT, -0.1);
  body.add(seat);
  // bancos
  const seatMat = new THREE.MeshStandardMaterial({ color: SEAT, roughness: 0.85 });
  for (const sd of [-1, 1]) {
    mesh(rb(0.56, 0.14, 0.52, 0.06), seatMat, sd * 0.4, 0.6, -0.12);
    mesh(rb(0.54, 0.64, 0.14, 0.06), seatMat, sd * 0.4, 0.98, -0.45).rotation.x = -0.12;
    mesh(rb(0.3, 0.18, 0.12, 0.05), seatMat, sd * 0.4, 1.4, -0.5);
  }

  // ---------------------------------------------------------------- rodas (pneu arredondado + roda de liga)
  const tireProf = [];
  for (let i = 0; i <= 16; i++) {
    const a = -Math.PI / 2 + (i / 16) * Math.PI;
    tireProf.push(new THREE.Vector2(WHEEL_R - 0.11 + Math.cos(a) * 0.11, Math.sin(a) * 0.13));
  }
  const tireGeo = new THREE.LatheGeometry([new THREE.Vector2(0.24, -0.13), ...tireProf, new THREE.Vector2(0.24, 0.13)].reverse(), 36);
  tireGeo.rotateZ(Math.PI / 2);
  const tireMat = new THREE.MeshStandardMaterial({ color: '#1b1b1d', roughness: 0.88 });
  const rimMat = new THREE.MeshStandardMaterial({ color: '#c9ccd2', roughness: 0.25, metalness: 0.9 });
  const rimGeo = new THREE.CylinderGeometry(0.25, 0.25, 0.2, 28);
  rimGeo.rotateZ(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(0.06, 0.07, 0.24, 16);
  hubGeo.rotateZ(Math.PI / 2);
  const spokeGeo = new RoundedBoxGeometry(0.05, 0.2, 0.05, 2, 0.02);
  const wheels = [];
  for (const wz of [1.3, -1.28]) {
    for (const sd of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(sd * 0.76, WHEEL_R, wz);
      const spin = new THREE.Group();
      const tire = new THREE.Mesh(tireGeo, tireMat);
      tire.castShadow = true;
      spin.add(tire);
      const rim = new THREE.Mesh(rimGeo, new THREE.MeshStandardMaterial({ color: '#2a2b2f', roughness: 0.5 }));
      spin.add(rim);
      for (let k = 0; k < 6; k++) {
        const sp = new THREE.Mesh(spokeGeo, rimMat);
        sp.position.set(sd * 0.105, Math.cos((k / 6) * Math.PI * 2) * 0.13, Math.sin((k / 6) * Math.PI * 2) * 0.13);
        sp.rotation.x = -(k / 6) * Math.PI * 2;
        spin.add(sp);
      }
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.235, 0.022, 8, 30), rimMat);
      ring.rotation.y = Math.PI / 2;
      ring.position.x = sd * 0.1;
      spin.add(ring);
      spin.add(new THREE.Mesh(hubGeo, rimMat));
      pivot.add(spin);
      group.add(pivot);
      wheels.push({ pivot, spin, front: wz > 0 });
    }
  }

  group.traverse((o) => {
    if (o.isMesh && o.material !== glassMat) {
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
