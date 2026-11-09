import * as THREE from 'three';
import { FISH, rarityOf } from './fishing.js';
import { ACHIEVEMENTS } from './save.js';

const $ = (id) => document.getElementById(id);
const _v = new THREE.Vector3();

export class UI {
  constructor(camera) {
    this.camera = camera;
    this.el = {
      hud: $('hud'), prompt: $('prompt'), promptLabel: $('prompt-label'), promptKey: $('prompt-key'), marker: $('marker'),
      toasts: $('toasts'), bubbles: $('bubbles'), reel: $('reel'), reelT: $('reel-tension'), reelP: $('reel-progress'),
      reelName: $('reel-name'), reelHint: $('reel-hint'), coco: $('coco-n'), fish: $('fish-n'), clock: $('clock'),
      clockIco: $('clock-ico'), ff: $('ff'), danceTag: $('dance-tag'), ach: $('ach-pop'), journal: $('journal'),
      pause: $('pause'), title: $('title'), help: $('help'), boost: $('boost'),
    };
    this.markerFn = null;
    this.bubbleList = [];
    this.thumbs = {};
    this.promptPos = null;
  }

  project(pos) {
    _v.copy(pos).project(this.camera);
    if (_v.z > 1) return null;
    return { x: (_v.x * 0.5 + 0.5) * innerWidth, y: (-_v.y * 0.5 + 0.5) * innerHeight };
  }

  setPrompt(item, touch) {
    const p = this.el.prompt;
    if (!item) {
      p.classList.add('hidden');
      this.promptPos = null;
      return;
    }
    p.classList.remove('hidden');
    p.classList.toggle('disabled', !!item.disabled);
    if (this.el.promptLabel.textContent !== item.label) this.el.promptLabel.textContent = item.label;
    this.el.promptKey.textContent = touch ? '✋' : 'E';
    this.promptPos = item.pos;
  }

  marker(text, fn) {
    if (!text) {
      this.el.marker.classList.add('hidden');
      this.markerFn = null;
      return;
    }
    this.el.marker.textContent = text;
    this.el.marker.classList.remove('hidden');
    this.markerFn = fn;
  }

  bubble(text, posFn, dur = 2.4, cls = '') {
    const d = document.createElement('div');
    d.className = 'bubble ' + cls;
    d.innerHTML = text;
    this.el.bubbles.appendChild(d);
    this.bubbleList.push({ d, posFn, t: dur });
  }

  toast(html, kind = 'info') {
    const d = document.createElement('div');
    d.className = 'toast ' + kind;
    d.innerHTML = html;
    this.el.toasts.appendChild(d);
    while (this.el.toasts.children.length > 4) this.el.toasts.firstChild.remove();
    setTimeout(() => d.classList.add('out'), 3000);
    setTimeout(() => d.remove(), 3500);
  }

  achievement(a) {
    const el = this.el.ach;
    el.innerHTML = `<div class="ach-ico">${a.icon}</div><div><small>CONQUISTA DESBLOQUEADA</small><b>${a.name}</b><span>${a.desc}</span></div>`;
    el.classList.remove('hidden', 'out');
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(this._achT);
    this._achT = setTimeout(() => {
      el.classList.remove('show');
      el.classList.add('out');
    }, 4200);
  }

  reel(show, P = 0, T = 0, pulling = false, fish = null) {
    const r = this.el.reel;
    if (!show) {
      r.classList.add('hidden');
      return;
    }
    r.classList.remove('hidden');
    this.el.reelP.style.width = P.toFixed(1) + '%';
    this.el.reelT.style.width = T.toFixed(1) + '%';
    r.classList.toggle('pulling', pulling);
    r.classList.toggle('danger', T > 75);
    this.el.reelName.textContent = pulling ? 'O PEIXE ESTÁ PUXANDO!' : 'Puxa! Puxa!';
  }

  setStats(save) {
    this.el.coco.textContent = save.coconuts;
    this.el.fish.textContent = save.fishTotal;
  }
  bump(which) {
    const el = which === 'coco' ? this.el.coco.parentElement : this.el.fish.parentElement;
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
  }

