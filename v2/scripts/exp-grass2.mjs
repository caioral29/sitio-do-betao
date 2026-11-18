import puppeteer from 'puppeteer-core';
const OUT = process.argv[2];
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
await page.setViewport({ width: 700, height: 420 });
const logs = [];
page.on('console', (m) => logs.push(m.text()));
await page.goto('http://localhost:5190/?hq', { waitUntil: 'load' });
await page.waitForSelector('#title.ready', { timeout: 120000 });
await page.click('#play');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await wait(2000);
await page.evaluate(() => { const g = window.__game; g.player.pos.set(-1, 0, 3); g.rig.pitch = 0.16; g.rig.yaw = 1.45; g.rig.dist = 12; g.rig.autoYaw = null; g.setHour(17.9); });
await wait(900);
const tests = {
  pointsOff: () => { window.__game.scene.traverse((o) => { if (o.isPointLight || o.isSpotLight) o.visible = false; }); },
};
const res = await page.evaluate(() => {
  const g = window.__game; const out = [];
  g.scene.traverse((o) => { if (o.isLight) out.push(`${o.type} i=${o.intensity.toFixed(2)} vis=${o.visible}`); });
  return out;
});
console.log(res.join('\n'));
await page.evaluate(tests.pointsOff);
await wait(500);
await page.screenshot({ path: `${OUT}/pointsoff.png` });
await browser.close();
