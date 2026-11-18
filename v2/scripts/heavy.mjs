import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 850 });
await page.goto('http://localhost:5190/', { waitUntil: 'load' });
await page.waitForSelector('#title.ready', { timeout: 120000 });
const out = await page.evaluate(() => {
  const g = window.__game; const list = [];
  g.scene.traverse((o) => {
    if (!o.isMesh) return;
    const geo = o.geometry; const idx = geo.index ? geo.index.count : geo.attributes.position.count;
    const n = o.isInstancedMesh ? o.count : 1;
    list.push({ name: (o.material?.name || o.material?.type) + (o.isInstancedMesh ? ' inst' : ''), tris: (idx / 3) * n, per: idx / 3, n, cast: o.castShadow, mat: o.material?.map?.image?.width || '' });
  });
  list.sort((a, b) => b.tris - a.tris);
  return list.slice(0, 18);
});
console.table(out);
await browser.close();
