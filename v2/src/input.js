export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.pressed = new Set();
    this.orbit = { dx: 0, dy: 0 };
    this.wheel = 0;
    this.pointerHeld = false;
    this.joy = { x: 0, y: 0, id: null, cx: 0, cy: 0 };
    this.touchUI = false;
    this.enabled = true;

    const block = new Set(['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
    window.addEventListener('keydown', (e) => {
      if (block.has(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.pointerHeld = false;
    });

    // mouse/toque na tela -> orbitar câmera; clique curto -> "Click"
    const drag = new Map();
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      drag.set(e.pointerId, { x: e.clientX, y: e.clientY, moved: 0, t: performance.now() });
      if (e.pointerType === 'mouse' && e.button === 0) this.pointerHeld = true;
    });
    canvas.addEventListener('pointermove', (e) => {
      const d = drag.get(e.pointerId);
      if (!d) return;
      const dx = e.clientX - d.x, dy = e.clientY - d.y;
      d.x = e.clientX;
      d.y = e.clientY;
      d.moved += Math.abs(dx) + Math.abs(dy);
      const k = e.pointerType === 'touch' ? 1.4 : 1;
      this.orbit.dx += dx * k;
      this.orbit.dy += dy * k;
    });
    const up = (e) => {
      const d = drag.get(e.pointerId);
      if (d && d.moved < 6 && performance.now() - d.t < 350) this.pressed.add('Click');
      drag.delete(e.pointerId);
      if (e.pointerType === 'mouse') this.pointerHeld = false;
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.wheel += e.deltaY;
    }, { passive: false });
  }

  // controles de toque (joystick + botões)
  bindTouch(joyEl, knobEl, buttons) {
    this.touchUI = true;
    const radius = 46;
    joyEl.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      joyEl.setPointerCapture(e.pointerId);
      const r = joyEl.getBoundingClientRect();
      this.joy.id = e.pointerId;
      this.joy.cx = r.left + r.width / 2;
      this.joy.cy = r.top + r.height / 2;
      move(e);
    });
    const move = (e) => {
      if (this.joy.id !== e.pointerId) return;
      let dx = e.clientX - this.joy.cx, dy = e.clientY - this.joy.cy;
      const len = Math.hypot(dx, dy);
      if (len > radius) {
        dx *= radius / len;
        dy *= radius / len;
      }
      knobEl.style.transform = `translate(${dx}px, ${dy}px)`;
      this.joy.x = dx / radius;
      this.joy.y = -dy / radius;
    };
    joyEl.addEventListener('pointermove', move);
    const end = (e) => {
      if (this.joy.id !== e.pointerId) return;
      this.joy.id = null;
      this.joy.x = this.joy.y = 0;
      knobEl.style.transform = '';
    };
    joyEl.addEventListener('pointerup', end);
    joyEl.addEventListener('pointercancel', end);

    for (const [el, code] of buttons) {
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        el.setPointerCapture(e.pointerId);
        this.keys.add(code);
        this.pressed.add(code);
        el.classList.add('down');
      });
      const rel = () => {
        this.keys.delete(code);
        el.classList.remove('down');
      };
      el.addEventListener('pointerup', rel);
      el.addEventListener('pointercancel', rel);
    }
  }

  down(...codes) {
    return codes.some((c) => this.keys.has(c));
  }
  hit(...codes) {
    return codes.some((c) => this.pressed.has(c));
  }
  axis() {
    let x = 0, y = 0;
    if (this.down('KeyD', 'ArrowRight')) x += 1;
    if (this.down('KeyA', 'ArrowLeft')) x -= 1;
    if (this.down('KeyW', 'ArrowUp')) y += 1;
    if (this.down('KeyS', 'ArrowDown')) y -= 1;
    x += this.joy.x;
    y += this.joy.y;
    const l = Math.hypot(x, y);
    if (l > 1) {
      x /= l;
      y /= l;
    }
    return { x, y, mag: Math.min(l, 1) };
  }
  get actionHeld() {
    return this.down('KeyE', 'Space', 'Enter') || this.pointerHeld;
  }
  get actionHit() {
    return this.hit('KeyE', 'Space', 'Enter', 'Click');
  }
  endFrame() {
    this.pressed.clear();
    this.orbit.dx = this.orbit.dy = 0;
    this.wheel = 0;
  }
}
