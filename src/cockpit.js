import * as THREE from 'three';
import { Batcher } from './world.js';
import { clamp, damp } from './config.js';

// Interior da Strada + visão de primeira pessoa (painel, volante com emblema FIAT,
// mãos do Betão, retrovisores "de verdade", câmbio e freio de mão)
// Referencial: o mesmo do carro (+z frente, +x lado do motorista, y chão)

export const EYE = new THREE.Vector3(0.42, 1.6, -0.22); // olhos do Betão ao volante
const SKIN = '#f3b814';
const DASH = '#333339', DASH_TOP = '#3b3b42', TRIM = '#3a3a40', LINER = '#d8d2c5', SILVER = '#aeb0b6';
const MAX_KMH = 160, MAX_RPM = 7000;

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.userData.ctx = g;
  return t;
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

// emblema FIAT: moldura cromada, fundo vermelho e letras cromadas
export function makeFiatBadge(size = 256) {
  return canvasTex(size, size, (g, s) => {
    const chrome = g.createLinearGradient(0, 0, 0, s);
    chrome.addColorStop(0, '#fbfbfc');
    chrome.addColorStop(0.45, '#9c9ea6');
    chrome.addColorStop(0.55, '#7d7f87');
    chrome.addColorStop(1, '#e9eaee');
    g.fillStyle = chrome;
    roundRect(g, s * 0.03, s * 0.03, s * 0.94, s * 0.94, s * 0.24);
    g.fill();
    const red = g.createLinearGradient(0, s * 0.1, 0, s * 0.9);
    red.addColorStop(0, '#e8323c');
    red.addColorStop(0.5, '#b9121d');
    red.addColorStop(1, '#7c0a12');
    g.fillStyle = red;
    roundRect(g, s * 0.11, s * 0.11, s * 0.78, s * 0.78, s * 0.17);
    g.fill();
    // brilho de "vidro" na metade de cima
    g.fillStyle = 'rgba(255,255,255,0.16)';
    roundRect(g, s * 0.13, s * 0.13, s * 0.74, s * 0.33, s * 0.15);
    g.fill();
    // letras
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `900 ${Math.round(s * 0.3)}px "Nunito", "Arial Black", sans-serif`;
    g.lineWidth = s * 0.025;
    g.strokeStyle = '#5a060c';
    g.strokeText('FIAT', s / 2, s * 0.52);
    const letters = g.createLinearGradient(0, s * 0.36, 0, s * 0.66);
    letters.addColorStop(0, '#ffffff');
    letters.addColorStop(0.5, '#d9dadf');
    letters.addColorStop(1, '#a9abb3');
    g.fillStyle = letters;
    g.fillText('FIAT', s / 2, s * 0.52);
  });
}

// ---------------------------------------------------------------- quadro de instrumentos
const CW = 512, CH = 180;
const DIALS = { tach: { x: 118, y: 92, r: 76 }, speedo: { x: 394, y: 92, r: 76 } };
const dialAngle = (f) => ((225 - 270 * clamp(f, 0, 1)) * Math.PI) / 180;

