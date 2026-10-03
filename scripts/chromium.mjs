// Locates a Chromium that can load unpacked extensions (branded Chrome no longer can).
// Set CHROME_PATH, or install one with `npx playwright-core install chromium`.
import { existsSync, readdirSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';

const BINARIES = [
  'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  'chrome-mac/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  'chrome-mac/Chromium.app/Contents/MacOS/Chromium',
  'chrome-linux/chrome',
  'chrome-linux64/chrome',
  'chrome-win/chrome.exe',
  'chrome-win64/chrome.exe',
];

export function findChromium() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const cache =
    process.env.PLAYWRIGHT_BROWSERS_PATH ??
    {
      darwin: join(homedir(), 'Library/Caches/ms-playwright'),
      win32: join(homedir(), 'AppData/Local/ms-playwright'),
    }[platform()] ??
    join(homedir(), '.cache/ms-playwright');

  const builds = existsSync(cache)
    ? readdirSync(cache).filter((name) => /^chromium-\d+$/.test(name)).sort().reverse()
    : [];
  for (const build of builds) {
    for (const binary of BINARIES) {
      const path = join(cache, build, binary);
      if (existsSync(path)) return path;
    }
  }
  throw new Error('No Chromium found. Set CHROME_PATH or run `npx playwright-core install chromium`.');
}
