import * as THREE from 'three';
import { makeFaceTexture } from './textures.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { CHAR_SCALE, HIP } from './config.js';

const plastic = (c, r = 0.32) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: 0 });

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const interp = (tab, x) => {
  for (let i = 1; i < tab.length; i++) {
    if (x <= tab[i][0]) {
      const [x0, y0] = tab[i - 1], [x1, y1] = tab[i];
      return y0 + (y1 - y0) * smooth(0, 1, (x - x0) / (x1 - x0));
    }
  }
  return tab[tab.length - 1][1];
};

// Peça de cabelo estilo brinquedo: domo fechado no topo (sem "calvície" vista de cima),
// volume na frente, fios penteados para trás (sulcos paralelos ao eixo frente-trás)
// e laterais grisalhas. Coordenadas no espaço da cabeça (raio 0.27, topo em y=0.44).
function makeHair() {
  const NU = 128, NV = 56;
  const CY = 0.3, RY = 0.215, RX = 0.298, RZF = 0.3, RZB = 0.316;
  const P = 2.6, E = 2 / P; // superelipse: cobre bem os cantos arredondados da cabeça
  // altura da linha do cabelo conforme o ângulo (0 = frente, PI = nuca)
  const EDGE = [[0, 0.372], [0.5, 0.362], [0.85, 0.3], [1.25, 0.255], [2.0, 0.2], [Math.PI, 0.135]];
  const GROOVES = 95;
  const pos = [], col = [], idx = [];
  const cBlack = new THREE.Color('#161618');
  const cGray = new THREE.Color('#8f8f8f');
  const c = new THREE.Color();

  for (let j = 0; j <= NV; j++) {
    const tuck = j === NV; // última fileira dobra para dentro, encostando na cabeça
    for (let i = 0; i <= NU; i++) {
      const th = Math.PI + ((i % NU) / NU) * Math.PI * 2; // costura na nuca
      const sx = Math.sin(th), cz = Math.cos(th);
      const yb = interp(EDGE, Math.abs(Math.atan2(sx, cz)));
      const phiEnd = yb >= CY ? Math.acos(Math.pow((yb - CY) / RY, 1 / E)) : Math.PI / 2 + (CY - yb) / RY;
      const phi = (Math.min(j, NV - 1) / (NV - 1)) * phiEnd;
      let y, rr;
      if (phi <= Math.PI / 2) {
        y = CY + RY * Math.pow(Math.cos(phi), E);
        rr = Math.pow(Math.sin(phi), E);
      } else {
        y = CY - (phi - Math.PI / 2) * RY;
        rr = 1;
      }
      let x, z;
      if (tuck) {
        x = sx * 0.264;
        z = cz * 0.264;
      } else {
        x = sx * RX * rr;
        z = cz * (cz > 0 ? RZF : RZB) * rr;
        // fios penteados para trás: sulcos que irradiam de um eixo frente-trás bem abaixo
        // da cabeça -> no topo correm da testa à nuca, nas laterais na horizontal e
        // atrás descem quase na vertical (sem "redemoinho")
        const dx = x, dy = y + 0.5;
        const len = Math.hypot(x, y - (CY - 0.06), z) || 1;
        const psi = Math.atan2(dy, dx);
        const g = 0.003 * Math.sin(psi * GROOVES) * smooth(0.0, 0.04, y - yb) * (1 - 0.75 * smooth(0.55, 0.9, Math.abs(x) / RX));
        x += (x / len) * g;
        y += ((y - (CY - 0.06)) / len) * g;
        z += (z / len) * g;
        // topete: volume na frente, jogado para trás
        const f = smooth(0.0, 0.26, z) * smooth(0.36, 0.48, y);
        y += 0.028 * f;
        z += 0.01 * f;
        // nuca levemente para fora
        const b = smooth(-0.1, -0.3, z) * smooth(0.3, 0.14, y);
        z -= 0.018 * b;
      }
      pos.push(x, y, z);

      // cor: preto no topo, grisalho nas laterais com mechas
      const side = smooth(0.5, 0.8, Math.abs(x) / RX) * smooth(0.44, 0.36, y);
      const streak = 0.5 + 0.5 * Math.sin(Math.atan2(y - CY, Math.abs(x)) * 22 + z * 40);
      c.copy(cBlack).lerp(cGray, side * (0.6 + 0.4 * streak));
      col.push(c.r, c.g, c.b);
    }
  }
  for (let j = 0; j < NV; j++) {
    for (let i = 0; i < NU; i++) {
      const a = j * (NU + 1) + i, b = a + NU + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  let geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo = mergeVertices(geo, 1e-5);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.36, metalness: 0 }));
  mesh.castShadow = true;
  return mesh;
}

