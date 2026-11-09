import * as THREE from 'three';

const REGROW = 40;

export class Coconuts {
  constructor(scene, world, player, audio, fx, onCollect) {
    this.scene = scene;
    this.world = world;
    this.player = player;
    this.audio = audio;
    this.fx = fx;
    this.onCollect = onCollect;
    this.falling = [];
    this.pending = [];
    this.t = 0;
    this.goldMat = new THREE.MeshStandardMaterial({ color: '#ffd23f', roughness: 0.25, metalness: 0.8, emissive: '#7a5200', emissiveIntensity: 0.4, flatShading: true });
  }

  available(palm) {
    return palm.slots.some((s) => s.has);
  }

  shake(palm) {
    this.player.startShake(palm);
    palm.shake = 1;
    this.audio.rustle();
    const top = new THREE.Vector3();
    palm.crown.getWorldPosition(top);
    this.fx.leaves(top);
    const slots = palm.slots.filter((s) => s.has);
    if (!slots.length) return false;
    const slot = slots[Math.floor(Math.random() * slots.length)];
    this.pending.push({ at: this.t + 0.35, palm, slot });
    return true;
  }

  drop(palm, slot) {
    slot.has = false;
    slot.regrow = REGROW + Math.random() * 15;
    slot.grow = 0;
    const wp = new THREE.Vector3();
    slot.mesh.getWorldPosition(wp);
    slot.mesh.visible = false;
    const golden = Math.random() < 0.07;
    const m = new THREE.Mesh(this.world.coconutGeo, golden ? this.goldMat : this.world.coconutMat);
    m.castShadow = true;
    m.position.copy(wp);
    this.scene.add(m);
    // cai na direção do jogador, mas um pouco de lado
    const dx = this.player.pos.x - palm.x, dz = this.player.pos.z - palm.z;
    const l = Math.hypot(dx, dz) || 1;
    const side = (Math.random() - 0.5) * 2;
    const v = new THREE.Vector3((dx / l) * 1.4 + (-dz / l) * side, 0, (dz / l) * 1.4 + (dx / l) * side);
    this.falling.push({ m, v, golden, bounced: 0, t: 0, settled: false });
  }

  update(dt, time) {
    this.t += dt;
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i];
      if (this.t >= p.at) {
        this.drop(p.palm, p.slot);
        this.pending.splice(i, 1);
      }
    }

    // balanço dos coqueiros
    for (const palm of this.world.palms) {
      palm.shake *= Math.exp(-2.6 * dt);
      const wind = Math.sin(time * 0.9 + palm.phase) * 0.025 + Math.sin(time * 2.1 + palm.phase) * 0.01;
      palm.crown.rotation.z = wind + Math.sin(time * 19) * 0.09 * palm.shake;
      palm.crown.rotation.x = Math.cos(time * 0.7 + palm.phase) * 0.02 + Math.cos(time * 17) * 0.07 * palm.shake;
      palm.group.rotation.z = Math.sin(time * 15) * 0.012 * palm.shake;
      for (const s of palm.slots) {
        if (!s.has) {
          s.regrow -= dt;
          if (s.regrow <= 0) {
            s.has = true;
            s.grow = 0;
            s.mesh.visible = true;
          }
        } else if (s.grow < 1) {
          s.grow = Math.min(1, s.grow + dt * 0.8);
          s.mesh.scale.setScalar(0.2 + 0.8 * s.grow);
        }
      }
    }

    // cocos caindo / no chão
    const pp = this.player.pos;
    for (let i = this.falling.length - 1; i >= 0; i--) {
      const c = this.falling[i];
      c.t += dt;
      const r = 0.2;
      if (!c.settled) {
        c.v.y -= 20 * dt;
        c.m.position.addScaledVector(c.v, dt);
        c.m.rotation.x += c.v.z * dt * 3;
        c.m.rotation.z -= c.v.x * dt * 3;
        if (c.m.position.y < r) {
          c.m.position.y = r;
          if (c.bounced === 0) {
            const d = c.m.position.distanceTo(pp);
            this.audio.thud(Math.max(0.2, 1 - d / 20));
            this.fx.dust(c.m.position);
          }
          c.bounced++;
          c.v.y = -c.v.y * 0.38;
          c.v.x *= 0.6;
          c.v.z *= 0.6;
          if (Math.abs(c.v.y) < 0.6) {
            c.settled = true;
            c.baseY = r;
          }
        }
      } else {
        c.m.position.y = c.baseY + Math.abs(Math.sin(c.t * 3)) * 0.06;
        c.m.rotation.y += dt * 1.5;
        if (c.golden && Math.random() < dt * 6) this.fx.sparkle(c.m.position, '#ffe680', 1);
      }
      const dx = c.m.position.x - pp.x, dz = c.m.position.z - pp.z;
      if (c.t > 0.5 && dx * dx + dz * dz < 1.1 && c.m.position.y < 1.2) {
        this.scene.remove(c.m);
        this.falling.splice(i, 1);
        this.audio.pop();
        if (c.golden) this.audio.coin();
        this.fx.sparkle(c.m.position, c.golden ? '#ffe680' : '#ffffff', c.golden ? 18 : 8);
        this.onCollect(c.golden);
      }
    }
  }
}
