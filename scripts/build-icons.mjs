// Renders the extension icons into public/icon/ at the sizes Chrome asks for:
// the full cat (icon.svg) at 48 and 128, and just its face at 16 and 32.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { CAT_FACE } from '../lib/cat-icon.ts';
import { findChromium } from './chromium.mjs';

// The Chrome Web Store asks for 96px of artwork inside the 128px icon.
const STORE_PADDING = 16;
const outDir = fileURLToPath(new URL('../public/icon/', import.meta.url));

const markup = ([tag, attrs, children = []]) =>
  `<${tag}${Object.entries(attrs).map(([name, value]) => ` ${name}="${value}"`).join('')}>${children.map(markup).join('')}</${tag}>`;

const full = await readFile(`${outDir}icon.svg`, 'utf8');
const face = markup(CAT_FACE);
const icons = [
  { size: 16, svg: face },
  { size: 32, svg: face },
  { size: 48, svg: full },
  { size: 128, svg: full, padding: STORE_PADDING },
];

const browser = await chromium.launch({ executablePath: findChromium() });
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const { size, svg, padding = 0 } of icons) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`
    <body style="margin:0;background:transparent">
      <div style="box-sizing:border-box;width:${size}px;height:${size}px;padding:${padding}px;display:flex">${svg}</div>
    </body>`);
  await page.screenshot({ path: `${outDir}${size}.png`, omitBackground: true });
}
await browser.close();
console.log(`Wrote ${icons.length} icons to public/icon/`);
