import puppeteer from 'puppeteer-core';
const OUT = process.argv[2];
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
await page.setViewport({ width: 700, height: 420 });
await page.goto('http://localhost:5190/?hq', { waitUntil: 'load' });
await page.waitForSelector('#title.ready', { timeout: 120000 });
await page.click('#play');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await wait(2000);
for (const h of [12, 15.5, 16.5, 17.3, 17.9]) {
  await page.evaluate((h) => { const g = window.__game; g.player.pos.set(-1, 0, 3); g.rig.pitch = 0.16; g.rig.yaw = 1.45; g.rig.dist = 12; g.rig.autoYaw = null; g.setHour(h); }, h);
  await wait(900);
  await page.screenshot({ path: `${OUT}/h${h}.png` });
}
const info = await page.evaluate(() => {
  const g = window.__game; let gm = null;
  g.scene.traverse((o) => { if (o.isInstancedMesh && o.material.map && o.material.map.image && o.material.map.image.width === 256 && o.count > 5000) gm = o; });
  return gm ? { side: gm.material.side, alphaTest: gm.material.alphaTest, color: gm.material.color.getHexString(), rough: gm.material.roughness, hasInstColor: !!gm.instanceColor, sun: g.sky.sun.position.toArray().map((v) => +v.toFixed(1)) } : 'no grass';
});
console.log(JSON.stringify(info));
await browser.close();