function clusterTex() {
  return canvasTex(CW, CH, (g) => {
    g.fillStyle = '#0c0c0f';
    roundRect(g, 0, 0, CW, CH, 40);
    g.fill();
    const dial = (d, max, step, minor, label, red) => {
      const { x, y, r } = d;
      const ring = g.createLinearGradient(0, y - r, 0, y + r);
      ring.addColorStop(0, '#d7d9de');
      ring.addColorStop(1, '#5d5f66');
      g.fillStyle = ring;
      g.beginPath();
      g.arc(x, y, r + 6, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#0a0a0d';
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
      if (red) {
        g.strokeStyle = '#e3262f';
        g.lineWidth = 7;
        g.beginPath();
        g.arc(x, y, r - 8, -dialAngle(red / max), -dialAngle(1));
        g.stroke();
      }
      for (let v = 0; v <= max + 1e-6; v += minor) {
        const a = dialAngle(v / max);
        const major = Math.abs(v / step - Math.round(v / step)) < 1e-6;
        const r0 = r - (major ? 16 : 10), r1 = r - 4;
        g.strokeStyle = red && v >= red ? '#ff4a4a' : '#f2f2f2';
        g.lineWidth = major ? 3 : 1.5;
        g.beginPath();
        g.moveTo(x + Math.cos(a) * r0, y - Math.sin(a) * r0);
        g.lineTo(x + Math.cos(a) * r1, y - Math.sin(a) * r1);
        g.stroke();
        if (major) {
          g.fillStyle = red && v >= red ? '#ff5a5a' : '#ffffff';
          g.font = '800 15px "Nunito", sans-serif';
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillText(String(Math.round(v)), x + Math.cos(a) * (r - 29), y - Math.sin(a) * (r - 29));
        }
      }
      g.fillStyle = '#9da3ad';
      g.font = '700 11px "Nunito", sans-serif';
      g.textAlign = 'center';
      g.fillText(label, x, y + r * 0.5);
    };
    dial(DIALS.tach, 7, 1, 0.5, 'x1000 rpm', 6);
    dial(DIALS.speedo, MAX_KMH, 20, 10, 'km/h', 0);
    // centro: combustível e temperatura + luzes-espia
    const cx = CW / 2;
    g.fillStyle = '#16161b';
    roundRect(g, cx - 62, 20, 124, 140, 14);
    g.fill();
    const bar = (yy, label, fill, col) => {
      g.fillStyle = '#9da3ad';
      g.font = '800 11px "Nunito", sans-serif';
      g.textAlign = 'left';
      g.fillText(label, cx - 52, yy + 1);
      for (let i = 0; i < 8; i++) {
        g.fillStyle = i < fill ? col : '#2b2b33';
        g.fillRect(cx - 26 + i * 10, yy - 5, 7, 10);
      }
    };
    bar(130, '⛽', 6, '#f2f2f2');
    bar(148, '🌡', 4, '#7fd0ff');
    g.textBaseline = 'middle';
    g.textAlign = 'center';
    g.font = '13px sans-serif';
    g.fillStyle = '#3ad16b';
    g.fillText('◀', cx - 40, 34);
    g.fillText('▶', cx + 40, 34);
  });
}

function lcdTex() {
  return canvasTex(256, 128, () => {});
}
function drawLcd(tex, gear, kmh) {
  const g = tex.userData.ctx;
  g.fillStyle = '#071019';
  g.fillRect(0, 0, 256, 128);
  g.fillStyle = 'rgba(120,200,255,0.06)';
  for (let y = 0; y < 128; y += 4) g.fillRect(0, y, 256, 2);
  g.textBaseline = 'middle';
  g.textAlign = 'center';
  g.fillStyle = gear === 'R' ? '#ff6b5a' : '#e9f4ff';
  g.font = '900 70px "Nunito", sans-serif';
  g.fillText(String(gear), 70, 66);
  g.fillStyle = '#7fd0ff';
  g.font = '800 18px "Nunito", sans-serif';
  g.fillText('MARCHA', 70, 18);
  g.fillStyle = '#e9f4ff';
  g.font = '900 52px "Nunito", sans-serif';
  g.fillText(String(kmh), 182, 60);
  g.fillStyle = '#7fd0ff';
  g.font = '800 18px "Nunito", sans-serif';
  g.fillText('km/h', 182, 104);
  tex.needsUpdate = true;
}

function radioTex() {
  return canvasTex(256, 140, (g, w, h) => {
    const bg = g.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#13233a');
    bg.addColorStop(1, '#0a1220');
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffb347';
    g.font = '900 24px "Nunito", sans-serif';
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.fillText('♪ Rádio Sítio FM', 16, 30);
    g.fillStyle = '#e9f4ff';
    g.font = '900 44px "Nunito", sans-serif';
    g.fillText('98,3', 16, 80);
    g.font = '800 18px "Nunito", sans-serif';
    g.fillText('MHz', 120, 88);
    for (let i = 0; i < 12; i++) {
      const hh = 8 + ((i * 37) % 30);
      g.fillStyle = i % 3 ? '#4fb7ff' : '#7fe08a';
      g.fillRect(150 + i * 8, 100 - hh, 5, hh);
    }
    g.fillStyle = '#9db4cf';
    g.font = '700 15px "Nunito", sans-serif';
    g.fillText('Forró do Betão · ao vivo', 16, 122);
  });
}

// plano com recorte (u0..u1, v0..v1) da imagem do retrovisor, espelhado na horizontal
function mirrorGeo(w, h, u0, u1, v0, v1) {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv;
  // vértices: (-,+) (+,+) (-,-) (+,-)
  uv.setXY(0, u1, v1);
  uv.setXY(1, u0, v1);
  uv.setXY(2, u1, v0);
  uv.setXY(3, u0, v0);
  return g;
}

export class Cockpit {
  constructor(car) {
    this.car = car;
    const body = car.body;
    this.active = false;
    this.lookYaw = 0;
    this.lookPitch = -0.1;
    this.lookHold = 0;
    this.t = 0;
    this.lastLcd = '';
    this.handbrakeT = 0;
    this.gearPos = new THREE.Vector2();

    const B = new Batcher();
    // ---------------------------------------------------------------- painel
    B.box(1.56, 0.33, 0.32, DASH, 0, 1.095, 0.6);
    B.box(1.6, 0.05, 0.36, DASH_TOP, 0, 1.28, 0.62);
    B.box(1.56, 0.04, 0.03, '#3d3d44', 0, 1.255, 0.44); // borda macia
    B.box(1.48, 0.022, 0.012, SILVER, 0, 1.165, 0.436); // friso prateado
    // caixa dos instrumentos (atrás do volante)
    B.box(0.38, 0.13, 0.08, '#1c1c20', 0.42, 1.32, 0.64);
    B.box(0.42, 0.02, 0.11, DASH_TOP, 0.42, 1.392, 0.6, -0.1, 0, 0); // pala
    for (const sd of [-1, 1]) B.box(0.022, 0.11, 0.09, DASH_TOP, 0.42 + sd * 0.2, 1.335, 0.6);
    // saídas de ar (centro e laterais)
    for (const vx of [-0.12, 0.12, -0.66, 0.66]) {
      B.box(0.16, 0.085, 0.012, '#111114', vx, 1.2, 0.436);
      for (const dy of [-0.022, 0, 0.022]) B.box(0.15, 0.008, 0.016, '#4a4a52', vx, 1.2 + dy, 0.433);
      B.box(0.17, 0.095, 0.006, SILVER, vx, 1.2, 0.441);
    }
    // central multimídia (moldura) + botões do ar
    B.box(0.29, 0.17, 0.014, '#0f0f12', 0, 1.06, 0.437);
    for (const kx of [-0.08, 0, 0.08]) {
      B.add(new THREE.CylinderGeometry(0.024, 0.026, 0.02, 16), '#1b1b1f', kx, 0.935, 0.428, Math.PI / 2, 0, 0);
      B.add(new THREE.CylinderGeometry(0.027, 0.027, 0.006, 16), SILVER, kx, 0.935, 0.436, Math.PI / 2, 0, 0);
    }
    // porta-luvas
    B.box(0.5, 0.01, 0.006, '#202024', -0.42, 1.04, 0.436);
    B.box(0.12, 0.025, 0.012, SILVER, -0.42, 1.0, 0.434);
    // console central
    B.box(0.24, 0.26, 0.66, DASH, 0, 0.7, 0.12);
    B.box(0.26, 0.02, 0.66, DASH_TOP, 0, 0.835, 0.12);
    B.box(0.09, 0.02, 0.09, '#18181b', 0, 0.85, 0.3); // coifa do câmbio
    // forros das portas
    for (const sd of [-1, 1]) {
      B.box(0.03, 0.55, 1.25, TRIM, sd * 0.775, 1.0, 0.05);
      B.box(0.07, 0.03, 1.3, '#26262b', sd * 0.79, 1.255, 0.05);
      B.box(0.07, 0.05, 0.42, '#2a2a2f', sd * 0.745, 1.04, 0.05);
      B.box(0.015, 0.03, 0.1, SILVER, sd * 0.758, 1.16, 0.4); // maçaneta interna
      B.box(0.03, 0.16, 0.25, '#2f2f35', sd * 0.765, 0.84, 0.35); // alto-falante
      // quebra-sol (levantado)
      B.box(0.6, 0.025, 0.24, '#cbc4b5', sd * 0.38, 1.845, 0.24);
    }
    B.box(1.58, 0.02, 0.98, LINER, 0, 1.865, -0.12); // forro do teto
    B.box(0.12, 0.03, 0.2, '#c9c2b2', 0, 1.85, 0.0); // luz de teto
    // palhetas do limpador
    for (const sd of [-1, 1]) B.box(0.55, 0.02, 0.025, '#151517', sd * 0.32 - 0.05, 1.3, 0.82, 0, 0, sd * 0.06);
    // retrovisores externos (carcaça)
    for (const sd of [-1, 1]) {
      B.box(0.1, 0.05, 0.08, '#2a2a2e', sd * 0.93, 1.3, 0.64);
      B.box(0.24, 0.16, 0.1, '#f2f0ea', sd * 1.05, 1.34, 0.645);
      B.box(0.22, 0.14, 0.012, '#151517', sd * 1.05, 1.34, 0.594);
    }
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.05 });
    const interior = B.build(mat);
    body.add(interior);

    // ---------------------------------------------------------------- telas
    const glow = (tex, intensity) => new THREE.MeshStandardMaterial({
      map: tex, emissiveMap: tex, emissive: '#ffffff', emissiveIntensity: intensity, roughness: 0.35,
    });
    this.clusterMat = glow(clusterTex(), 0.6);
    const cluster = new THREE.Group();
    cluster.position.set(0.42, 1.32, 0.592);
    cluster.rotation.set(0.33, Math.PI, 0);
    cluster.scale.setScalar(0.86);
    body.add(cluster);
    cluster.add(new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.14), this.clusterMat));
    const px = (x) => (x / CW - 0.5) * 0.4, py = (y) => (0.5 - y / CH) * 0.14;
    const needleMat = new THREE.MeshBasicMaterial({ color: '#ff3b1f' });
    const needle = (d) => {
      const r = (d.r / CW) * 0.4;
      const geo = new THREE.BoxGeometry(r * 0.88, 0.0035, 0.002);
      geo.translate(r * 0.44 - 0.006, 0, 0);
      const m = new THREE.Mesh(geo, needleMat);
      m.position.set(px(d.x), py(d.y), 0.003);
      cluster.add(m);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.004, 14), new THREE.MeshStandardMaterial({ color: '#1a1a1d', roughness: 0.4 }));
      cap.rotation.x = Math.PI / 2;
      cap.position.set(px(d.x), py(d.y), 0.005);
      cluster.add(cap);
      return m;
    };
    this.tachNeedle = needle(DIALS.tach);
    this.speedNeedle = needle(DIALS.speedo);
    this.lcd = lcdTex();
    drawLcd(this.lcd, 'N', 0);
    this.lcdMat = glow(this.lcd, 0.8);
    const lcd = new THREE.Mesh(new THREE.PlaneGeometry(0.075, 0.0375), this.lcdMat);
    lcd.position.set(0, py(72), 0.002);
    cluster.add(lcd);

    this.radioMat = glow(radioTex(), 0.7);
    const radio = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 0.137), this.radioMat);
    radio.position.set(0, 1.06, 0.4295);
    radio.rotation.y = Math.PI;
    body.add(radio);

    // ---------------------------------------------------------------- volante com emblema FIAT
    const steering = new THREE.Group();
    steering.position.set(0.42, 1.27, 0.33);
    steering.rotation.x = 0.5;
    const leather = new THREE.MeshStandardMaterial({ color: '#1d1d20', roughness: 0.62 });
    const plasticD = new THREE.MeshStandardMaterial({ color: '#2a2a2f', roughness: 0.5 });
    const chrome = new THREE.MeshStandardMaterial({ color: '#d9dbe0', roughness: 0.18, metalness: 0.9 });
    steering.add(new THREE.Mesh(new THREE.TorusGeometry(0.175, 0.026, 14, 48), leather));
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.064, 0.05, 28), plasticD);
    hub.rotation.x = Math.PI / 2;
    hub.position.z = -0.012;
    steering.add(hub);
    const hubRing = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.005, 8, 32), chrome);
    hubRing.position.z = -0.038;
    steering.add(hubRing);
    const badge = new THREE.Mesh(new THREE.PlaneGeometry(0.072, 0.072), new THREE.MeshStandardMaterial({
      map: makeFiatBadge(256), transparent: true, roughness: 0.25, metalness: 0.2,
    }));
    badge.position.z = -0.0385;
    badge.rotation.y = Math.PI;
    steering.add(badge);
    for (const sd of [-1, 1]) {
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.042, 0.022), plasticD);
      spoke.position.set(sd * 0.108, -0.006, -0.008);
      steering.add(spoke);
      const trim = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.007, 0.024), chrome);
      trim.position.set(sd * 0.108, 0.014, -0.009);
      steering.add(trim);
      for (const k of [0, 1]) {
        const btn = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.014, 0.006), new THREE.MeshStandardMaterial({ color: '#45454d', roughness: 0.4 }));
        btn.position.set(sd * (0.088 + k * 0.024), -0.008, -0.021);
        steering.add(btn);
      }
    }
    const lower = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.022), plasticD);
    lower.position.set(0, -0.105, -0.008);
    steering.add(lower);
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.26, 14), plasticD);
    column.rotation.x = Math.PI / 2;
    column.position.z = 0.14;
    steering.add(column);
    body.add(steering);
    car.steering = steering;
    this.steering = steering;
    // alavancas de seta e limpador (não giram com o volante)
    for (const sd of [-1, 1]) {
      const st = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.016, 0.016), plasticD);
      st.position.set(0.42 + sd * 0.1, 1.255, 0.42);
      st.rotation.z = sd * 0.15;
      body.add(st);
    }

    // ---------------------------------------------------------------- câmbio e freio de mão
    this.gearLever = new THREE.Group();
    this.gearLever.position.set(0, 0.86, 0.3);
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.013, 0.17, 10), chrome);
    stick.position.y = 0.085;
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.036, 18, 12), leather);
    knob.position.y = 0.18;
    knob.scale.set(1, 0.85, 1.1);
    const knobTop = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.006, 16), chrome);
    knobTop.position.y = 0.209;
    this.gearLever.add(stick, knob, knobTop);
    body.add(this.gearLever);
    this.handbrake = new THREE.Group();
    this.handbrake.position.set(0, 0.85, -0.08);
    const hbLever = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, 0.24), leather);
    hbLever.position.z = 0.11;
    const hbBtn = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.02, 10), chrome);
    hbBtn.rotation.x = Math.PI / 2;
    hbBtn.position.z = 0.235;
    this.handbrake.add(hbLever, hbBtn);
    body.add(this.handbrake);

    // ---------------------------------------------------------------- retrovisores "de verdade"
    this.rt = new THREE.WebGLRenderTarget(640, 200, { samples: 2 });
    this.rearCam = new THREE.PerspectiveCamera(34, 640 / 200, 0.3, 320);
    this.rearCam.position.set(0, 1.72, -0.9);
    this.rearCam.rotation.set(-0.05, 0, 0);
    body.add(this.rearCam);
    const mirrorMat = new THREE.MeshBasicMaterial({ map: this.rt.texture, color: '#e2e8ec' });
    this.mirrors = [];
    // interno
    const rvm = new THREE.Group();
    rvm.position.set(0, 1.74, 0.4);
    rvm.rotation.set(0.06, Math.PI - 0.26, 0);
    const rvmBox = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.04), plasticD);
    rvm.add(rvmBox);
    const rvmGlass = new THREE.Mesh(mirrorGeo(0.315, 0.078, 0.22, 0.78, 0.3, 0.74), mirrorMat);
    rvmGlass.position.z = 0.021;
    rvm.add(rvmGlass);
    const stem = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.1, 0.03), plasticD);
    stem.position.set(0, 1.81, 0.37);
    body.add(rvm, stem);
    this.mirrors.push(rvmGlass);
    // externos (lado do motorista mostra o lado esquerdo da imagem de trás)
    for (const sd of [-1, 1]) {
      const m = new THREE.Mesh(sd > 0 ? mirrorGeo(0.21, 0.13, 0.6, 1.0, 0.1, 0.9) : mirrorGeo(0.21, 0.13, 0.0, 0.4, 0.1, 0.9), mirrorMat);
      m.position.set(sd * 1.05, 1.34, 0.5865);
      m.rotation.y = Math.PI;
      body.add(m);
      this.mirrors.push(m);
    }

    // ---------------------------------------------------------------- braços do Betão (1ª pessoa)
    const skin = new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.3 });
    const seg = new THREE.BoxGeometry(1, 1, 1);
    seg.translate(0, 0, 0.5);
    this.arms = [1, -1].map((sd) => {
      const upper = new THREE.Mesh(seg, skin);
      const fore = new THREE.Mesh(seg, skin);
      upper.scale.set(0.095, 0.09, 1);
      fore.scale.set(0.082, 0.078, 1);
      // mão fechada no aro (filha do volante: gira junto)
      const hand = new THREE.Group();
      hand.position.set(sd * 0.175, 0.02, 0);
      const fist = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.075), skin);
      fist.position.set(sd * 0.008, 0, -0.012);
      const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.045, 0.03), skin);
      thumb.position.set(-sd * 0.03, 0.035, -0.03);
      hand.add(fist, thumb);
      steering.add(hand);
      body.add(upper, fore);
      return {
        sd, upper, fore, hand,
        shoulder: new THREE.Vector3(0.42 + sd * 0.23, 1.3, -0.2),
        grip: new THREE.Vector3(sd * 0.175, 0.02, -0.035),
      };
    });
    // luz de painel (deixa a cabine legível à noite na 1ª pessoa)
    this.cabinLight = new THREE.PointLight('#ffe2bd', 0, 1.8, 2);
    this.cabinLight.position.set(0.1, 1.8, 0.05);
    body.add(this.cabinLight);
    this.fpParts = [...this.arms.flatMap((a) => [a.upper, a.fore, a.hand])];
    for (const p of this.fpParts) p.visible = false;

    body.traverse((o) => {
      if (o.isMesh) o.receiveShadow = true;
    });
    interior.castShadow = false;
  }

  setActive(on, character) {
    this.active = on;
    for (const p of this.fpParts) p.visible = on;
    // o tronco, a cabeça e os braços do boneco somem (a câmera está na cabeça dele);
    // as pernas continuam lá pra quem olhar pra baixo
    character.upper.visible = !on;
    this.car.glassMat.opacity = on ? 0.1 : 0.45;
    this.lookYaw = 0;
    this.lookPitch = -0.07;
    this.lookHold = 0;
    document.body.classList.toggle('fp-view', on);
  }

  // ponteiros, visor, câmbio, freio de mão e braços
  update(dt, night) {
    const car = this.car;
    this.t += dt;
    const on = car.driving;
    const kmh = Math.abs(car.speed) * 3.6;
    this.speedNeedle.rotation.z = dialAngle(kmh / MAX_KMH);
    const rpm = on ? car.rpm : 0;
    this.tachNeedle.rotation.z = dialAngle(rpm / MAX_RPM) + (on ? Math.sin(this.t * 31) * 0.004 : 0);
    const lit = on ? 0.45 + night * 0.9 : 0.05;
    this.cabinLight.intensity = this.active ? 0.05 + night * 0.35 : 0;
    this.clusterMat.emissiveIntensity = lit;
    this.lcdMat.emissiveIntensity = on ? 0.9 + night * 0.4 : 0.02;
    this.radioMat.emissiveIntensity = on ? 0.6 + night * 0.5 : 0.02;
    const key = `${car.gear}|${Math.round(kmh)}`;
    if (on && key !== this.lastLcd) {
      this.lastLcd = key;
      drawLcd(this.lcd, car.gear, Math.round(kmh));
    }

    // câmbio em H: 1 3 5 em cima, 2 4 R embaixo (esquerda = +x)
    const H = { 1: [1, 1], 2: [1, -1], 3: [0, 1], 4: [0, -1], 5: [-1, 1], R: [-1, -1], N: [0, 0] };
    const [hx, hz] = H[car.gear] || [0, 0];
    this.gearPos.x = damp(this.gearPos.x, hx, 18, dt);
    this.gearPos.y = damp(this.gearPos.y, hz, 18, dt);
    this.gearLever.rotation.set(this.gearPos.y * 0.22, 0, -this.gearPos.x * 0.2);
    this.handbrakeT = damp(this.handbrakeT, car.handbrake || !on ? 1 : 0, 14, dt);
    this.handbrake.rotation.x = -0.42 * this.handbrakeT;

    if (this.active) {
      this.steering.updateMatrix();
      for (const a of this.arms) {
        const wrist = a.grip.clone().applyMatrix4(this.steering.matrix);
        const sh = a.shoulder;
        const mid = sh.clone().lerp(wrist, 0.5);
        mid.x += a.sd * 0.07;
        mid.y -= 0.1;
        place(a.upper, sh, mid);
        place(a.fore, mid, wrist);
      }
    }
  }

  // câmera nos olhos do Betão
  updateCamera(dt, input, camera) {
    const car = this.car;
    const drag = Math.abs(input.orbit.dx) + Math.abs(input.orbit.dy);
    if (drag > 0.3) {
      this.lookYaw -= input.orbit.dx * 0.0045;
      this.lookPitch -= input.orbit.dy * 0.0035;
      this.lookHold = 1.4;
    } else this.lookHold -= dt;
    if (this.lookHold <= 0) {
      // olha pra dentro da curva
      const into = car.speed > 0.5 ? -car.steer * 0.5 : 0;
      this.lookYaw = damp(this.lookYaw, into, 3.5, dt);
      this.lookPitch = damp(this.lookPitch, -0.07, 3.5, dt);
    }
    this.lookYaw = clamp(this.lookYaw, -2.3, 2.3);
    this.lookPitch = clamp(this.lookPitch, -0.95, 0.55);

    const v = Math.abs(car.speed);
    const rough = car.onRoad ? 0.25 : 1;
    const bump = (Math.sin(this.t * 13.1) * 0.6 + Math.sin(this.t * 21.7 + 1.3) * 0.4) * 0.008 * rough * Math.min(1, v / 8);
    const eye = EYE.clone();
    eye.x += Math.sin(this.lookYaw) * 0.06; // vira a cabeça, não só os olhos
    eye.y += bump;
    car.group.updateMatrixWorld();
    car.body.localToWorld(eye);
    camera.position.copy(eye);
    const q = car.body.getWorldQuaternion(new THREE.Quaternion());
    const look = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.lookPitch, Math.PI + this.lookYaw, 0, 'YXZ'));
    camera.quaternion.copy(q.multiply(look));
    const fov = 64 + Math.min(v, 19) / 19 * 8;
    if (Math.abs(camera.fov - fov) > 0.01 || camera.near !== 0.05) {
      camera.fov = damp(camera.fov, fov, 3, dt);
      camera.near = 0.05;
      camera.updateProjectionMatrix();
    }
  }

  renderMirrors(renderer, scene) {
    for (const m of this.mirrors) m.visible = false;
    const sm = renderer.shadowMap;
    const auto = sm.autoUpdate;
    sm.autoUpdate = false; // reaproveita o mapa de sombra do quadro principal
    sm.needsUpdate = false;
    renderer.setRenderTarget(this.rt);
    renderer.render(scene, this.rearCam);
    renderer.setRenderTarget(null);
    sm.autoUpdate = auto;
    for (const m of this.mirrors) m.visible = true;
  }
}

const _Z = new THREE.Vector3(0, 0, 1);
function place(mesh, a, b) {
  const d = b.clone().sub(a);
  const len = d.length();
  mesh.position.copy(a);
  mesh.quaternion.setFromUnitVectors(_Z, d.divideScalar(len));
  mesh.scale.z = len;
}
