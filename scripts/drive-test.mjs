// Teste da Strada: node scripts/drive-test.mjs <pasta>
import puppeteer from 'puppeteer-core';
const OUT = process.argv[2] || '.';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1200,800'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 800 });
const logs = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push('[pageerror] ' + e.message));
await page.goto(process.env.GAME_URL || 'http://localhost:5179/', { waitUntil: 'networkidle0' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 1500));
await page.click('#play');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = (fn, ...a) => page.evaluate(fn, ...a);
const k = page.keyboard;
const state = async (tag) => console.log(tag, await ev(() => { const s = window.__game.strada; return JSON.stringify({ x: +s.pos.x.toFixed(2), z: +s.pos.z.toFixed(2), yaw: +s.yaw.toFixed(2), v: +s.speed.toFixed(1), gate: window.__game.world.gate.open, st: window.__game.player.state }); }));
await wait(3000);
await ev(() => { const g = window.__game; g.setHour(14); g.player.pos.set(7.5, 0, 14.5); g.rig.yaw = -0.9; g.rig.pitch = 0.35; g.rig.dist = 9; });
await wait(1500);
await page.screenshot({ path: `${OUT}/d0-parked.png` });
// chega perto e entra com E
await ev(() => { const g = window.__game; const d = g.strada.toWorld(1.4, 0.1); g.player.pos.set(d.x, 0, d.z); });
await wait(400);
await page.screenshot({ path: `${OUT}/d1-prompt.png` });
await k.press('KeyE');
await wait(1500);
await state('in car');
await page.screenshot({ path: `${OUT}/d2-incar.png` });
// acelera rumo ao portão
await k.down('KeyW');
await wait(1100);
await state('t1.1');
await page.screenshot({ path: `${OUT}/d3-gate.png` });
await wait(700);
await state('t1.8');
// vira à direita (oeste) na estrada... dir = D
await k.down('KeyD');
await wait(900);
await k.up('KeyD');
await state('turned');
await wait(1500);
await state('road');
await page.screenshot({ path: `${OUT}/d4-road.png` });
await k.press('KeyQ');
await wait(1200);
await k.up('KeyW');
await k.down('KeyS');
await wait(1200);
await k.up('KeyS');
await state('braked');
await page.screenshot({ path: `${OUT}/d5-brake.png` });
// noite
await ev(() => window.__game.setHour(21));
await k.down('KeyW');
await wait(1200);
await k.up('KeyW');
await page.screenshot({ path: `${OUT}/d6-night.png` });
await wait(2500);
await state('stopped');
await k.press('KeyE');
await wait(800);
await state('exited');
await page.screenshot({ path: `${OUT}/d7-exit.png` });
console.log('ach', await ev(() => JSON.stringify(Object.keys(window.__game.save.ach))));
console.log(logs.join('\n') || 'NO ERRORS');
await browser.close();
