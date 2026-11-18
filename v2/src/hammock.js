import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from './config.js';
import { palmOffset } from './flora.js';
import { canvasTex, patchMaterial, taperTube } from './kit.js';

// Rede de dormir amarrada entre dois coqueiros.
// Referencial local do grupo: origem no meio da linha das amarrações,
// +Z aponta do coqueiro A para o B, +Y para cima. O balanço gira em torno de Z.

const TIE_Y = 1.75; // altura das amarrações no tronco
const SAG = 1.0; // quanto o fundo do pano fica abaixo das amarrações
const END_DROP = 0.5; // altura das pontas do pano (abaixo das amarrações)
const ROPE_LEN = 0.95; // comprimento dos punhos (cordas) até o pano

function trunkAt(palm, y) {
  const o = palmOffset(palm, y);
  return new THREE.Vector3(palm.x + o.x, y, palm.z + o.z);
}

// tecido de rede listrado (algodão cru com listras coloridas)
function clothTex() {
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#f3ead8';
    g.fillRect(0, 0, w, h);
    const stripes = [['#d8452f', 22], ['#f2b632', 14], ['#2f8f6a', 18], ['#f2b632', 10], ['#2b5fa8', 16]];
    let x = 30;
    while (x < w) {
      for (const [c, sw] of stripes) {
        g.fillStyle = c;
        g.fillRect(x, 0, sw, h);
        x += sw + 18;
      }
      x += 60;
    }
    // trama do tecido
    g.globalAlpha = 0.12;
    for (let y = 0; y < h; y += 3) {
      g.fillStyle = y % 6 ? '#000' : '#fff';
      g.fillRect(0, y, w, 1);
    }
    for (let xx = 0; xx < w; xx += 3) {
      g.fillStyle = '#000';
      g.fillRect(xx, 0, 1, h);
    }
    g.globalAlpha = 1;
  });
}
function fringeTex() {
  return canvasTex(256, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (let x = 2; x < w; x += 6) {
      g.strokeStyle = (x / 6) % 4 < 1 ? '#d8452f' : '#f3ead8';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(x, 0);
      g.quadraticCurveTo(x + 2, h * 0.5, x, h - 4 - ((x * 7) % 9));
      g.stroke();
    }
  });
}