const POSE_KEYS =['legL', 'legR', 'armLx', 'armRx', 'armLz', 'armRz', 'upX', 'upY', 'upZ', 'headX', 'headY', 'headZ', 'bodyY', 'bodyZ', 'bodyRY', 'wristL', 'wristR'];

export class Betao {
  constructor() {
    this.root = new THREE.Group();
    this.model = new THREE.Group();
    this.model.scale.setScalar(CHAR_SCALE);
    this.root.add(this.model);
    this.body = new THREE.Group();
    this.model.add(this.body);

    const mSkin = plastic('#f3b814', 0.3);
    const mBlack = plastic('#1e1e22', 0.45);
    const mNavy = plastic('#203d78', 0.45);
    const mNavyD = plastic('#1a3163', 0.5);
    const mSole = plastic('#121212', 0.6);
    this.mats = { mSkin, mBlack, mNavy };

    const box = (w, h, d, m) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      mesh.castShadow = true;
      return mesh;
    };

    // quadril
    const hips = box(0.8, 0.14, 0.4, mNavy);
    hips.position.y = HIP + 0.02;
    this.body.add(hips);
    const belt = box(0.82, 0.04, 0.42, mNavyD);
    belt.position.y = HIP + 0.09;
    this.body.add(belt);

    // pernas
    const makeLeg = (side) => {
      const g = new THREE.Group();
      g.position.set(side * 0.2, HIP, 0);
      const shorts = box(0.38, 0.44, 0.42, mNavy);
      shorts.position.y = -0.2;
      g.add(shorts);
      const pocket = box(0.05, 0.17, 0.22, mNavyD);
      pocket.position.set(side * 0.205, -0.25, 0.0);
      g.add(pocket);
      const flap = box(0.06, 0.04, 0.24, mNavyD);
      flap.position.set(side * 0.21, -0.15, 0.0);
      g.add(flap);
      const cuff = box(0.39, 0.04, 0.43, mNavyD);
      cuff.position.y = -0.41;
      g.add(cuff);
      const shin = box(0.36, 0.3, 0.38, mSkin);
      shin.position.y = -0.57;
      g.add(shin);
      const foot = box(0.36, 0.1, 0.5, mSkin);
      foot.position.set(0, -0.77, 0.05);
      g.add(foot);
      const sole = box(0.4, 0.045, 0.56, mSole);
      sole.position.set(0, -0.838, 0.05);
      g.add(sole);
      for (const sx of [-1, 1]) {
        const strap = box(0.035, 0.03, 0.24, mSole);
        strap.position.set(sx * 0.07, -0.71, 0.18);
        strap.rotation.y = sx * 0.55;
        g.add(strap);
      }
      this.body.add(g);
      return g;
    };
    this.legL = makeLeg(1);
    this.legR = makeLeg(-1);

