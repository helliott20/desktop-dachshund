// Screenshot a local HTML file with headless Chromium: node tools/shot.js in.html out.png [width]
const { chromium } = require('playwright-core');
const path = require('path');
(async () => {
  const [, , file, out, width = '1300'] = process.argv;
  const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
  const page = await browser.newPage({ viewport: { width: Number(width), height: 800 } });
  page.on('pageerror', (e) => { console.error('PAGE ERROR', e.message); process.exitCode = 1; });
  await page.goto('file://' + path.resolve(file));
  await page.waitForTimeout(300);
  await page.screenshot({ path: out, fullPage: true });
  await browser.close();
})();
