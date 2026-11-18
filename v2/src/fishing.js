import * as THREE from 'three';
import { RIVER, isWater, onBridge, onDeck, clamp, damp } from './config.js';

export const FISH = [
  { id: 'lambari', name: 'Lambari', w: 30, min: 8, max: 16, color: '#c8d2da', belly: '#f4f7f9', fin: '#f0b84a', str: 0.55, size: 0.5 },
  { id: 'tilapia', name: 'Tilápia', fem: true, w: 26, min: 18, max: 42, color: '#7d8b8f', belly: '#cfd6d4', fin: '#b0604c', str: 0.85, size: 0.75, stripes: true },
  { id: 'traira', name: 'Traíra', fem: true, w: 13, min: 25, max: 55, color: '#5b4a2f', belly: '#b3a473', fin: '#4a3b22', str: 1.2, size: 0.9, night: 2 },
  { id: 'pacu', name: 'Pacu', w: 11, min: 30, max: 65, color: '#474c56', belly: '#e58a4a', fin: '#3a3f48', str: 1.35, size: 0.95, tall: true },
  { id: 'bagre', name: 'Bagre', w: 8, min: 30, max: 70, color: '#6b6355', belly: '#ddd5c4', fin: '#5a5246', str: 1.45, size: 1.0, night: 3.5, whiskers: true },
  { id: 'tucunare', name: 'Tucunaré', w: 6, min: 30, max: 75, color: '#c9b83c', belly: '#f2eaa2', fin: '#d6512b', str: 1.75, size: 1.05, spots: true, golden: 1.6 },
  { id: 'dourado', name: 'Dourado', w: 2, min: 50, max: 110, color: '#f2b01c', belly: '#ffe680', fin: '#ff8a1c', str: 2.3, size: 1.25, golden: 1.8 },
  { id: 'chinelo', name: 'Chinelo perdido', w: 4, min: 38, max: 44, color: '#2f5fb5', junk: true, str: 0.35, size: 0.8 },
];

export function rarityOf(f) {
  if (f.junk) return { label: 'Tralha', cls: 'junk' };
  if (f.w >= 25) return { label: 'Comum', cls: 'common' };
  if (f.w >= 10) return { label: 'Incomum', cls: 'uncommon' };
  if (f.w >= 5) return { label: 'Raro', cls: 'rare' };
  return { label: 'Lendário', cls: 'legendary' };
}

export function makeFishMesh(sp, scale = 1) {
  const g = new THREE.Group();
  if (sp.junk) {
    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.05, 0.55), new THREE.MeshStandardMaterial({ color: sp.color, roughness: 0.6 }));
    g.add(sole);
    const strapMat = new THREE.MeshStandardMaterial({ color: '#f2f2f2', roughness: 0.5 });
    for (const s of [-1, 1]) {
      const st = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.22), strapMat);
      st.position.set(s * 0.06, 0.04, 0.1);
      st.rotation.y = s * 0.6;
      g.add(st);
    }
    g.scale.setScalar(scale);
    return g;
  }
  const geo = new THREE.IcosahedronGeometry(1, 4);
  const col = new THREE.Color(sp.color), belly = new THREE.Color(sp.belly);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i), z = pos.getZ(i);
    tmp.copy(col).lerp(belly, clamp(-y * 1.5 + 0.2, 0, 1));
    if (sp.stripes && Math.sin(z * 14) > 0.6 && y > -0.2) tmp.multiplyScalar(0.8);
    colors.set([tmp.r, tmp.g, tmp.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.3, metalness: sp.golden ? 0.35 : 0.1, clearcoat: 0.8, clearcoatRoughness: 0.2 });
  const body = new THREE.Mesh(geo, mat);
  body.scale.set(0.09, sp.tall ? 0.2 : 0.14, 0.34);
  g.add(body);
  const finMat = new THREE.MeshStandardMaterial({ color: sp.fin, roughness: 0.5, side: THREE.DoubleSide });
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.2, 4), finMat);
  tail.rotation.x = Math.PI / 2;
  tail.rotation.y = Math.PI / 4;
  tail.scale.set(0.3, 1, 1);
  tail.position.z = -0.4;
  g.add(tail);
  const dorsal = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.1, 0.2), finMat);
  dorsal.position.set(0, sp.tall ? 0.2 : 0.14, -0.02);
  dorsal.rotation.x = -0.3;
  g.add(dorsal);
  const eyeM = new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.2 });
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), eyeM);
    eye.position.set(s * 0.07, 0.03, 0.24);
    g.add(eye);
  }
  if (sp.spots) {
    const spotM = new THREE.MeshStandardMaterial({ color: '#2a2a1a' });
    for (const s of [-1, 1]) for (const z of [0.05, -0.08, -0.2]) {
      const sp2 = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.1, 0.04), spotM);
      sp2.position.set(s * 0.075, 0.02, z);
      g.add(sp2);
    }
  }
  if (sp.whiskers) {
    const wm = new THREE.MeshStandardMaterial({ color: '#2a2620' });
    for (const s of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.01, 0.18), wm);
      w.position.set(s * 0.06, -0.02, 0.36);
      w.rotation.y = s * 0.5;
      g.add(w);
    }
  }
  g.scale.setScalar(scale * sp.size);
  return g;
}

