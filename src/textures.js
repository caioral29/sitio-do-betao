import * as THREE from 'three';
import { mulberry32 } from './config.js';

function canvasTex(w, h, draw, { repeat = false, srgb = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Rosto do Betão — desenhado em canvas e aplicado como "decalque" na frente da cabeça
export function makeFaceTexture() {
  return canvasTex(512, 320, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const R = mulberry32(7);
    const cx = w / 2;

    // barba por fazer
    for (let i = 0; i < 1500; i++) {
      const x = cx + (R() * 2 - 1) * 150;
      const y = 150 + R() * 170;
      const dx = (x - cx) / 150, dy = (y - 250) / 85;
      const jaw = dx * dx + dy * dy < 1;
      const sideburn = Math.abs(x - cx) > 112 && Math.abs(x - cx) < 150 && y > 120;
      const nearMouth = Math.abs(x - cx) < 60 && y > 196 && y < 222;
      if (!(jaw && y > 190) && !sideburn) continue;
      if (nearMouth && R() < 0.6) continue;
      g.fillStyle = `rgba(${70 + R() * 30},${45 + R() * 20},5,${0.25 + R() * 0.25})`;
      g.beginPath();
      g.arc(x, y, 1.4 + R() * 1.4, 0, Math.PI * 2);
      g.fill();
    }

    g.lineCap = 'round';
    g.lineJoin = 'round';

    // linhas de expressão (bochecha)
    g.strokeStyle = 'rgba(150,95,0,0.45)';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(196, 172);
    g.quadraticCurveTo(186, 196, 198, 222);
    g.stroke();
    g.beginPath();
    g.moveTo(316, 172);
    g.quadraticCurveTo(328, 196, 316, 220);
    g.stroke();

    // rugas sob os olhos
    g.lineWidth = 3;
    g.strokeStyle = 'rgba(150,95,0,0.4)';
    for (const ex of [205, 307]) {
      g.beginPath();
      g.moveTo(ex - 16, 172);
      g.quadraticCurveTo(ex, 178, ex + 16, 172);
      g.stroke();
    }
    // rugas na testa
    g.strokeStyle = 'rgba(150,95,0,0.28)';
    g.beginPath();
    g.moveTo(200, 70);
    g.quadraticCurveTo(256, 62, 312, 70);
    g.stroke();

    // sobrancelhas grossas, determinadas
    g.fillStyle = '#151515';
    const brow = (s) => {
      g.save();
      g.translate(cx, 0);
      g.scale(s, 1);
      g.beginPath();
      g.moveTo(-18, 112);
      g.quadraticCurveTo(-60, 92, -104, 100);
      g.lineTo(-108, 88);
      g.quadraticCurveTo(-60, 76, -16, 98);
      g.closePath();
      g.fill();
      g.restore();
    };
    brow(1);
    brow(-1);

    // olhos
    for (const ex of [205, 307]) {
      g.fillStyle = '#121212';
      g.beginPath();
      g.ellipse(ex, 145, 15, 19, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(ex + 5, 137, 5, 0, Math.PI * 2);
      g.fill();
    }

    // nariz
    g.strokeStyle = 'rgba(140,85,0,0.6)';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(244, 182);
    g.quadraticCurveTo(256, 192, 268, 182);
    g.stroke();

    // sorriso de canto
    g.strokeStyle = '#141414';
    g.lineWidth = 7;
    g.beginPath();
    g.moveTo(212, 212);
    g.quadraticCurveTo(258, 236, 304, 204);
    g.stroke();
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(300, 200);
    g.lineTo(310, 206);
    g.stroke();
  });
}

// Telha cerâmica — uma "coluna" de telha por repetição
export function makeRoofTexture() {
  return canvasTex(
    64,
    64,
    (g, w, h) => {
      const img = g.createImageData(w, h);
      const R = mulberry32(3);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const v = y / h; // ao longo da cumeeira -> curvatura da telha
          const u = x / w; // ao longo da água do telhado
          const curve = 0.62 + 0.38 * Math.sin(v * Math.PI);
          const edge = Math.min(u, 1 - u) < 0.07 ? 0.72 : 1;
          const n = 0.94 + R() * 0.08;
          const k = curve * edge * n;
          const i = (y * w + x) * 4;
          img.data[i] = Math.min(255, 222 * k);
          img.data[i + 1] = Math.min(255, 104 * k);
          img.data[i + 2] = Math.min(255, 58 * k);
          img.data[i + 3] = 255;
        }
      }
      g.putImageData(img, 0, 0);
    },
    { repeat: true }
  );
}

export function makeSignTexture() {
  return canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = '#8a5a30';
    g.fillRect(0, 0, w, h);
    const R = mulberry32(11);
    for (let i = 0; i < 4; i++) {
      g.fillStyle = i % 2 ? '#94633a' : '#7f532c';
      g.fillRect(0, i * 64, w, 62);
    }
    g.strokeStyle = 'rgba(60,35,15,0.35)';
    g.lineWidth = 2;
    for (let i = 0; i < 40; i++) {
      const y = R() * h;
      g.beginPath();
      g.moveTo(0, y);
      g.bezierCurveTo(w * 0.3, y + R() * 8 - 4, w * 0.6, y + R() * 8 - 4, w, y);
      g.stroke();
    }
    g.fillStyle = '#fff4dc';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '900 70px "Lilita One", Impact, sans-serif';
    g.fillText('SÍTIO DO', w / 2, 88);
    g.font = '900 96px "Lilita One", Impact, sans-serif';
    g.fillText('BETÃO', w / 2, 176);
  });
}

export function makeNoteTexture(char, color) {
  return canvasTex(64, 64, (g) => {
    g.font = 'bold 54px "Nunito", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 6;
    g.strokeStyle = 'rgba(0,0,0,0.35)';
    g.strokeText(char, 32, 34);
    g.fillStyle = color;
    g.fillText(char, 32, 34);
  });
}

export function makeGlowTexture() {
  return canvasTex(64, 64, (g) => {
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.25, 'rgba(255,255,255,0.6)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
  });
}
