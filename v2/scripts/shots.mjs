// Prints automáticos da v2: node scripts/shots.mjs <pasta> [cenas...]
// cenas: title, start, tour, face, night, sunset, drive, fpv, fish, dance, sit, hammock
import puppeteer from 'puppeteer-core';
const OUT = process.argv[2] || '.';
const want = new Set(process.argv.slice(3));
const all = want.size === 0;
const URL = process.env.GAME_URL || 'http://localhost:5190/?hq';
const W = +(process.env.W || 1400), H = +(process.env.H || 850);
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', `--window-size=${W},${H}`],
});
const page = await browser.newPage();
await page.setViewport({ width: W, height: H });
const logs = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push('[pageerror] ' + e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = (fn, ...a) => page.evaluate(fn, ...a);
const shot = async (name) => page.screenshot({ path: `${OUT}/${name}.png` });
const t0 = Date.now();
await page.goto(URL, { waitUntil: 'load' });
await page.waitForSelector('#title.ready', { timeout: 120000 }).catch(() => logs.push('[timeout] title not ready'));
console.log('load ms', Date.now() - t0);
await wait(1500);
if (all || want.has('title')) await shot('00-title');
await page.click('#play').catch(() => {});
await wait(2600);
if (all || want.has('start')) await shot('01-start');
const fps = await ev(() => new Promise((res) => {
  let n = 0; const s = performance.now();
  const f = () => { n++; if (performance.now() - s < 2000) requestAnimationFrame(f); else res(n / 2); };
  requestAnimationFrame(f);
}));
console.log('fps', fps);
const place = async (x, z, pitch, yaw, dist = 11, hour = null, y = 0) => {
  await ev((x, z, pitch, yaw, dist, hour, y) => {
    const g = window.__game;
    g.player.pos.set(x, y, z);
    g.rig.pitch = pitch; g.rig.yaw = yaw; g.rig.dist = dist; g.rig.autoYaw = null;
    if (hour !== null) g.setHour(hour);
  }, x, z, pitch, yaw, dist, hour, y);
};
if (all || want.has('tour')) {
  const shots = [
    ['02-palms', -3.5, 2.5, 0.55, 3.3],
    ['03-deck', -4.9, -3.6, 0.45, 0.3],
    ['04-house', 7, 4, 0.35, -1.3, 14],
    ['05-bridge', 2.2, -3.6, 0.5, 0.2],
    ['06-gate', 7, 14.5, 0.4, 0.1, 12],
    ['07-annex', 18.5, 14.8, 0.4, -0.5, 9],
    ['08-wide', 2, 4, 0.75, 0.6, 24],
  ];
  for (const [name, x, z, pitch, yaw, dist] of shots) {
    await place(x, z, pitch, yaw, dist ?? 11, 15.5);
    await wait(1500);
    await shot(name);
  }
}
if (all || want.has('sunset')) {
  await place(-1, 3, 0.16, 1.45, 12, 17.9);
  await wait(1500);
  await shot('20-sunset');
}
if (all || want.has('night')) {
  await place(8, 5, 0.42, -0.7, 15, 22);
  await wait(1500);
  await shot('21-night');
}
if (all || want.has('fish')) {
  await place(-3.2, -7.0, 0.42, 0.5, 8, 9, 0.32);
  await ev(() => { const g = window.__game; g.player.facing = Math.PI; const sp = g.fishing.findSpot(); if (sp) g.fishing.start(sp, g.hour); });
  await wait(2200);
  await shot('25-fish');
}
if (all || want.has('dance')) {
  await place(1, 5, 0.3, 0.3, 7, 15);
  await ev(() => window.__game.startDance(false));
  await wait(1400);
  await shot('30-dance');
  await ev(() => window.__game.player.setState('free'));
}
if (all || want.has('sit')) {
  await place(-3.0, 4.6, 0.3, 0.5, 6, 16);
  await ev(() => { const g = window.__game; g.player.sit(g.world.benches[0]); });
  await wait(1500);
  await shot('31-sit');
  await ev(() => window.__game.player.standUp());
}
if (all || want.has('hammock')) {
  await place(-0.4, 10.0, 0.35, 0.9, 7, 15);
  await ev(() => { const g = window.__game; g.player.lieDown(g.world.hammock); });
  await wait(2200);
  await shot('32-hammock');
  await ev(() => { const g = window.__game; g.player.getUp(g.camera.position); });
  await wait(300);
}
if (all || want.has('drink')) {
  await place(1, 5, 0.25, 0.4, 5.5, 14);
  await ev(() => { const g = window.__game; g.save.coconuts = 3; g.player.startDrink(); });
  await wait(900);
  await shot('33-drink');
  await wait(1500);
}
if (all || want.has('fpv')) {
  await ev(() => { const g = window.__game; g.player.pos.set(6, 0, 12); g.enterCar(); g.setHour(15); });
  await wait(800);
  await page.keyboard.press('KeyV');
  await wait(1500);
  await shot('42-fpv');
  await page.keyboard.press('KeyV');
  await wait(600);
  await ev(() => { const g = window.__game; g.strada.speed = 0; g.exitCar(); });
  await wait(300);
}
if (all || want.has('drive')) {
  await ev(() => { const g = window.__game; g.player.pos.set(6, 0, 12); g.enterCar(); g.setHour(15); g.rig.autoYaw = null; g.rig.yaw = g.strada.yaw + Math.PI + 0.6; });
  await wait(1800);
  await shot('40-car');
  await ev(() => { const g = window.__game; g.rig.yaw = g.strada.yaw + 2.2; g.rig.pitch = 0.25; g.rig.dist = 7; });
  await wait(1000);
  await shot('41-car-side');
}
if (all || want.has('face')) {
  await ev(() => { const g = window.__game; if (g.player.state === 'driving') { g.strada.speed = 0; g.exitCar(); } g.player.setState('free'); g.player.pos.set(1, 0, 6); g.player.facing = 0.0; g.rig.yaw = 0; g.rig.dist = 4.5; g.rig.pitch = 0.08; g.rig.autoYaw = null; g.setHour(10.5); });
  await wait(1600);
  await shot('10-face');
  await ev(() => { const g = window.__game; g.player.update = () => {}; g.player.char.root.position.set(1, 0, 6); g.player.char.root.rotation.set(0, 0.0, 0); g.rig.update = () => {}; });
  const cams = [['11-face-close', 1.0, 1.52, 6.62, 0], ['12-face-34', 1.32, 1.53, 6.52, 0], ['13-face-side', 1.55, 1.52, 6.0, 0], ['14-body', 1.0, 1.1, 8.3, 0]];
  for (const [n, x, y, z] of cams) {
    await ev((x, y, z) => { const g = window.__game; g.camera.position.set(x, y, z); g.camera.lookAt(1, y > 1.3 ? 1.5 : 0.95, 6); g.camera.fov = y > 1.3 ? 30 : 42; g.camera.updateProjectionMatrix(); }, x, y, z);
    await wait(500);
    await shot(n);
  }
}
console.log(logs.slice(0, 40).join('\n'));
await browser.close();
