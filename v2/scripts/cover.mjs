// Gera public/cover.jpg (imagem de compartilhamento) a partir da cena do título
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 630 });
await page.goto('http://localhost:5190/?hq', { waitUntil: 'load' });
await page.waitForSelector('#title.ready', { timeout: 120000 });
await page.addStyleTag({ content: '.title-keys,.credit,.loading,.load-track,.tagline,.btn.play{display:none!important} .title-card{transform:scale(0.92);transform-origin:left center}' });
await new Promise((r) => setTimeout(r, 7000));
await page.screenshot({ path: process.argv[2] || 'public/cover.jpg', type: 'jpeg', quality: 86 });
await browser.close();
