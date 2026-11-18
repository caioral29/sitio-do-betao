// Prints só do modelo da Strada: node scripts/car-shots.mjs <pasta>
import puppeteer from 'puppeteer-core';
const OUT = process.argv[2] || '.';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1000,700'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1000, height: 700 });
const logs = [];
page.on('pageerror', (e) => logs.push('[pageerror] ' + e.message));
await page.goto(process.env.GAME_URL || 'http://localhost:5179/', { waitUntil: 'networkidle0' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 1500));
await page.click('#play');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await wait(3000);
await page.evaluate(() => { document.getElementById('help').classList.add('hidden'); document.getElementById('toasts').classList.add('hidden'); });
for (const [name, dy, pitch, dist] of [['c-front', 0, 0.12, 7.5], ['c-34front', 0.75, 0.25, 8], ['c-rear', Math.PI, 0.15, 7.5], ['c-34rear', Math.PI + 0.8, 0.35, 8.5]]) {
  await page.evaluate((dy, pitch, dist) => {
    const g = window.__game; const s = g.strada; g.setHour(10);
    g.player.pos.set(s.pos.x, -0.6, s.pos.z); g.player.char.root.visible = false;
    g.rig.yaw = s.yaw + dy; g.rig.autoYaw = s.yaw + dy; g.rig.pitch = pitch; g.rig.dist = dist;
  }, dy, pitch, dist);
  await wait(1800);
  await page.screenshot({ path: `${OUT}/${name}.png` });
}
console.log(logs.join('\n') || 'NO ERRORS');
await browser.close();
