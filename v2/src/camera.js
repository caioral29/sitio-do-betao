import * as THREE from 'three';
import { clamp, damp, dampAngle, HOUSE_BOX, groundHeight } from './config.js';

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.yaw = 0.18;
    this.pitch = 0.62;
    this.dist = 13;
    this.curDist = 13;
    this.curPitch = 0.62;
    this.target = new THREE.Vector3();
    this.zoomMul = 1;
    this.pitchBias = 0;
    this.autoYaw = null;
    this.autoK = 2.2; // rapidez com que a câmera volta pro ângulo automático
    this.shake = 0;
    this.intro = 1;
  }

  update(dt, focus, input, { allowOrbit = true } = {}) {
    if (allowOrbit) {
      this.yaw -= input.orbit.dx * 0.0055;
      this.pitch = clamp(this.pitch + input.orbit.dy * 0.004, 0.12, 1.32);
      if (Math.abs(input.orbit.dx) > 0.5) this.autoYaw = null;
    }
    this.dist = clamp(this.dist + input.wheel * 0.012, 4.5, 24);
    if (this.autoYaw !== null) this.yaw = dampAngle(this.yaw, this.autoYaw, this.autoK, dt);

    this.intro = damp(this.intro, 0, 1.1, dt);
    const wantDist = this.dist * this.zoomMul * (1 + this.intro * 1.6);
    this.curDist = damp(this.curDist, wantDist, 4, dt);
    this.curPitch = damp(this.curPitch, clamp(this.pitch + this.pitchBias + this.intro * 0.25, 0.08, 1.4), 6, dt);

    const ft = new THREE.Vector3(focus.x, focus.y + 1.25, focus.z);
    if (this.target.lengthSq() === 0) this.target.copy(ft);
    this.target.x = damp(this.target.x, ft.x, 9, dt);
    this.target.y = damp(this.target.y, ft.y, 6, dt);
    this.target.z = damp(this.target.z, ft.z, 9, dt);

    const cp = Math.cos(this.curPitch), sp = Math.sin(this.curPitch);
    const dir = new THREE.Vector3(Math.sin(this.yaw) * cp, sp, Math.cos(this.yaw) * cp);
    let d = this.curDist;

    // não deixa a casa tapar a visão
    const hit = rayBox(this.target, dir, HOUSE_BOX, 0, 6.2);
    if (hit !== null && hit < d) d = Math.max(hit - 0.4, 2.5);

    const pos = this.target.clone().addScaledVector(dir, d);
    const gh = groundHeight(pos.x, pos.z) + 0.6;
    if (pos.y < gh) pos.y = gh;

    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2.5);
      pos.x += (Math.random() - 0.5) * this.shake * 0.25;
      pos.y += (Math.random() - 0.5) * this.shake * 0.25;
    }
    this.camera.position.copy(pos);
    this.camera.lookAt(this.target);
  }

  // vetores de movimento relativos à câmera
  basis() {
    return {
      fx: -Math.sin(this.yaw), fz: -Math.cos(this.yaw),
      rx: Math.cos(this.yaw), rz: -Math.sin(this.yaw),
    };
  }
}

function rayBox(o, d, b, y0, y1) {
  let tmin = 0, tmax = Infinity;
  const axes = [['x', b.x0, b.x1], ['y', y0, y1], ['z', b.z0, b.z1]];
  for (const [k, lo, hi] of axes) {
    if (Math.abs(d[k]) < 1e-6) {
      if (o[k] < lo || o[k] > hi) return null;
    } else {
      let t1 = (lo - o[k]) / d[k], t2 = (hi - o[k]) / d[k];
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
  }
  return tmin > 0 ? tmin : null;
}
