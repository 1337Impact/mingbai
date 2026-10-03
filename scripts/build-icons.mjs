// Renders the extension icons into public/icon/ at the sizes Chrome asks for.
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { findChromium } from './chromium.mjs';

const SIZES = [16, 32, 48, 128];
const outDir = fileURLToPath(new URL('../public/icon/', import.meta.url));
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ executablePath: findChromium() });
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const size of SIZES) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`
    <body style="margin:0;background:transparent">
      <div style="width:${size}px;height:${size}px;border-radius:${size * 0.24}px;background:#2f93d6;
        display:grid;place-items:center;color:#fff;
        font:500 ${size * 0.64}px/1 'PingFang SC','Noto Sans SC','Microsoft YaHei',sans-serif">明</div>
    </body>`);
  await page.screenshot({ path: `${outDir}${size}.png`, omitBackground: true });
}
await browser.close();
console.log(`Wrote ${SIZES.length} icons to public/icon/`);