  setClock(hour, fast) {
    const h = Math.floor(hour) % 24, m = Math.floor((hour % 1) * 60);
    const txt = `${String(h).padStart(2, '0')}:${String(Math.floor(m / 10) * 10).padStart(2, '0')}`;
    if (this.el.clock.textContent !== txt) this.el.clock.textContent = txt;
    const ico = hour >= 5.5 && hour < 17.5 ? '☀️' : hour >= 17.5 && hour < 19.2 ? '🌇' : '🌙';
    if (this.el.clockIco.textContent !== ico) this.el.clockIco.textContent = ico;
    this.el.ff.classList.toggle('hidden', !fast);
  }

  setDance(name) {
    const d = this.el.danceTag;
    if (!name) d.classList.add('hidden');
    else {
      d.classList.remove('hidden');
      d.innerHTML = `💃 <b>${name}</b> <small>Q troca o ritmo · mexa-se para parar</small>`;
    }
  }
  setBoost(on) {
    this.el.boost.classList.toggle('hidden', !on);
  }

  update(dt) {
    if (this.promptPos) {
      const s = this.project(this.promptPos);
      if (s) this.el.prompt.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -100%)`;
    }
    if (this.markerFn) {
      const s = this.project(this.markerFn());
      if (s) this.el.marker.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -100%)`;
    }
    for (let i = this.bubbleList.length - 1; i >= 0; i--) {
      const b = this.bubbleList[i];
      b.t -= dt;
      const s = this.project(b.posFn());
      if (s) b.d.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -100%)`;
      if (b.t < 0.3) b.d.classList.add('out');
      if (b.t <= 0) {
        b.d.remove();
        this.bubbleList.splice(i, 1);
      }
    }
  }

  // ------------------------------------------------------------ diário
  renderJournal(save, tab = 'fish') {
    const j = this.el.journal;
    const caughtSpecies = FISH.filter((f) => save.fish[f.id]).length;
    const achCount = ACHIEVEMENTS.filter((a) => save.ach[a.id]).length;
    let body = '';
    if (tab === 'fish') {
      body = `<div class="fish-grid">${FISH.map((f) => {
        const rec = save.fish[f.id];
        const r = rarityOf(f);
        const img = this.thumbs[f.id] ? `<img src="${this.thumbs[f.id]}" alt="" class="${rec ? '' : 'unknown'}"/>` : '';
        return `<div class="fish-card ${rec ? 'got' : 'locked'} ${r.cls}">
          <div class="thumb">${img}</div>
          <div class="fc-name">${rec ? f.name : '???'}</div>
          <div class="fc-rarity">${r.label}</div>
          <div class="fc-stats">${rec ? `${rec.count}× · recorde <b>${rec.best} cm</b>` : 'ainda não pescado'}</div>
        </div>`;
      }).join('')}</div>`;
    } else if (tab === 'ach') {
      body = `<div class="ach-list">${ACHIEVEMENTS.map((a) => `<div class="ach-item ${save.ach[a.id] ? 'got' : ''}"><span class="ai">${save.ach[a.id] ? a.icon : '🔒'}</span><div><b>${a.name}</b><small>${a.desc}</small></div></div>`).join('')}</div>`;
    } else {
      body = `<div class="stats">
        <div><span>🐟</span><b>${save.fishTotal}</b><small>peixes pescados</small></div>
        <div><span>📚</span><b>${caughtSpecies}/${FISH.length}</b><small>espécies</small></div>
        <div><span>🥥</span><b>${save.coconutsTotal}</b><small>cocos colhidos</small></div>
        <div><span>🌟</span><b>${save.golden}</b><small>cocos dourados</small></div>
        <div><span>🧃</span><b>${save.drinks}</b><small>águas de coco</small></div>
        <div><span>🕺</span><b>${Math.floor(save.dance)}s</b><small>dançando</small></div>
      </div>`;
    }
    j.querySelector('.panel-body').innerHTML = body;
    j.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === tab));
    j.querySelector('#tab-fish-count').textContent = `${caughtSpecies}/${FISH.length}`;
    j.querySelector('#tab-ach-count').textContent = `${achCount}/${ACHIEVEMENTS.length}`;
  }
}