export class Fishing {
  constructor(scene, player, audio, fx, ui, onCatch) {
    this.scene = scene;
    this.player = player;
    this.audio = audio;
    this.fx = fx;
    this.ui = ui;
    this.onCatch = onCatch;
    this.state = 'idle';
    this.t = 0;
    this.hintShown = false;

    // vara
    const rod = new THREE.Group();
    const dark = new THREE.MeshStandardMaterial({ color: '#2a2a2e', roughness: 0.35, metalness: 0.2 });
    const cork = new THREE.MeshStandardMaterial({ color: '#c49a63', roughness: 0.8 });
    const gold = new THREE.MeshStandardMaterial({ color: '#e0b84a', roughness: 0.3, metalness: 0.7 });
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.4, 10), cork);
    handle.rotation.x = Math.PI / 2;
    handle.position.z = 0.05;
    rod.add(handle);
    const blank = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.028, 2.6, 8), dark);
    blank.rotation.x = Math.PI / 2;
    blank.position.z = 1.5;
    rod.add(blank);
    for (const z of [0.6, 1.2, 1.8, 2.4]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.008, 6, 12), gold);
      ring.position.set(0, -0.03, z);
      rod.add(ring);
    }
    const reel = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.06, 14), gold);
    reel.rotation.z = Math.PI / 2;
    reel.position.set(0, -0.08, 0.28);
    rod.add(reel);
    this.reelMesh = reel;
    this.tip = new THREE.Object3D();
    this.tip.position.z = 2.8;
    rod.add(this.tip);
    rod.rotation.x = -0.12;
    rod.visible = false;
    player.char.gripR.add(rod);
    this.rod = rod;

    // boia
    const bob = new THREE.Group();
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#ff3b3b', roughness: 0.4 }));
    const bot = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4 }));
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 6), new THREE.MeshStandardMaterial({ color: '#ff3b3b' }));
    stick.position.y = 0.12;
    bob.add(top, bot, stick);
    bob.visible = false;
    scene.add(bob);
    this.bobber = bob;

    // linha
    this.linePts = new Float32Array(24 * 3);
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(this.linePts, 3));
    this.line = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: '#f4f4f4', transparent: true, opacity: 0.85 }));
    this.line.frustumCulled = false;
    this.line.visible = false;
    scene.add(this.line);

    this.target = new THREE.Vector3();
    this.bobPos = new THREE.Vector3();
    this.tipPos = new THREE.Vector3();
    this.fishMesh = null;
  }

  get active() {
    return this.state !== 'idle';
  }

  // procura uma direção com água por perto
  findSpot() {
    const p = this.player.pos;
    const cur = this.player.facing;
    let best = null, bestScore = -1e9;
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const dx = Math.sin(a), dz = Math.cos(a);
      let far = 0;
      for (let d = 1.2; d <= 5.0; d += 0.4) {
        const x = p.x + dx * d, z = p.z + dz * d;
        const water = isWater(x, z) && !onBridge(x, z, -0.3) && !onDeck(x, z, -0.3);
        if (water) far = d;
        else if (far > 0) break;
        if (d > 2.4 && far === 0) break;
      }
      if (far === 0) continue;
      let diff = Math.abs(((a - cur + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      const score = -diff * 2 + Math.min(far, 4);
      if (score > bestScore) {
        bestScore = score;
        best = { yaw: a, dist: Math.min(far, 4.2) };
      }
    }
    return best;
  }

  start(spot, hour) {
    this.hour = hour;
    this.player.setState('fishing');
    this.player.facing = spot.yaw;
    this.player.vel.set(0, 0, 0);
    this.player.fishPose = 'castBack';
    this.rod.visible = true;
    this.state = 'cast';
    this.t = 0;
    const p = this.player.pos;
    const d = spot.dist - 0.2;
    this.target.set(p.x + Math.sin(spot.yaw) * d, RIVER.waterY + 0.02, p.z + Math.cos(spot.yaw) * d);
    this.audio.whoosh();
  }

  end() {
    this.state = 'idle';
    this.rod.visible = false;
    this.bobber.visible = false;
    this.line.visible = false;
    this.ui.reel(false);
    this.ui.marker(null);
    if (this.fishMesh) {
      this.fishMesh.parent.remove(this.fishMesh);
      this.fishMesh = null;
    }
    if (this.player.state === 'fishing' || this.player.state === 'celebrate') this.player.setState('free');
  }

  pick(hour) {
    const night = hour < 5.5 || hour > 19.3;
    const golden = (hour > 5.5 && hour < 7.5) || (hour > 17 && hour < 19.3);
    const list = FISH.map((f) => {
      let w = f.w;
      if (night && f.night) w *= f.night;
      if (night && f.id === 'lambari') w *= 0.6;
      if (golden && f.golden) w *= f.golden;
      return w;
    });
    const tot = list.reduce((a, b) => a + b, 0);
    let r = Math.random() * tot;
    for (let i = 0; i < FISH.length; i++) {
      r -= list[i];
      if (r <= 0) return FISH[i];
    }
    return FISH[0];
  }

  update(dt, input, hour) {
    if (this.state === 'idle') return;
    this.t += dt;
    const P = this.player;
    this.tip.getWorldPosition(this.tipPos);
    const wantsCancel = input.axis().mag > 0.5 || input.hit('Escape', 'KeyQ');

    switch (this.state) {
      case 'cast': {
        if (this.t > 0.32 && P.fishPose === 'castBack') {
          P.fishPose = 'castFwd';
          this.audio.whoosh();
        }
        if (this.t > 0.42) {
          if (!this.bobber.visible) {
            this.bobber.visible = true;
            this.line.visible = true;
            this.castFrom = this.tipPos.clone();
            this.castT = 0;
          }
          this.castT += dt / 0.65;
          const k = Math.min(this.castT, 1);
          this.bobPos.lerpVectors(this.castFrom, this.target, k);
          this.bobPos.y += Math.sin(k * Math.PI) * 2.0 - (1 - k) * 0;
          if (k >= 1) {
            this.bobPos.copy(this.target);
            this.fx.splash(this.target, 0.5);
            this.audio.plop();
            this.state = 'wait';
            this.t = 0;
            const golden = (hour > 5.5 && hour < 7.5) || (hour > 17 && hour < 19.3);
            this.waitTime = (2.5 + Math.random() * 6) * (golden ? 0.6 : 1);
            this.nibbles = Math.floor(Math.random() * 3);
            this.nextNibble = 0.8 + Math.random() * (this.waitTime - 1);
            P.fishPose = 'hold';
            if (!this.hintShown) {
              this.ui.toast(`Espere a boia afundar e aperte <b>${this.player.touch ? '✋' : 'E'}</b> na hora!`, 'hint');
              this.hintShown = true;
            }
          }
        }
        break;
      }
      case 'wait': {
        this.bobPos.copy(this.target);
        this.bobPos.y = RIVER.waterY + Math.sin(this.t * 3) * 0.025;
        if (this.nibbles > 0 && this.t > this.nextNibble) {
          this.nibbles--;
          this.nibbleT = 0.25;
          this.nextNibble = this.t + 0.6 + Math.random() * 1.2;
          this.audio.nibble();
          this.fx.ripple(this.target, 0.4, 0.6);
        }
        if (this.nibbleT > 0) {
          this.nibbleT -= dt;
          this.bobPos.y -= 0.05;
        }
        if (input.actionHit) {
          this.ui.toast('Calma! Ainda não beliscou...', 'hint');
          this.waitTime += 1.5;
        }
        if (wantsCancel) return this.end();
        if (this.t > this.waitTime) {
          this.state = 'bite';
          this.t = 0;
          this.audio.bite();
          this.fx.splash(this.target, 0.45);
          this.ui.marker('!', () => this.bobPos.clone().setY(this.bobPos.y + 0.8));
        }
        break;
      }
      case 'bite': {
        this.bobPos.copy(this.target);
        this.bobPos.y = RIVER.waterY - 0.14 + Math.sin(this.t * 30) * 0.03;
        if (Math.random() < dt * 8) this.fx.ripple(this.target, 0.5, 0.5);
        const win = input.touchUI ? 1.25 : 1.0;
        if (input.actionHit) {
          this.ui.marker(null);
          this.fish = this.pick(hour);
          this.startReel();
        } else if (this.t > win) {
          this.ui.marker(null);
          this.ui.toast('Escapou... o peixe foi mais rápido!', 'miss');
          this.audio.fail();
          this.state = 'wait';
          this.t = 0;
          this.waitTime = 2 + Math.random() * 5;
          this.nibbles = 1;
          this.nextNibble = 1;
        } else if (wantsCancel) return this.end();
        break;
      }
      case 'reel':
        this.updateReel(dt, input);
        break;
      case 'caught': {
        if (this.fishMesh) {
          this.fishMesh.rotation.y = Math.sin(this.t * 14) * 0.35;
          this.fishMesh.rotation.z = Math.sin(this.t * 9) * 0.15;
        }
        if (this.t > 2.6) this.end();
        break;
      }
    }

    this.bobber.position.copy(this.bobPos);
    this.updateLine();
  }

  startReel() {
    this.state = 'reel';
    this.t = 0;
    this.P = 18;
    this.T = 15;
    this.runT = 0;
    this.nextRun = 0.8 + Math.random() * 1.2;
    this.tickAcc = 0;
    this.player.fishPose = 'reel';
    this.ui.reel(true, this.P, this.T, false, this.fish);
    this.audio.splash(0.6);
    this.fx.splash(this.target, 0.8);
  }

  updateReel(dt, input) {
    const f = this.fish;
    const held = input.actionHeld;
    const P = this.player;
    // corridas do peixe
    if (this.runT > 0) {
      this.runT -= dt;
      if (this.runT <= 0) this.nextRun = 1.0 + Math.random() * (2.6 - f.str * 0.5);
    } else if (!f.junk) {
      this.nextRun -= dt;
      if (this.nextRun <= 0) {
        this.runT = 0.5 + Math.random() * 0.5 * f.str;
        this.fx.splash(this.bobPos, 0.4);
        this.audio.splash(0.4, 0.6);
      }
    }
    const running = this.runT > 0;
    if (held) {
      this.P += (34 / (0.6 + f.str * 0.55)) * dt * (running ? 0.35 : 1);
      this.T += (18 + f.str * 24) * dt * (running ? 2.3 : 1);
      this.tickAcc += dt;
      if (this.tickAcc > 0.06) {
        this.tickAcc = 0;
        this.audio.reelTick(running ? 0.8 : 1);
      }
    } else {
      this.T -= 72 * dt;
      this.P -= (running ? 12 : 4) * dt;
    }
    this.T = clamp(this.T, 0, 100);
    this.P = clamp(this.P, 0, 100);
    P.reelPull = running ? 1 : 0.3;
    P.reelSpin = held ? 1 : 0;
    this.ui.reel(true, this.P, this.T, running, f);

    // boia vem chegando
    const shore = P.pos.clone().add(new THREE.Vector3(Math.sin(P.facing) * 1.4, 0, Math.cos(P.facing) * 1.4));
    const k = this.P / 100;
    this.bobPos.lerpVectors(this.target, shore, k * 0.85);
    this.bobPos.y = RIVER.waterY - 0.08;
    if (running) {
      this.bobPos.x += Math.sin(this.t * 25) * 0.15;
      this.bobPos.z += Math.cos(this.t * 21) * 0.15;
      if (Math.random() < dt * 10) this.fx.ripple(this.bobPos, 0.4, 0.4);
    }
    if (this.T >= 100) {
      this.audio.snap();
      this.ui.toast('A linha arrebentou! Solte o botão quando o peixe puxar.', 'miss');
      this.end();
      return;
    }
    if (this.P <= 0) {
      this.audio.fail();
      this.ui.toast('O peixe se soltou...', 'miss');
      this.end();
      return;
    }
    if (this.P >= 100) this.landFish();
  }

  landFish() {
    const f = this.fish;
    const size = Math.round(f.min + (f.max - f.min) * Math.pow(Math.random(), 1.7));
    this.state = 'caught';
    this.t = 0;
    this.ui.reel(false);
    this.bobber.visible = false;
    this.line.visible = false;
    this.rod.visible = false;
    const P = this.player;
    P.setState('celebrate');
    const mesh = makeFishMesh(f, 1.5 + (size - f.min) / (f.max - f.min + 1) * 0.7);
    const holder = new THREE.Group();
    holder.add(mesh);
    holder.rotation.y = Math.PI / 2;
    holder.position.set(0, 1.78, 0.18);
    P.char.upper.add(holder);
    this.fishMesh = holder;
    const wp = new THREE.Vector3();
    holder.getWorldPosition(wp);
    this.fx.splash(new THREE.Vector3(this.bobPos.x, RIVER.waterY, this.bobPos.z), 1.1);
    this.audio.splash(1);
    const r = f.w < 6;
    this.audio.catchJingle(r);
    if (r) this.fx.confetti(P.pos.clone().setY(P.pos.y + 2.4), 70);
    else this.fx.sparkle(P.pos.clone().setY(P.pos.y + 2.2), '#fff2a8', 14);
    this.onCatch(f, size);
  }

  updateLine() {
    if (!this.line.visible) return;
    const a = this.tipPos, b = this.bobPos;
    const tension = this.state === 'reel' ? 0.85 : this.state === 'cast' ? 0.6 : 0.15;
    const sag = (1 - tension) * Math.min(a.distanceTo(b) * 0.25, 1.2);
    const n = 24;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      this.linePts[i * 3] = a.x + (b.x - a.x) * t;
      this.linePts[i * 3 + 1] = a.y + (b.y + 0.1 - a.y) * t - Math.sin(Math.PI * t) * sag;
      this.linePts[i * 3 + 2] = a.z + (b.z - a.z) * t;
    }
    this.line.geometry.attributes.position.needsUpdate = true;
  }
}
