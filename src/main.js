import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import '@fontsource/lilita-one/400.css';
import '@fontsource/nunito/600.css';
import '@fontsource/nunito/700.css';
import '@fontsource/nunito/800.css';
import '@fontsource/nunito/900.css';
import './style.css';

import { RIVER, riverCenter, FENCE_Z, GATE, PED_GATE, clamp, HOUSE_BOX } from './config.js';
import { buildTerrain, buildWater } from './terrain.js';
import { buildWorld } from './world.js';
import { Sky } from './sky.js';
import { Player } from './player.js';
import { CameraRig } from './camera.js';
import { Input } from './input.js';
import { AudioEngine, DANCE_NAMES } from './audio.js';
import { FX } from './fx.js';
import { Fishing, FISH, rarityOf, makeFishMesh } from './fishing.js';
import { Coconuts } from './coconuts.js';
import { Life } from './life.js';
import { Strada } from './strada.js';
import { UI } from './ui.js';
import { loadSave, writeSave, resetSave, ACHIEVEMENTS } from './save.js';

const $ = (id) => document.getElementById(id);
const V = (x, y, z) => new THREE.Vector3(x, y, z);

async function boot() {
  try {
    await Promise.all([
      document.fonts.load('400 70px "Lilita One"'),
      document.fonts.load('800 16px "Nunito"'),
    ]);
  } catch (e) { /* segue com fonte padrão */ }

  // ------------------------------------------------------------ render
  const canvas = $('game');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 900);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.3;

  const timeU = { value: 0 };
  buildTerrain(scene);
  const water = buildWater(scene);
  const world = buildWorld(scene, timeU);
  const sky = new Sky(scene);

  const lamps = world.lamps.map((l) => {
    const pl = new THREE.PointLight('#ffc977', 0, l.dist, 1.6);
    pl.position.set(l.x, l.y, l.z);
    scene.add(pl);
    return { pl, power: l.power };
  });
  const disco = new THREE.PointLight('#ff4dd2', 0, 9, 1.5);
  scene.add(disco);

  // ------------------------------------------------------------ sistemas
  const save = loadSave();
  let hour = save.hour ?? 15.5;
  const audio = new AudioEngine();
  const input = new Input(canvas);
  const fx = new FX(scene);
  const ui = new UI(camera);
  const player = new Player(scene, world, audio, fx);
  const rig = new CameraRig(camera);
  const fishing = new Fishing(scene, player, audio, fx, ui, onCatch);
  const coconuts = new Coconuts(scene, world, player, audio, fx, onCollect);
  const life = new Life(scene, world, audio, fx, player);
  const strada = new Strada(scene, world, audio, fx, save.car);
  strada.traffic = life.cars;
  life.strada = strada;
  strada.onCrash = (v, other) => {
    rig.shake = Math.min(0.8, v / 12);
    if (other) setTimeout(() => audio.honk(), 250);
    if (v > 9 && Math.random() < 0.5) say(['Eita!', 'Opa, opa!', 'Calma, Betão!'][Math.floor(Math.random() * 3)], 1.4);
  };
  ui.setStats(save);
  makeThumbs();
  const KEY = () => (input.touchUI ? '✋' : 'E');

  const isTouch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0 && innerWidth < 1100;
  if (isTouch) {
    player.touch = true;
    $('reel-hint').innerHTML = 'Segure <b>✋</b> para puxar · <b>solte</b> quando o peixe correr';
    document.body.classList.add('is-touch');
    input.bindTouch($('joy'), $('knob'), [
      [$('t-act'), 'KeyE'], [$('t-jump'), 'Space'], [$('t-dance'), 'KeyQ'], [$('t-coco'), 'KeyC'], [$('t-run'), 'ShiftLeft'],
    ]);
  }

  // ------------------------------------------------------------ conquistas
  function unlock(id) {
    if (save.ach[id]) return;
    save.ach[id] = Date.now();
    const a = ACHIEVEMENTS.find((x) => x.id === id);
    if (a) {
      setTimeout(() => {
        ui.achievement(a);
        audio.achievement();
      }, 600);
    }
    persist();
  }
  function persist() {
    save.hour = hour;
    // a Strada fica onde foi deixada (se estiver dentro do sítio)
    if (strada && strada.pos.z < 17) save.car = { x: +strada.pos.x.toFixed(2), z: +strada.pos.z.toFixed(2), yaw: +strada.yaw.toFixed(3) };
    writeSave(save);
  }

  function say(text, dur = 2.4) {
    ui.bubble(text, () => {
      // na 1ª pessoa o balão aparece no pára-brisa, à frente do Betão
      if (fpOn()) {
        const w = strada.toWorld(0.42, 3.2);
        return V(w.x, strada.pos.y + 1.95, w.z);
      }
      return player.pos.clone().setY(player.pos.y + 2.35);
    }, dur);
  }

  function onCatch(f, size) {
    const rec = save.fish[f.id] || { count: 0, best: 0 };
    const record = size > rec.best && rec.count > 0;
    rec.count++;
    rec.best = Math.max(rec.best, size);
    save.fish[f.id] = rec;
    const r = rarityOf(f);
    if (!f.junk) save.fishTotal++;
    ui.setStats(save);
    ui.bump('fish');
    if (f.junk) {
      ui.toast(`Você pescou... um <b>${f.name}</b>! <span class="tag junk">${r.label}</span>`, 'catch');
      say('Ué... é o meu chinelo?!');
      unlock('chinelo');
    } else {
      ui.toast(`Você pescou ${f.fem ? 'uma' : 'um'} <b>${f.name}</b> de <b>${size} cm</b>! <span class="tag ${r.cls}">${r.label}</span>${record ? '<br>🏅 Novo recorde!' : ''}`, f.w < 6 ? 'catch rare' : 'catch');
      const lines = f.w < 6 ? ['QUE BRUTO!!', 'Ninguém vai acreditar!', 'Esse vai pra foto!'] : size > (f.min + f.max) / 2 ? ['Olha o tamanho disso!', 'Hoje tem peixe frito!', 'Esse é dos bons!'] : ['Pequenininho, mas vale!', 'Opa! Veio!', 'Pro tira-gosto!'];
      say(lines[Math.floor(Math.random() * lines.length)]);
      unlock('firstFish');
      if (save.fishTotal >= 10) unlock('fish10');
      if (f.id === 'dourado') unlock('dourado');
      if (hour < 5.5 || hour > 19.3) unlock('nightFish');
      if (FISH.filter((x) => !x.junk).every((x) => save.fish[x.id])) unlock('allFish');
    }
    rig.shake = f.w < 6 ? 0.6 : 0.25;
    persist();
  }

  function onCollect(golden) {
    const n = golden ? 3 : 1;
    save.coconuts += n;
    save.coconutsTotal += n;
    if (golden) {
      save.golden++;
      ui.toast('🌟 <b>Coco dourado!</b> Vale por 3!', 'catch rare');
      unlock('cocoGold');
    } else if (save.coconutsTotal === 1) {
      ui.toast(`Pegou um coco! Aperte <b>${input.touchUI ? '🥥' : 'C'}</b> para beber a água.`, 'hint');
    }
    ui.setStats(save);
    ui.bump('coco');
    if (save.coconutsTotal >= 10) unlock('coco10');
    persist();
  }

  function drink() {
    if (save.coconuts <= 0) {
      ui.toast('Sem coco! Sacuda um coqueiro primeiro.', 'miss');
      return;
    }
    save.coconuts--;
    save.drinks++;
    ui.setStats(save);
    player.startDrink();
    setTimeout(() => audio.gulp(), 300);
    setTimeout(() => {
      player.boost = 25;
      say('Ahhh, geladinha!');
      fx.sparkle(player.pos.clone().setY(player.pos.y + 1.6), '#d6ffb0', 12);
    }, 1800);
    unlock('drink');
    persist();
  }

  // ------------------------------------------------------------ dança
  let danceStyle = save.lastDance || 0;
  function startDance(next) {
    if (next) danceStyle = (danceStyle + 1) % 3;
    save.lastDance = danceStyle;
    player.startDance(danceStyle);
    audio.startMusic(danceStyle);
    ui.setDance(DANCE_NAMES[danceStyle]);
    if (!save.dances.includes(danceStyle)) save.dances.push(danceStyle);
    if (save.dances.length >= 3) unlock('allDances');
  }

  // ------------------------------------------------------------ portão
  function toggleGate() {
    const g = world.gate;
    if (g.open) {
      const p = player.pos;
      if (p.x > GATE.x0 - 0.3 && p.x < GATE.x1 + 0.3 && Math.abs(p.z - FENCE_Z) < 0.7) {
        ui.toast('Saia da frente do portão primeiro!', 'hint');
        return;
      }
    }
    setGate(!g.open);
  }
  function togglePedGate() {
    const g = world.pedGate;
    if (g.open) {
      const p = player.pos;
      if (p.x > PED_GATE.x0 - 0.3 && p.x < PED_GATE.x1 + 0.3 && Math.abs(p.z - FENCE_Z) < 0.7) {
        ui.toast('Saia da frente do portãozinho primeiro!', 'hint');
        return;
      }
    }
    g.open = !g.open;
    g.collider.active = !g.open;
    audio.gate(g.open);
  }
  function setGate(open) {
    const g = world.gate;
    g.open = open;
    g.collider.active = !open;
    for (const b of g.leafBoxes) b.active = open;
    audio.gate(open);
  }

  // ------------------------------------------------------------ Strada
  let camSaved = null, orbitHold = 0, autoGate = false;
  let fpv = !!save.fpv; // visão de 1ª pessoa ao dirigir (fica salva)
  const fpOn = () => fpv && player.state === 'driving';
  const helpHTML = $('help').innerHTML;
  const DRIVE_HELP = `<div><span class="k">W/S</span> acelerar / ré <span class="k">A/D</span> virar <span class="k">Espaço</span> freio de mão</div>
    <div><span class="k">V</span> 1ª / 3ª pessoa <span class="k">Q</span> buzina <span class="k">E</span> sair <span class="k">🖱 arrastar</span> olhar em volta</div>`;
  const NO_INPUT = { orbit: { dx: 0, dy: 0 }, wheel: 0 };
  function applyView() {
    strada.cockpit.setActive(fpOn(), player.char);
    $('cam-btn').innerHTML = fpv ? '🎥 <span>3ª pessoa</span>' : '👀 <span>1ª pessoa</span>';
    if (!fpOn() && camera.near !== 0.1) {
      camera.near = 0.1;
      camera.updateProjectionMatrix();
    }
  }
  function setView(on) {
    if (on === fpv) return;
    fpv = on;
    save.fpv = on;
    audio.ui();
    // corte rápido com fade, como troca de câmera de jogo de corrida
    const fade = $('cam-fade');
    fade.classList.add('on');
    setTimeout(() => {
      applyView();
      fade.classList.remove('on');
    }, 140);
    if (on && !save.fpTip) {
      save.fpTip = true;
      setTimeout(() => ui.toast('Visão do motorista! Arraste o mouse pra olhar em volta. Os retrovisores funcionam 😎', 'hint'), 500);
    }
  }
  $('cam-btn').onclick = () => {
    if (player.state === 'driving') setView(!fpv);
  };
  function enterCar() {
    player.enterCar(strada);
    strada.enter();
    camSaved = { dist: rig.dist, pitch: rig.pitch };
    rig.dist = 10.5;
    rig.pitch = 0.3;
    rig.autoYaw = strada.yaw + Math.PI;
    orbitHold = 0;
    $('help').innerHTML = DRIVE_HELP;
    $('drive').classList.remove('hidden');
    $('t-dance').textContent = '📯';
    $('t-jump').textContent = '🅿️';
    applyView();
    if (!save.drove) {
      save.drove = true;
      setTimeout(() => ui.toast(`Vrum! 🛻 <b>W</b> acelera, <b>S</b> freia/ré. O portão abre sozinho quando a Strada chega perto.`, 'hint'), 900);
    }
  }
  function exitCar() {
    const spot = strada.exitSpot((x, z) => player.blocked(x, z));
    if (!spot) {
      ui.toast('Não tem espaço pra abrir a porta aqui!', 'miss');
      return;
    }
    strada.exit();
    player.exitCar(spot);
    applyView();
    if (camSaved) {
      rig.dist = camSaved.dist;
      rig.pitch = camSaved.pitch;
    }
    rig.autoYaw = null;
    $('help').innerHTML = helpHTML;
    $('drive').classList.add('hidden');
    $('t-dance').textContent = '💃';
    $('t-jump').textContent = '⤒';
    persist();
  }

  // ------------------------------------------------------------ interações
  const replies = [
    'Tô lá no rio pescando! Volta depois!',
    'Pode entrar não, o chão tá molhado!',
    'Tem café na garrafa térmica, viu?',
    'Quem é?? ... Ah, é o Betão!',
    'Traz uns coco aí pra gente!',
  ];
  function findInteraction() {
    const p = player.pos;
    if (player.state === 'sitting') return { label: 'Levantar', pos: V(p.x, p.y + 2.6, p.z), act: () => player.standUp() };
    if (player.state === 'lying') return { label: 'Levantar da rede', pos: V(p.x, p.y + 1.55, p.z), act: () => player.getUp(camera.position) };
    if (player.state === 'driving') {
      if (Math.abs(strada.speed) > 1.2) return null;
      const ahead = strada.toWorld(0.42, 3);
      return { label: 'Sair da Strada', pos: fpOn() ? V(ahead.x, 1.25, ahead.z) : V(strada.pos.x, 2.9, strada.pos.z), act: exitCar };
    }
    if (player.state !== 'free' || !player.grounded) return null;
    let best = null, bd = Infinity;
    const cand = (d, max, item) => {
      if (d < max && d < bd) {
        bd = d;
        best = item;
      }
    };
    const dist = (x, z) => Math.hypot(p.x - x, p.z - z);
    for (const b of world.benches) {
      cand(Math.min(dist(b.front.x, b.front.z), dist(b.x, b.z)), 1.5, {
        label: 'Sentar no banco', pos: V(b.x, b.seatTop + 1.3, b.z),
        act: () => {
          player.sit(b);
          if (!save.benches.includes(b.name)) save.benches.push(b.name);
          if (save.benches.length >= 3) unlock('benches');
          if (hour > 16 && hour < 18.2) ui.toast('Fique sentado: o tempo passa mais rápido ⏩', 'hint');
        },
      });
    }
    const hm = world.hammock;
    cand(dist(hm.mid.x, hm.mid.z) - 0.35, 1.3, {
      label: 'Deitar na rede', pos: V(hm.mid.x, 2.2, hm.mid.z),
      act: () => {
        player.lieDown(hm);
        audio.jump();
        if (hour > 16 && hour < 18.2) ui.toast('Deitado na rede o tempo passa mais rápido ⏩', 'hint');
      },
    });
    for (const palm of world.palms) {
      const ok = coconuts.available(palm);
      cand(dist(palm.x, palm.z), 1.6, {
        label: ok ? 'Sacudir o coqueiro' : 'Sem coco maduro ainda', disabled: !ok, pos: V(palm.x, 2.6, palm.z),
        act: () => coconuts.shake(palm),
      });
    }
    {
      const dl = strada.toWorld(1.2, 0.1), dr = strada.toWorld(-1.2, 0.1);
      cand(Math.min(dist(dl.x, dl.z), dist(dr.x, dr.z), dist(strada.pos.x, strada.pos.z) - 1.0), 1.5, {
        label: 'Dirigir a Strada', pos: V(strada.pos.x, 2.9, strada.pos.z), act: enterCar,
      });
    }
    const g = world.gate;
    cand(dist(g.x, FENCE_Z) + 0.2, 2.3, { label: g.open ? 'Fechar o portão' : 'Abrir o portão', pos: V(g.x, 2.2, FENCE_Z), act: toggleGate });
    const pg = world.pedGate;
    cand(dist(pg.x, FENCE_Z), 1.6, { label: pg.open ? 'Fechar o portãozinho' : 'Abrir o portãozinho', pos: V(pg.x, 2.2, FENCE_Z), act: togglePedGate });
    cand(dist(world.door.x, world.door.z), 1.8, {
      label: 'Chamar: “Ô de casa!”', pos: V(world.door.x + 0.6, 2.6, world.door.z),
      act: () => {
        player.faceTowards(15, 1.75);
        player.startShout();
        audio.shout();
        say('Ô de casaaa!', 1.6);
        setTimeout(() => {
          audio.reply();
          ui.bubble(replies[Math.floor(Math.random() * replies.length)], () => V(15, 3.3, 1.75), 3.2, 'house');
        }, 1500);
        unlock('knock');
      },
    });
    cand(dist(world.sign.x, world.sign.z), 1.9, {
      label: 'Ler a placa', pos: V(world.sign.x, 2.6, world.sign.z),
      act: () => {
        ui.toast('🪧 <b>SÍTIO DO BETÃO</b><br><i>“Aqui o tempo passa devagar. Proibido estressar.”</i>', 'info');
        unlock('explorer');
      },
    });
    if (!best && Math.abs(p.z - riverCenter(p.x)) < RIVER.hw + 5) {
      const spot = fishing.findSpot();
      if (spot) best = { label: 'Pescar', pos: V(p.x, p.y + 2.5, p.z), act: () => fishing.start(spot, hour) };
    }
    return best;
  }

  // ------------------------------------------------------------ UI: botões
  let paused = false;
  let journalTab = 'fish';
  const journal = $('journal'), pause = $('pause');
  function openJournal(open = journal.classList.contains('hidden')) {
    journal.classList.toggle('hidden', !open);
    if (open) ui.renderJournal(save, journalTab);
    audio.ui();
  }
  function openPause(open = pause.classList.contains('hidden')) {
    pause.classList.toggle('hidden', !open);
    $('p-sound').textContent = `Som: ${audio.muted ? 'desligado' : 'ligado'}`;
    audio.ui();
  }
  function toggleSound() {
    audio.setMuted(!audio.muted);
    $('btn-sound').textContent = audio.muted ? '🔇' : '🔊';
    $('p-sound').textContent = `Som: ${audio.muted ? 'desligado' : 'ligado'}`;
  }
  $('btn-journal').onclick = () => openJournal();
  $('btn-sound').onclick = toggleSound;
  $('btn-pause').onclick = () => openPause();
  $('p-resume').onclick = () => openPause(false);
  $('p-sound').onclick = toggleSound;
  $('p-help').onclick = () => $('help').classList.toggle('hidden');
  $('p-reset').onclick = () => {
    if (confirm('Apagar todo o progresso do Betão?')) {
      resetSave();
      location.reload();
    }
  };
  journal.querySelectorAll('.tab').forEach((t) => (t.onclick = () => {
    journalTab = t.dataset.tab;
    ui.renderJournal(save, journalTab);
    audio.ui();
  }));
  document.querySelectorAll('[data-close]').forEach((b) => (b.onclick = () => openJournal(false)));
  journal.addEventListener('pointerdown', (e) => e.target === journal && openJournal(false));
  pause.addEventListener('pointerdown', (e) => e.target === pause && openPause(false));

  addEventListener('resize', () => {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  });

  // ------------------------------------------------------------ miniaturas dos peixes
  function makeThumbs() {
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.setSize(220, 130);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NeutralToneMapping;
    const sc = new THREE.Scene();
    sc.add(new THREE.HemisphereLight('#ffffff', '#8a7a60', 2.2));
    const dl = new THREE.DirectionalLight('#ffffff', 2.4);
    dl.position.set(2, 3, 1);
    sc.add(dl);
    const cam = new THREE.PerspectiveCamera(30, 220 / 130, 0.1, 20);
    cam.position.set(2.1, 0.5, 0);
    cam.lookAt(0, 0, 0);
    for (const f of FISH) {
      const m = makeFishMesh(f, 1);
      m.scale.multiplyScalar(f.junk ? 1.4 : 1.15 / f.size);
      m.rotation.set(0, f.junk ? 0.5 : 0, f.junk ? -1.0 : 0.12);
      sc.add(m);
      r.render(sc, cam);
      ui.thumbs[f.id] = r.domElement.toDataURL();
      sc.remove(m);
    }
    r.dispose();
    r.forceContextLoss();
  }

  // ------------------------------------------------------------ título
  let started = false;
  const playBtn = $('play');
  sky.update(hour, player.pos, camera);
  rig.update(0.016, player.pos, input);
  renderer.compile(scene, camera);
  renderer.render(scene, camera);
  $('loading').textContent = '';
  playBtn.disabled = false;
  playBtn.onclick = () => {
    audio.init();
    audio.ui();
    started = true;
    $('title').classList.add('leaving');
    setTimeout(() => $('title').classList.add('hidden'), 800);
    $('hud').classList.remove('hidden');
    if (isTouch) $('touch').classList.remove('hidden');
    rig.intro = 1;
    setTimeout(() => say('Ahhh... dia de folga!', 2.6), 900);
    setTimeout(() => ui.toast(`Explore o sítio! Chegue perto das coisas e aperte <b>${KEY()}</b>.`, 'hint'), 2200);
  };

  // escolhe um ângulo de câmera sem copas/casa no caminho
  function clearYaw(base, offsets) {
    let best = base + offsets[0], bestScore = Infinity;
    const f = V(player.pos.x, player.pos.y + 1.2, player.pos.z);
    const d = rig.dist * 0.8, cp = Math.cos(rig.pitch), sp = Math.sin(rig.pitch);
    offsets.forEach((o, i) => {
      const yaw = base + o;
      const cam = V(f.x + Math.sin(yaw) * cp * d, f.y + sp * d, f.z + Math.cos(yaw) * cp * d);
      let score = i * 0.15;
      for (let k = 0; k <= 10; k++) {
        const t = k / 10;
        const x = cam.x + (f.x - cam.x) * t, y = cam.y + (f.y - cam.y) * t, z = cam.z + (f.z - cam.z) * t;
        for (const c of world.canopies) {
          const dx = x - c.x, dy = (y - c.y) * 1.35, dz = z - c.z;
          if (dx * dx + dy * dy + dz * dz < c.r * c.r) score += 1;
        }
        if (x > HOUSE_BOX.x0 && x < HOUSE_BOX.x1 && z > HOUSE_BOX.z0 && z < HOUSE_BOX.z1 + 0.5 && y < 6) score += 3;
      }
      if (score < bestScore) {
        bestScore = score;
        best = yaw;
      }
    });
    return best;
  }

  // ------------------------------------------------------------ loop
  let time = 0, last = performance.now(), saveT = 0, prevState = 'free', danceAcc = 0, lastNight = 0;
  const clock = { fast: false };

  function step(dt) {
    time += dt;
    timeU.value = time;

    // hora do dia
    const prevHour = hour;
    clock.fast = (player.state === 'sitting' || player.state === 'lying') && player.stateT > 1.2;
    hour = (hour + (dt / 90) * (clock.fast ? 16 : 1)) % 24;
    if (player.state === 'sitting' && prevHour < 18.2 && hour >= 18.2) unlock('sunset');

    // teclas globais
    if (input.hit('KeyJ', 'Tab')) openJournal();
    if (input.hit('KeyM')) toggleSound();
    if (input.hit('KeyH')) $('help').classList.toggle('hidden');
    if (input.hit('Escape')) {
      if (player.state === 'sitting') player.standUp();
      else if (player.state === 'lying') player.getUp(camera.position);
      else if (player.state === 'dancing') player.setState('free');
      else if (!fishing.active) openPause(true);
    }

    // interação
    const it = findInteraction();
    ui.setPrompt(it, input.touchUI);
    if (it && !it.disabled && input.hit('KeyE', 'Enter')) {
      it.act();
      audio.ui();
    }
    if (input.hit('KeyQ')) {
      if (player.state === 'driving') audio.carHorn();
      else if (player.state === 'free' && player.grounded) startDance(false);
      else if (player.state === 'dancing') startDance(true);
    }
    if (input.hit('KeyV') && player.state === 'driving') setView(!fpv);
    if (input.hit('KeyC') && player.state === 'free' && player.grounded) drink();

    fishing.update(dt, input, hour);
    strada.update(dt, input, lastNight);
    if (player.state === 'driving') {
      // portão com controle remoto
      const g = world.gate;
      const gd = Math.hypot(strada.pos.x - g.x, strada.pos.z - FENCE_Z);
      if (gd < 6.5 && !g.open) {
        setGate(true);
        autoGate = true;
      } else if (autoGate && g.open && gd > 9.5) {
        setGate(false);
        autoGate = false;
      }
      if (strada.onRoad) unlock('drive');
      $('speedo').textContent = Math.round(Math.abs(strada.speed) * 3.6);
    }
    player.camYaw = rig.yaw;
    player.update(dt, input, rig);
    coconuts.update(dt, time);
    world.hammock.update(dt, time);
    if (player.state === 'lying') {
      if (player.stateT > 8 && player.stateT - dt <= 8) say('Zzz...', 3);
      if (player.stateT > 20) unlock('hammock');
    }

    // saída da dança
    if (prevState === 'dancing' && player.state !== 'dancing') {
      audio.stopMusic();
      ui.setDance(null);
    }
    if (player.state === 'dancing') {
      save.dance += dt;
      danceAcc += dt;
      if (danceAcc > 0.35) {
        danceAcc = 0;
        fx.note(player.pos.clone().add(V((Math.random() - 0.5) * 1.2, 2.2, (Math.random() - 0.5) * 1.2)));
      }
      if (save.dance >= 60) unlock('dance60');
    }
    prevState = player.state;

    // portão
    const g = world.gate;
    g.t = clamp(g.t + (g.open ? dt : -dt) * 2.2, 0, 1);
    const ge = g.t * g.t * (3 - 2 * g.t);
    for (const l of g.leaves) l.pivot.rotation.y = (l.side === 1 ? -1 : 1) * 1.55 * ge;
    const pg = world.pedGate;
    pg.t = clamp(pg.t + (pg.open ? dt : -dt) * 2.6, 0, 1);
    pg.pivot.rotation.y = 1.5 * pg.t * pg.t * (3 - 2 * pg.t);

    // câmera
    rig.zoomMul = 1;
    rig.pitchBias = 0;
    if (player.state === 'sitting') {
      rig.zoomMul = 0.82;
      rig.pitchBias = -0.22;
      if (player.stateT < 0.1) rig.autoYaw = clearYaw(player.bench.yaw + Math.PI, [0, 0.5, -0.5, 0.9, -0.9]);
    } else if (player.state === 'lying') {
      rig.zoomMul = 0.72;
      rig.pitchBias = -0.05;
      if (player.stateT < 0.1) rig.autoYaw = clearYaw(world.hammock.yaw + Math.PI / 2, [0.35, Math.PI - 0.35, 0.7, Math.PI - 0.7, 0, Math.PI]);
    } else if (player.state === 'fishing' || player.state === 'celebrate') {
      rig.zoomMul = 0.78;
      if (fishing.state === 'cast' && fishing.t < 0.05) rig.autoYaw = clearYaw(player.facing + Math.PI, [0.55, -0.55, 0.9, -0.9, 0.2]);
    } else if (player.state === 'dancing') {
      rig.zoomMul = 0.7;
      rig.pitchBias = -0.15;
      if (Math.abs(input.orbit.dx) < 0.5) rig.yaw += dt * 0.35;
    } else if (player.state === 'driving') {
      // terceira pessoa atrás da Strada; arrastar o mouse olha em volta por um tempo
      if (Math.abs(input.orbit.dx) + Math.abs(input.orbit.dy) > 0.5) orbitHold = 1.6;
      else orbitHold -= dt;
      rig.autoYaw = orbitHold > 0 ? null : strada.yaw + Math.PI;
      rig.autoK = 2.6 + Math.min(Math.abs(strada.speed), 19) * 0.12;
    } else if (input.axis().mag > 0.1) rig.autoYaw = null;
    if (player.state !== 'driving') rig.autoK = 2.2;
    let focus = player.pos;
    if (player.state === 'driving') {
      const ahead = clamp(strada.speed * 0.18, -1, 3.2);
      focus = V(strada.pos.x + Math.sin(strada.yaw) * ahead, strada.pos.y, strada.pos.z + Math.cos(strada.yaw) * ahead);
    }
    // na 1ª pessoa o rig continua seguindo o carro (pra troca de volta ser suave), mas quem manda é o cockpit
    rig.update(dt, focus, fpOn() ? NO_INPUT : input, { allowOrbit: fishing.state !== 'reel' });
    if (fpOn()) strada.cockpit.updateCamera(dt, input, camera);
    else {
      const want = 42 + (player.state === 'driving' ? Math.min(Math.abs(strada.speed), 19) / 19 * 9 : 0);
      if (Math.abs(camera.fov - want) > 0.01) {
        camera.fov = damp1(camera.fov, want, 3, dt);
        camera.updateProjectionMatrix();
      }
    }

    // círculo de visão: o que estiver entre a câmera e o Betão fica vazado
    {
      const occ = world.occ;
      camera.updateMatrixWorld();
      const f = occ.focus.value.set(player.pos.x, player.pos.y + 1.0, player.pos.z);
      const vp = f.clone().applyMatrix4(camera.matrixWorldInverse);
      occ.depth.value = -vp.z;
      const ndc = f.clone().project(camera);
      occ.ndc.value.set(ndc.x, ndc.y);
      renderer.getDrawingBufferSize(occ.res.value);
      occ.r.value = player.state === 'driving'
        ? clamp(4.4 / Math.max(rig.curDist, 1), 0.28, 0.55)
        : clamp(2.9 / Math.max(rig.curDist, 1), 0.2, 0.48);
      occ.near.value = fpOn() ? 0 : 1;
      if (fpOn()) occ.r.value = 0;
      // copas entre a câmera e o Betão ficam translúcidas
      const cp = camera.position;
      const seg = f.clone().sub(cp);
      const L = seg.length();
      seg.divideScalar(L);
      const hits = [];
      for (const c of world.canopies) {
        const t = (c.x - cp.x) * seg.x + (c.y - cp.y) * seg.y + (c.z - cp.z) * seg.z;
        if (t < -c.r || t > L - 0.3) continue;
        const tt = clamp(t, 0, L);
        const dx = cp.x + seg.x * tt - c.x, dy = (cp.y + seg.y * tt - c.y) * 1.35, dz = cp.z + seg.z * tt - c.z;
        if (dx * dx + dy * dy + dz * dz < c.r * c.r) hits.push([t, c]);
      }
      hits.sort((a, b) => a[0] - b[0]);
      occ.canN.value = fpOn() ? 0 : Math.min(hits.length, 6);
      for (let i = 0; i < occ.canN.value; i++) {
        const c = hits[i][1];
        occ.can.value[i].set(c.x, c.y, c.z, c.r * 1.15);
      }
    }

    // céu, luzes, água
    const st = sky.update(hour, player.pos, camera);
    scene.environmentIntensity = st.env;
    const n = st.night;
    lastNight = n;
    world.windowMat.emissiveIntensity = n * 1.7;
    world.lampMat.emissiveIntensity = n * 3;
    for (const l of lamps) l.pl.intensity = n * l.power;
    const wu = water.uniforms;
    wu.uTime.value = time;
    wu.uSunDir.value.copy(st.sunDir);
    wu.uSunColor.value.copy(st.sunColor).multiplyScalar(n > 0.6 ? 0.25 : 1);
    wu.uSkyColor.value.copy(st.horizon).lerp(st.top, 0.4);
    wu.uLight.value = st.light;
    wu.uNight.value = n;

    // luz de balada quando dança
    const dancing = player.state === 'dancing';
    disco.intensity = damp1(disco.intensity, dancing ? 3 + n * 14 : 0, 4, dt);
    if (disco.intensity > 0.01) {
      disco.color.setHSL((time * 0.25) % 1, 0.9, 0.55);
      disco.position.set(player.pos.x + Math.cos(time * 2) * 2.2, player.pos.y + 2.6, player.pos.z + Math.sin(time * 2) * 2.2);
    }

    life.update(dt, time, st);
    fx.update(dt);
    audio.updateAmbience(dt, { riverDist: Math.max(0, Math.abs(player.pos.z - riverCenter(player.pos.x)) - RIVER.hw), night: n });

    ui.setClock(hour, clock.fast);
    ui.setBoost(player.boost > 0);
    ui.update(dt);

    saveT += dt;
    if (saveT > 5) {
      saveT = 0;
      persist();
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    if (started) {
      paused = !journal.classList.contains('hidden') || !pause.classList.contains('hidden');
      if (paused) {
        if (input.hit('Escape', 'KeyJ', 'Tab')) {
          openJournal(false);
          openPause(false);
        }
      } else {
        step(dt);
        if (fpOn()) strada.cockpit.renderMirrors(renderer, scene);
      }
      renderer.render(scene, camera);
    }
    input.endFrame();
  }
  requestAnimationFrame(frame);
  addEventListener('beforeunload', persist);

  // gancho para testes automatizados
  window.__game = { renderer, player, fishing, coconuts, world, save, rig, setHour: (h) => (hour = h), get hour() { return hour; }, input, startDance, audio, strada, enterCar, exitCar, life };
}

function damp1(a, b, k, dt) {
  return a + (b - a) * (1 - Math.exp(-k * dt));
}

boot();
