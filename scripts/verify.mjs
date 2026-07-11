import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const url = process.argv[2] ?? 'http://localhost:4325';
const viewports = [
  [390, 844],
  [768, 1024],
  [1440, 900],
];
mkdirSync('shots', { recursive: true });

const problems = [];
const browser = await chromium.launch();
try {
  for (const [width, height] of viewports) {
    const page = await browser.newPage({ viewport: { width, height } });
    try {
      page.on('console', (m) => {
        if (m.type() === 'error') problems.push(`${width}px console: ${m.text()}`);
      });
      page.on('pageerror', (e) => problems.push(`${width}px pageerror: ${e.message}`));
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.waitForTimeout(2500); // let load-in choreography finish

      const mountainLoaded = await page
        .locator('.mountain-stage img')
        .evaluate((img) => img.naturalWidth > 0)
        .catch(() => false);
      if (!mountainLoaded) {
        problems.push(`${width}px: .mountain-stage img missing or failed to load`);
      }
      const overflow = await page.evaluate(
        () => document.scrollingElement.scrollWidth - window.innerWidth
      );
      if (overflow > 0) problems.push(`${width}px: horizontal overflow ${overflow}px`);

      await page.screenshot({ path: `shots/${width}-hero.png` });
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `shots/${width}-tease.png` });
    } catch (e) {
      problems.push(`${width}px: exception: ${e.message}`);
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
}

if (problems.length > 0) {
  console.error('VERIFY FAIL\n' + problems.join('\n'));
  process.exit(1);
}
console.log('VERIFY PASS — review shots/*.png before committing');