    // tronco (trapézio)
    this.upper = new THREE.Group();
    this.upper.position.y = HIP + 0.09;
    this.body.add(this.upper);
    const tg = new THREE.BoxGeometry(0.8, 0.66, 0.4);
    const p = tg.attributes.position;
    for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) p.setX(i, p.getX(i) * 0.78);
    tg.computeVertexNormals();
    const torso = new THREE.Mesh(tg, mBlack);
    torso.castShadow = true;
    torso.position.y = 0.33;
    this.upper.add(torso);
    const neckline = new THREE.Mesh(new THREE.CircleGeometry(0.12, 20, Math.PI, Math.PI), mSkin);
    neckline.position.set(0, 0.66, 0.2015);
    this.upper.add(neckline);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, 0.1, 16), mSkin);
    neck.position.y = 0.7;
    this.upper.add(neck);

    // cabeça
    this.head = new THREE.Group();
    this.head.position.y = 0.74;
    this.upper.add(this.head);
    const prof = [[0, 0], [0.23, 0], [0.265, 0.03], [0.27, 0.06], [0.27, 0.38], [0.265, 0.41], [0.235, 0.44], [0, 0.44]].map(([x, y]) => new THREE.Vector2(x, y));
    const headMesh = new THREE.Mesh(new THREE.LatheGeometry(prof, 36), mSkin);
    headMesh.castShadow = true;
    this.head.add(headMesh);
    const faceMat = new THREE.MeshStandardMaterial({
      map: makeFaceTexture(), transparent: true, roughness: 0.3, polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false,
    });
    const face = new THREE.Mesh(new THREE.CylinderGeometry(0.2725, 0.2725, 0.38, 36, 1, true, -1.35, 2.7), faceMat);
    face.position.y = 0.22;
    face.renderOrder = 1;
    this.head.add(face);

    // cabelo penteado para trás (peça única, preto com laterais grisalhas)
    this.head.add(makeHair());

    // braços
    const makeArm = (side) => {
      const g = new THREE.Group();
      g.position.set(side * 0.37, 0.57, 0);
      const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.125, 16, 12), mSkin);
      shoulder.castShadow = true;
      g.add(shoulder);
      const upperArm = box(0.2, 0.4, 0.22, mSkin);
      upperArm.position.set(side * 0.04, -0.2, 0);
      upperArm.rotation.z = side * 0.1;
      g.add(upperArm);
      const fore = box(0.19, 0.2, 0.26, mSkin);
      fore.position.set(side * 0.07, -0.42, 0.06);
      fore.rotation.x = -0.45;
      g.add(fore);
      const wrist = new THREE.Group();
      wrist.position.set(side * 0.08, -0.5, 0.17);
      g.add(wrist);
      const cuffW = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.09, 12), mSkin);
      cuffW.rotation.x = -0.6;
      wrist.add(cuffW);
      const hand = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.034, 10, 18, Math.PI * 1.45), mSkin);
      hand.castShadow = true;
      hand.position.set(0, -0.07, 0.06);
      hand.rotation.set(-0.6, -Math.PI / 2, Math.PI / 4 + 0.2);
      wrist.add(hand);
      const grip = new THREE.Group();
      grip.position.set(0, -0.07, 0.06);
      wrist.add(grip);
      this.upper.add(g);
      return { g, wrist, grip };
    };
    const L = makeArm(1);
    const Rr = makeArm(-1);
    this.armL = L.g;
    this.armR = Rr.g;
    this.wristL = L.wrist;
    this.wristR = Rr.wrist;
    this.gripL = L.grip;
    this.gripR = Rr.grip;

    this.pose = {};
    this.target = {};
    for (const key of POSE_KEYS) {
      this.pose[key] = 0;
      this.target[key] = 0;
    }
  }

  resetTarget() {
    for (const key of POSE_KEYS) this.target[key] = 0;
    return this.target;
  }

  update(dt, sharp = 12) {
    const a = 1 - Math.exp(-sharp * dt);
    const P = this.pose, T = this.target;
    for (const key of POSE_KEYS) P[key] += (T[key] - P[key]) * a;
    this.legL.rotation.x = P.legL;
    this.legR.rotation.x = P.legR;
    this.armL.rotation.set(P.armLx, 0, P.armLz);
    this.armR.rotation.set(P.armRx, 0, -P.armRz);
    this.wristL.rotation.y = P.wristL;
    this.wristR.rotation.y = P.wristR;
    this.upper.rotation.set(P.upX, P.upY, P.upZ);
    this.head.rotation.set(P.headX, P.headY, P.headZ);
    this.body.position.y = P.bodyY;
    this.body.rotation.z = P.bodyZ;
    this.body.rotation.y = P.bodyRY;
  }
}
