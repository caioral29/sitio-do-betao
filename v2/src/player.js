import * as THREE from 'three';
import { Betao } from './character.js';
import {
  BOUNDS, SPAWN, CHAR_SCALE, HIP, SIT_LIFT, isWater, onBridge, onDeck, groundHeight, surfaceAt, clamp, damp, dampAngle,
} from './config.js';

const PR = 0.34; // raio do jogador
const _lieQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)); // deitado de barriga pra cima, cabeça para -Z
const _lieCenter = new THREE.Vector3(0, -1.5, 0); // ponto de foco da câmera (ref. da rede)

export class Player {
  constructor(scene, world, audio, fx) {
    this.world = world;
    this.audio = audio;
    this.fx = fx;
    this.char = new Betao();
    scene.add(this.char.root);
    this.pos = new THREE.Vector3(SPAWN.x, 0, SPAWN.z);
    this.vel = new THREE.Vector3();
    this.vy = 0;
    this.grounded = true;
    this.facing = SPAWN.yaw;
    this.state = 'free';
    this.stateT = 0;
    this.t = 0;
    this.walkPhase = 0;
    this.stepAcc = 0;
    this.speed = 0;
    this.boost = 0;
    this.idleLook = { t: 2, yaw: 0, pitch: 0 };
    this.danceStyle = 0;
    this.danceClock = 0;
    this.fishPose = 'hold';
    this.reelPull = 0;
    this.reelSpin = 0;
    this.onAction = null;
    this.bench = null;
    this.sitTween = null;
    this.hammock = null;
    this.lieTween = null;
    this.dustT = 0;

    // coco na mão (para beber)
    const cg = new THREE.SphereGeometry(0.17, 20, 14);
    cg.scale(1, 1.12, 1);
    this.handCoconut = new THREE.Mesh(cg, new THREE.MeshStandardMaterial({ color: '#7c8f2e', roughness: 0.5 }));
    const cut = new THREE.Mesh(new THREE.CircleGeometry(0.07, 16), new THREE.MeshStandardMaterial({ color: '#f4f0dc', roughness: 0.6 }));
    cut.rotation.x = -Math.PI / 2;
    cut.position.y = 0.185;
    this.handCoconut.add(cut);
    const straw = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.32, 10), new THREE.MeshStandardMaterial({ color: '#ff5d8f', roughness: 0.4 }));
    straw.position.set(0, 0.22, 0);
    straw.rotation.z = 0.3;
    this.handCoconut.add(straw);
    this.handCoconut.position.set(0, -0.05, 0.12);
    this.handCoconut.visible = false;
    this.char.gripR.add(this.handCoconut);
  }

  get busy() {
    return this.state !== 'free';
  }

  // -------------------------------------------------------------- colisão
  blocked(x, z) {
    if (z < BOUNDS.z0 || z > BOUNDS.z1) return true;
    const xl = z > 18.3 ? 56 : BOUNDS.x1; // na estrada dá pra ir mais longe
    if (x < -xl || x > xl) return true;
    if (!onBridge(x, z, 0.32) && !onDeck(x, z)) {
      if (isWater(x, z) || isWater(x + PR, z) || isWater(x - PR, z) || isWater(x, z + PR) || isWater(x, z - PR)) return true;
    }
    if (onBridge(x, z) && !onBridge(x, z, 0.32)) return true; // guarda-corpo
    for (const b of this.world.colliders.boxes) {
      if (!b.active) continue;
      if (x > b.x0 - PR && x < b.x1 + PR && z > b.z0 - PR && z < b.z1 + PR) return true;
    }
    return false;
  }
  resolveCircles() {
    for (const c of this.world.colliders.circles) {
      const dx = this.pos.x - c.x, dz = this.pos.z - c.z;
      const r = c.r + PR;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        const nx = this.pos.x + (dx / d) * (r - d), nz = this.pos.z + (dz / d) * (r - d);
        if (!this.blocked(nx, nz)) {
          this.pos.x = nx;
          this.pos.z = nz;
        }
      }
    }
  }
  tryMove(dx, dz) {
    if (!this.blocked(this.pos.x + dx, this.pos.z)) this.pos.x += dx;
    else this.vel.x *= 0.3;
    if (!this.blocked(this.pos.x, this.pos.z + dz)) this.pos.z += dz;
    else this.vel.z *= 0.3;
    this.resolveCircles();
  }

  // -------------------------------------------------------------- ações
  setState(s) {
    this.state = s;
    this.stateT = 0;
  }
  sit(bench) {
    this.bench = bench;
    this.setState('sitting');
    const seatY = bench.seatTop - HIP * CHAR_SCALE + SIT_LIFT;
    this.sitTween = { from: this.pos.clone(), to: new THREE.Vector3(bench.x, seatY, bench.z), fromYaw: this.facing, t: 0 };
    this.vel.set(0, 0, 0);
  }
  standUp() {
    if (!this.bench) return;
    const b = this.bench;
    // procura um ponto livre ao redor do banco (frente, lados, trás);
    // em último caso volta para onde o jogador estava antes de sentar
    const c = Math.cos(b.yaw), s = Math.sin(b.yaw);
    const at = (lx, lz) => ({ x: b.x + lx * c + lz * s, z: b.z - lx * s + lz * c });
    const cands = [
      b.front, at(0, 0.95), at(-1.3, 0.3), at(1.3, 0.3), at(-1.3, 0), at(1.3, 0), at(0, -0.85), at(0, -1.1),
    ];
    if (this.sitTween) cands.push(this.sitTween.from);
    const free = (p) => !this.blocked(p.x, p.z) && !this.world.colliders.circles.some((k) => Math.hypot(p.x - k.x, p.z - k.z) < k.r + PR);
    const out = cands.find(free) || this.sitTween?.from || b.front;
    this.pos.set(out.x, groundHeight(out.x, out.z), out.z);
    this.bench = null;
    this.sitTween = null;
    this.setState('free');
  }
  lieDown(h) {
    this.hammock = h;
    h.occupied = true;
    h.impulse(0.6);
    this.setState('lying');
    this.lieTween = { pos: this.pos.clone(), quat: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, this.facing, 0)), t: 0 };
    this.vel.set(0, 0, 0);
    this.grounded = true;
  }
  getUp(camPos) {
    const h = this.hammock;
    if (!h) return;
    // sai pelo lado mais perto da câmera que estiver livre
    const sides = [...h.sides].sort((a, b) => (camPos ? a.distanceToSquared(camPos) - b.distanceToSquared(camPos) : 0));
    const out = sides.find((p) => !this.blocked(p.x, p.z)) || sides[0];
    this.pos.set(out.x, 0, out.z);
    this.facing = Math.atan2(out.x - h.mid.x, out.z - h.mid.z);
    h.occupied = false;
    h.impulse(-0.5);
    this.hammock = null;
    this.setState('free');
  }
  enterCar(car) {
    this.car = car;
    this.setState('driving');
    this.vel.set(0, 0, 0);
    this.grounded = true;
    this.vy = 0;
  }
  exitCar(spot) {
    const car = this.car;
    this.car = null;
    this.pos.set(spot.x, groundHeight(spot.x, spot.z), spot.z);
    this.facing = Math.atan2(spot.x - car.pos.x, spot.z - car.pos.z);
    this.setState('free');
  }
  startShake(palm) {
    this.facing = Math.atan2(palm.x - this.pos.x, palm.z - this.pos.z);
    this.setState('shaking');
    this.vel.set(0, 0, 0);
  }
  startDrink() {
    this.setState('drinking');
    this.handCoconut.visible = true;
    this.vel.set(0, 0, 0);
  }
  startDance(style) {
    if (this.state !== 'dancing') this.danceClock = 0;
    this.danceStyle = style;
    this.danceClock = 0;
    this.setState('dancing');
    this.vel.set(0, 0, 0);
  }
  startShout() {
    this.setState('shouting');
    this.vel.set(0, 0, 0);
  }
  faceTowards(x, z) {
    this.facing = Math.atan2(x - this.pos.x, z - this.pos.z);
  }

  // -------------------------------------------------------------- update
  update(dt, input, cam) {
    this.t += dt;
    this.stateT += dt;
    if (this.boost > 0) this.boost -= dt;
    const T = this.char.resetTarget();
    let sharp = 12;

    switch (this.state) {
      case 'free':
        this.updateFree(dt, input, cam, T);
        break;
      case 'sitting': {
        const tw = this.sitTween;
        if (tw && tw.t < 1) {
          tw.t = Math.min(1, tw.t + dt / 0.45);
          const e = tw.t * tw.t * (3 - 2 * tw.t);
          this.pos.lerpVectors(tw.from, tw.to, e);
          this.pos.y += Math.sin(e * Math.PI) * 0.35;
          this.facing = dampAngle(this.facing, this.bench.yaw, 14, dt);
        } else this.facing = this.bench.yaw;
        T.legL = T.legR = -Math.PI / 2;
        T.armLx = T.armRx = -0.55;
        T.armLz = T.armRz = 0.05;
        T.upX = Math.sin(this.t * 1.6) * 0.015 - 0.05;
        this.lookAround(dt, T, 0.6);
        // cochilo depois de um tempo
        if (this.stateT > 14) {
          const nod = Math.max(0, Math.sin(this.t * 0.6));
          T.headX = 0.25 * nod;
        }
        break;
      }
      case 'lying': {
        // corpo curvado como banana, acompanhando o pano
        T.legL = -0.3 + Math.sin(this.t * 1.75) * 0.06;
        T.legR = -0.22;
        T.upX = 0.32;
        if (this.stateT < 8) {
          // mãos atrás da cabeça
          T.armLx = T.armRx = -2.95;
          T.armLz = T.armRz = 0.42;
          this.lookAround(dt, T, 0.7);
          T.headX = 0.25;
        } else {
          // cochilo: braços cruzados na barriga, cabeça tombada
          T.armLx = T.armRx = -0.5;
          T.armLz = T.armRz = -0.35;
          T.headY = 0.35;
          T.headX = 0.15 + Math.max(0, Math.sin(this.t * 0.5)) * 0.08;
        }
        T.bodyY = 0;
        sharp = 7;
        break;
      }
      case 'shaking': {
        const k = this.stateT;
        T.armLx = T.armRx = -1.45 + Math.sin(k * 26) * 0.18;
        T.armLz = T.armRz = -0.12;
        T.upX = 0.22 + Math.sin(k * 26) * 0.04;
        T.legL = 0.35;
        T.legR = -0.35;
        T.headX = -0.3;
        sharp = 20;
        if (k > 1.0) this.setState('free');
        break;
      }
      case 'drinking': {
        const k = this.stateT;
        const lift = clamp(k / 0.35, 0, 1) * clamp((1.9 - k) / 0.3, 0, 1);
        T.armRx = -2.2 * lift - 0.2;
        T.armRz = -0.35 * lift;
        T.headX = -0.35 * lift;
        T.upX = -0.06 * lift;
        T.armLx = -0.2;
        T.armLz = 0.15;
        if (k > 2.0) {
          this.handCoconut.visible = false;
          this.setState('free');
        }
        break;
      }
      case 'shouting': {
        const k = this.stateT;
        T.armLx = T.armRx = -1.75;
        T.armLz = T.armRz = -0.5;
        T.headX = -0.18 + Math.sin(k * 20) * 0.03;
        T.upX = -0.1;
        if (k > 1.4) this.setState('free');
        break;
      }
      case 'dancing':
        sharp = this.dance(dt, T);
        if (input.axis().mag > 0.2) this.setState('free');
        break;
      case 'fishing':
        this.fishAnim(dt, T);
        sharp = this.fishPose === 'castFwd' ? 22 : 12;
        break;
      case 'driving': {
        const st = this.car.steer;
        T.legL = T.legR = -Math.PI / 2 + 0.12;
        T.armLx = -1.2 + st * 0.55;
        T.armRx = -1.2 - st * 0.55;
        T.armLz = T.armRz = -0.06;
        T.upX = -0.06;
        T.headY = -st * 0.7;
        T.headX = Math.sin(this.t * 1.3) * 0.02;
        sharp = 14;
        break;
      }
      case 'celebrate': {
        const k = this.stateT;
        T.armLx = T.armRx = -2.9;
        T.armLz = T.armRz = 0.15;
        T.bodyY = Math.abs(Math.sin(k * 7)) * 0.12;
        if (this.camYaw !== undefined) this.facing = dampAngle(this.facing, this.camYaw, 6, dt);
        T.headX = -0.25;
        break;
      }
    }

    // vertical (pulo/queda)
    const gh = groundHeight(this.pos.x, this.pos.z);
    if (this.state === 'sitting' || this.state === 'lying' || this.state === 'driving') {
      // posição controlada pelo tween
    } else if (!this.grounded) {
      this.vy -= 22 * dt;
      this.pos.y += this.vy * dt;
      if (this.pos.y <= gh) {
        this.pos.y = gh;
        this.grounded = true;
        if (this.vy < -4) {
          this.audio.land();
          this.fx.dust(this.pos);
          this.fx.dust(this.pos);
        }
        this.vy = 0;
      }
    } else {
      if (this.pos.y > gh + 0.08) {
        this.grounded = false;
        this.vy = 0;
      } else this.pos.y = damp(this.pos.y, gh, 22, dt);
    }

    this.char.update(dt, sharp);
    if (this.state === 'lying') this.placeInHammock(dt);
    else if (this.state === 'driving') {
      // sentado no banco do motorista, acompanhando o carro
      const car = this.car;
      car.group.updateMatrixWorld();
      car.seat.getWorldPosition(this.char.root.position);
      car.seat.getWorldQuaternion(this.char.root.quaternion);
      this.pos.copy(car.pos);
      this.facing = car.yaw;
    } else {
      this.char.root.position.copy(this.pos);
      this.char.root.rotation.set(0, this.facing, 0);
    }
  }

  placeInHammock(dt) {
    const h = this.hammock;
    const root = this.char.root;
    h.group.updateMatrixWorld();
    const wantPos = h.group.localToWorld(h.lieLocal.clone());
    const wantQuat = h.group.getWorldQuaternion(new THREE.Quaternion()).multiply(_lieQ);
    const tw = this.lieTween;
    if (tw && tw.t < 1) {
      tw.t = Math.min(1, tw.t + dt / 0.6);
      const e = tw.t * tw.t * (3 - 2 * tw.t);
      root.position.lerpVectors(tw.pos, wantPos, e);
      root.position.y += Math.sin(e * Math.PI) * 0.5;
      root.quaternion.slerpQuaternions(tw.quat, wantQuat, e);
    } else {
      root.position.copy(wantPos);
      root.quaternion.copy(wantQuat);
    }
    // a câmera e os balões seguem o meio do corpo
    this.pos.copy(h.group.localToWorld(_lieCenter.clone()));
    this.facing = h.yaw;
  }

  updateFree(dt, input, cam, T) {
    const ax = input.axis();
    const b = cam.basis();
    const run = input.down('ShiftLeft', 'ShiftRight') || ax.mag > 0.95 && input.touchUI;
    const max = (run ? 6.8 : 4.0) * (this.boost > 0 ? 1.35 : 1);
    const wx = (b.fx * ax.y + b.rx * ax.x) * max;
    const wz = (b.fz * ax.y + b.rz * ax.x) * max;
    const acc = this.grounded ? 14 : 4;
    this.vel.x = damp(this.vel.x, wx, acc, dt);
    this.vel.z = damp(this.vel.z, wz, acc, dt);
    this.tryMove(this.vel.x * dt, this.vel.z * dt);
    const sp = Math.hypot(this.vel.x, this.vel.z);
    this.speed = sp;
    if (ax.mag > 0.1) this.facing = dampAngle(this.facing, Math.atan2(wx, wz), 12, dt);

    if (input.hit('Space') && this.grounded) {
      this.vy = 7.2;
      this.grounded = false;
      this.audio.jump();
    }

    if (!this.grounded) {
      T.legL = -0.6;
      T.legR = 0.4;
      T.armLx = -0.4;
      T.armRx = 0.3;
      T.armLz = T.armRz = 0.55;
      T.headX = this.vy > 0 ? -0.1 : 0.1;
      return;
    }
    if (sp > 0.3) {
      const k = sp / 6.8;
      this.walkPhase += dt * (5 + sp * 1.45);
      const s = Math.sin(this.walkPhase);
      const amp = 0.45 + k * 0.55;
      T.legL = s * amp;
      T.legR = -s * amp;
      T.armLx = -s * amp * 0.85;
      T.armRx = s * amp * 0.85;
      T.armLz = T.armRz = 0.08 + k * 0.1;
      T.bodyY = Math.abs(Math.cos(this.walkPhase)) * (0.04 + k * 0.08);
      T.upX = k * 0.18;
      T.upY = s * 0.08;
      T.headX = -k * 0.08;
      this.stepAcc += sp * dt;
      if (this.stepAcc > (run ? 1.5 : 1.15)) {
        this.stepAcc = 0;
        this.audio.step(surfaceAt(this.pos.x, this.pos.z), run);
        if (run && surfaceAt(this.pos.x, this.pos.z) === 'grass') this.fx.dust(this.pos);
      }
      this.idleLook.yaw = 0;
    } else {
      T.upX = Math.sin(this.t * 1.8) * 0.012;
      T.armLz = T.armRz = 0.06 + Math.sin(this.t * 1.8) * 0.02;
      T.armLx = T.armRx = -0.06;
      this.lookAround(dt, T, 0.5);
    }
  }

  lookAround(dt, T, amt) {
    const L = this.idleLook;
    L.t -= dt;
    if (L.t < 0) {
      L.t = 2 + Math.random() * 4;
      L.yaw = (Math.random() - 0.5) * 1.6 * amt;
      L.pitch = (Math.random() - 0.5) * 0.3;
    }
    T.headY = L.yaw;
    T.headX = L.pitch;
  }

  dance(dt, T) {
    const bpm = [118, 124, 132][this.danceStyle];
    this.danceClock += dt * bpm / 60;
    const b = this.danceClock;
    const ph = b * Math.PI;
    const s = Math.sin(ph), c = Math.cos(ph);
    if (this.danceStyle === 0) {
      // Forró: dois-pra-lá, dois-pra-cá
      const step = Math.sin(ph * 0.5);
      T.bodyZ = s * 0.12;
      T.legL = Math.max(0, s) * -0.45;
      T.legR = Math.max(0, -s) * -0.45;
      T.armLx = -1.05;
      T.armRx = -0.95;
      T.armLz = 0.35;
      T.armRz = 0.25 + c * 0.05;
      T.upY = step * 0.35;
      T.upZ = -s * 0.08;
      T.headY = -step * 0.25;
      T.headX = Math.abs(c) * 0.08;
      T.bodyY = Math.abs(s) * 0.05;
      T.bodyRY = Math.sin(ph * 0.25) * 0.6;
      return 14;
    }
    if (this.danceStyle === 1) {
      // Robô: poses travadas no tempo
      const poses = [
        [-1.57, 0, 0, 1.4, 0.0, 0.5],
        [0, -1.57, 1.4, 0, 0.0, -0.5],
        [-1.57, -1.57, 0, 0, 0.3, 0],
        [-3.0, 0, 0.2, 0.2, -0.3, 0.3],
        [0, -3.0, 0.2, 0.2, 0.3, -0.3],
        [-1.2, -1.2, 1.0, 1.0, 0, 0],
      ];
      const i = Math.floor(b) % poses.length;
      const p = poses[i];
      T.armLx = p[0];
      T.armRx = p[1];
      T.armLz = p[2];
      T.armRz = p[3];
      T.upY = p[4];
      T.headY = p[5];
      T.wristL = T.wristR = Math.floor(b * 2) % 2 ? 0.8 : -0.8;
      T.bodyY = (b % 1) < 0.15 ? -0.06 : 0;
      T.legL = i % 2 ? -0.2 : 0;
      T.legR = i % 2 ? 0 : -0.2;
      T.bodyRY = Math.floor(b / 4) % 2 ? 0.5 : -0.5;
      return 28;
    }
    // Axé: pula e mãos pro alto
    const hop = Math.abs(Math.sin(ph));
    T.bodyY = hop * 0.28;
    T.armLx = -2.6 + Math.sin(ph) * 0.5;
    T.armRx = -2.6 - Math.sin(ph) * 0.5;
    T.armLz = 0.4 + Math.max(0, c) * 0.4;
    T.armRz = 0.4 + Math.max(0, -c) * 0.4;
    T.legL = -hop * 0.5 * (Math.floor(b) % 2);
    T.legR = -hop * 0.5 * (1 - (Math.floor(b) % 2));
    T.headX = -0.15 + hop * 0.1;
    T.bodyRY = Math.sin(ph * 0.25) * 0.8;
    T.bodyZ = Math.sin(ph * 0.5) * 0.1;
    return 16;
  }

  fishAnim(dt, T) {
    switch (this.fishPose) {
      case 'castBack':
        T.armRx = -2.8;
        T.armRz = 0.1;
        T.armLx = -0.5;
        T.upX = -0.18;
        T.upY = 0.2;
        T.headX = -0.15;
        break;
      case 'castFwd':
        T.armRx = -0.55;
        T.armLx = -0.4;
        T.upX = 0.18;
        T.upY = -0.1;
        break;
      case 'reel':
        T.armRx = -0.95 + Math.sin(this.t * 30) * 0.03 * this.reelPull;
        T.armRz = -0.15;
        T.armLx = -0.95 + Math.sin(this.t * 16) * 0.3 * this.reelSpin;
        T.armLz = -0.3 + Math.cos(this.t * 16) * 0.12 * this.reelSpin;
        T.upX = -0.14 - this.reelPull * 0.12;
        T.legL = 0.25;
        T.legR = -0.3;
        T.headX = 0.1;
        break;
      default:
        T.armRx = -0.75;
        T.armRz = -0.12;
        T.armLx = -0.55;
        T.armLz = -0.25;
        T.upX = Math.sin(this.t * 1.5) * 0.015;
        T.headX = 0.12;
        T.headY = Math.sin(this.t * 0.4) * 0.15;
    }
  }
}
