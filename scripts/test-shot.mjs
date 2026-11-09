// Teste automatizado: abre o jogo no Chrome, captura erros e tira prints
import puppeteer from 'puppeteer-core';
const OUT = process.argv[2] || '.';
const scenario = process.argv[3] || 'basic';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1400,850'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 850 });
const logs = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push('[pageerror] ' + e.message));
await page.goto('http://localhost:5179/', { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 1500));
await page.screenshot({ path: `${OUT}/00-title.png` });
await page.click('#play');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await wait(2500);
await page.screenshot({ path: `${OUT}/01-start.png` });
const ev = (fn, ...a) => page.evaluate(fn, ...a);
if (scenario === 'tour') {
  const shots = [
    ['02-palms', -3.5, 2.5, 0.6, 3.3],
    ['03-deck', -4.9, -5.2, 0.4, 0.3],
    ['04-house', 6, 4, 0.3, -1.3],
    ['05-bridge', 2.2, -4.2, 0.5, 0.2],
  ];
  for (const [name, x, z, pitch, yaw] of shots) {
    await ev((x, z, pitch, yaw) => { const g = window.__game; g.player.pos.set(x, 0, z); g.rig.pitch = pitch; g.rig.yaw = yaw; g.rig.dist = 11; }, x, z, pitch, yaw);
    await wait(1600);
    await page.screenshot({ path: `${OUT}/${name}.png` });
  }
  await ev(() => { const g = window.__game; g.player.pos.set(1, 0, 6); g.rig.yaw = 0.2; g.rig.dist = 6; g.rig.pitch = 0.3; });
  await wait(1200);
  await page.screenshot({ path: `${OUT}/06-closeup.png` });
  await ev(() => window.__game.startDance(false));
  await wait(1500);
  await page.screenshot({ path: `${OUT}/07-dance.png` });
  await ev(() => { const g = window.__game; g.player.setState('free'); g.setHour(18.3); });
  await wait(1500);
  await page.screenshot({ path: `${OUT}/08-sunset.png` });
  await ev(() => { const g = window.__game; g.setHour(22); g.player.pos.set(6, 0, 6); g.rig.yaw = -0.6; g.rig.dist = 14; g.rig.pitch=0.45 });
  await wait(1500);
  await page.screenshot({ path: `${OUT}/09-night.png` });
}
if (scenario === 'play') {
  const k = page.keyboard;
  // rosto
  await ev(() => { const g = window.__game; g.player.pos.set(1, 0, 6); g.player.facing = 0.25; g.rig.yaw = 0; g.rig.dist = 4.2; g.rig.pitch = 0.12; });
  await wait(1800);
  await page.screenshot({ path: `${OUT}/10-face.png` });
  // pesca no deck
  await ev(() => { const g = window.__game; g.player.pos.set(-3.2, 0.32, -7.2); g.player.facing = Math.PI; g.rig.yaw = 0.3; g.rig.dist = 10; g.rig.pitch = 0.5; });
  await wait(800);
  await page.screenshot({ path: `${OUT}/11-prompt-fish.png` });
  await k.press('KeyE');
  await wait(1400);
  await page.screenshot({ path: `${OUT}/12-cast.png` });
  await ev(() => { const f = window.__game.fishing; f.waitTime = f.t + 0.05; });
  await wait(250);
  await page.screenshot({ path: `${OUT}/13-bite.png` });
  await k.press('KeyE');
  let st = '';
  for (let i = 0; i < 80; i++) {
    const running = await ev(() => window.__game.fishing.runT > 0 || window.__game.fishing.T > 70);
    if (running) { await k.up('KeyE'); await wait(150); } else { await k.down('KeyE'); await wait(150); }
    if (i === 8) await page.screenshot({ path: `${OUT}/14-reel.png` });
    st = await ev(() => window.__game.fishing.state);
    if (st !== 'reel') break;
  }
  await k.up('KeyE');
  await wait(500);
  await page.screenshot({ path: `${OUT}/15-catch.png` });
  console.log('fish state after reel:', st);
  for (let i = 0; i < 40 && (await ev(() => window.__game.player.state)) !== 'free'; i++) await wait(250);
  // coqueiro
  await ev(() => { const g = window.__game; g.player.pos.set(-1.2, 0, 0.3); g.player.facing = Math.PI; g.rig.yaw = 0.4; g.rig.dist = 9; g.rig.pitch = 0.45; });
  await wait(600);
  await k.press('KeyE');
  await wait(500);
  await page.screenshot({ path: `${OUT}/16-shake.png` });
  await wait(2500);
  const cocos = await ev(() => window.__game.coconuts.falling.map(c => [c.m.position.x, c.m.position.z]));
  if (cocos.length) await ev((x, z) => { window.__game.player.pos.set(x, 0, z); }, cocos[0][0], cocos[0][1]);
  await wait(600);
  console.log('coconuts:', await ev(() => window.__game.save.coconuts));
  await k.press('KeyC');
  await wait(900);
  await page.screenshot({ path: `${OUT}/17-drink.png` });
  await wait(1500);
  // banco
  await ev(() => { const g = window.__game; const b = g.world.benches[1]; g.player.pos.set(b.front.x, 0, b.front.z); });
  await wait(400);
  await k.press('KeyE');
  await wait(2500);
  await page.screenshot({ path: `${OUT}/18-sit.png` });
  await k.press('KeyE');
  await wait(500);
  await k.press('KeyJ');
  await wait(600);
  await page.screenshot({ path: `${OUT}/19-journal.png` });
  await k.press('KeyJ');
  await wait(300);
  // noite + dança
  await ev(() => { const g = window.__game; g.setHour(21.5); g.player.pos.set(-1, 0, 4); g.player.facing = 0.3; g.rig.yaw = 0.2; g.rig.dist = 8; g.rig.pitch = 0.35; });
  await wait(500);
  await k.press('KeyQ'); await wait(400); await k.press('KeyQ'); await wait(400); await k.press('KeyQ');
  await wait(1500);
  await page.screenshot({ path: `${OUT}/20-night-dance.png` });
  console.log('dances:', await ev(() => JSON.stringify(window.__game.save.dances)));
}
console.log('render info:', await ev(() => JSON.stringify(window.__game.renderer.info.render)));
console.log(logs.join('\n') || 'NO ERRORS');
await browser.close();