export function buildHammock(scene, world, palmA, palmB) {
  const R = mulberry32(77);
  const ca = trunkAt(palmA, TIE_Y), cb = trunkAt(palmB, TIE_Y);
  const dir = cb.clone().sub(ca).setY(0).normalize();
  const tieA = ca.clone().addScaledVector(dir, 0.22);
  const tieB = cb.clone().addScaledVector(dir, -0.22);
  const span = tieA.distanceTo(tieB);
  const half = span / 2;
  const mid = tieA.clone().add(tieB).multiplyScalar(0.5);
  const yaw = Math.atan2(dir.x, dir.z);

  const group = new THREE.Group();
  group.position.copy(mid);
  group.rotation.order = 'YXZ';
  group.rotation.y = yaw;
  scene.add(group);

  const zE = half - ROPE_LEN;
  const bedY = (z) => -SAG + (SAG - END_DROP) * (z / zE) ** 2;
  const widthAt = (z) => 0.18 + 0.9 * Math.sqrt(Math.max(0, 1 - (z / zE) ** 2));

  // pano: superfície que "abraça" (laterais levantadas)
  const NZ = 40, NX = 16;
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= NZ; i++) {
    const z = -zE + (2 * zE * i) / NZ;
    const w = widthAt(z);
    for (let j = 0; j <= NX; j++) {
      const u = j / NX * 2 - 1;
      const x = u * w * 0.5;
      const lift = Math.pow(Math.abs(u), 1.8) * (0.42 * (w / 1.08));
      pos.push(x, bedY(z) + lift, z);
      uv.push(j / NX, i / NZ * 2.5);
    }
  }
  for (let i = 0; i < NZ; i++) {
    for (let j = 0; j < NX; j++) {
      const a = i * (NX + 1) + j, b = a + NX + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const cg = new THREE.BufferGeometry();
  cg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  cg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  cg.setIndex(idx);
  cg.computeVertexNormals();
  const clothMat = patchMaterial(new THREE.MeshStandardMaterial({ map: clothTex(), side: THREE.DoubleSide, roughness: 0.95 }));
  const cloth = new THREE.Mesh(cg, clothMat);
  cloth.castShadow = true;
  cloth.receiveShadow = true;
  group.add(cloth);

  // franjas (varanda da rede) nas bordas
  const fr = [];
  for (const sd of [-1, 1]) {
    for (let i = 0; i < NZ; i++) {
      const z0 = -zE * 0.85 + (1.7 * zE * i) / NZ, z1 = -zE * 0.85 + (1.7 * zE * (i + 1)) / NZ;
      const e = (z) => {
        const w = widthAt(z);
        return new THREE.Vector3(sd * w * 0.5, bedY(z) + 0.42 * (w / 1.08), z);
      };
      const a = e(z0), b = e(z1);
      const q = new THREE.PlaneGeometry(1, 0.2);
      const p = q.attributes.position;
      // quad pendurado da borda
      const pts = [a, b, a.clone().add(new THREE.Vector3(sd * 0.03, -0.2, 0)), b.clone().add(new THREE.Vector3(sd * 0.03, -0.2, 0))];
      pts.forEach((v, k) => p.setXYZ(k, v.x, v.y, v.z));
      const uvq = q.attributes.uv;
      uvq.setXY(0, i / NZ * 6, 1);
      uvq.setXY(1, (i + 1) / NZ * 6, 1);
      uvq.setXY(2, i / NZ * 6, 0);
      uvq.setXY(3, (i + 1) / NZ * 6, 0);
      q.computeVertexNormals();
      fr.push(q);
    }
  }
  const ft = fringeTex();
  const fringe = new THREE.Mesh(mergeGeometries(fr), patchMaterial(new THREE.MeshStandardMaterial({ map: ft, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.95 })));
  group.add(fringe);

  // punhos: cordas das amarrações até a ponta do pano
  const ropeMat = patchMaterial(new THREE.MeshStandardMaterial({ color: '#e8dcc0', roughness: 0.9 }));
  const ropes = [];
  for (const s of [-1, 1]) {
    const tie = new THREE.Vector3(0, 0, s * half);
    const endY = bedY(zE);
    const endW = widthAt(zE * 0.97);
    for (let k = 0; k < 7; k++) {
      const lx = (k / 6 - 0.5) * endW * 1.05;
      const end = new THREE.Vector3(lx, endY + 0.03, s * zE);
      const c = new THREE.LineCurve3(tie, end);
      ropes.push(taperTube(c, 0.012, 0.012, 1, 5));
    }
    // nó/costura onde as cordas pegam no pano
    const knot = new THREE.CylinderGeometry(0.035, 0.035, endW * 1.12, 8);
    knot.rotateZ(Math.PI / 2);
    knot.translate(0, endY + 0.03, s * zE);
    ropes.push(knot.toNonIndexed().index ? knot : knot);
    // corda grossa até o tronco
    ropes.push(taperTube(new THREE.LineCurve3(tie.clone().add(new THREE.Vector3(0, 0, -s * 0.05)), tie.clone().add(new THREE.Vector3(0, 0.02, s * 0.22))), 0.025, 0.025, 1, 6));
  }
  const ropeGeo = mergeGeometries(ropes.map((g) => (g.index ? g.toNonIndexed() : g)));
  const ropeMesh = new THREE.Mesh(ropeGeo, ropeMat);
  ropeMesh.castShadow = true;
  group.add(ropeMesh);

  // amarração enrolada no tronco (fica parada)
  for (const [palm, c] of [[palmA, ca], [palmB, cb]]) {
    for (let k = 0; k < 3; k++) {
      const t = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.03, 8, 22), ropeMat);
      t.rotation.x = Math.PI / 2;
      t.position.set(c.x - palm.x, TIE_Y - 0.05 + k * 0.055, c.z - palm.z);
      t.castShadow = true;
      palm.group.add(t);
    }
  }

  // colisão: o pano bloqueia a passagem
  for (const z of [-0.9, 0, 0.9]) {
    const p = group.localToWorld(new THREE.Vector3(0, 0, z));
    world.colliders.circles.push({ x: p.x, z: p.z, r: 0.42 });
  }

  return {
    group, yaw, mid, half, zE,
    swing: 0, swingV: 0, phase: R() * 6,
    occupied: false,
    sides: [-1, 1].map((sd) => group.localToWorld(new THREE.Vector3(sd * 1.15, 0, 0)).setY(0)),
    lieLocal: new THREE.Vector3(0, -SAG + 0.2, 0.62),
    impulse(v) {
      this.swingV += v;
    },
    update(dt, time) {
      const k = 3.2, damping = this.occupied ? 0.25 : 0.9;
      const wind = Math.sin(time * 0.9 + this.phase) * 0.02 + Math.sin(time * 0.37) * 0.015;
      const drive = this.occupied ? Math.sin(time * 1.75) * 0.06 : 0;
      this.swingV += (-k * (this.swing - wind) - damping * this.swingV + drive) * dt;
      this.swing += this.swingV * dt;
      group.rotation.z = this.swing;
    },
  };
}
