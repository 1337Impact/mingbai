// End-to-end test: loads the built extension into Chromium and drives it
// against the mock API. Run with `npm run test:e2e`.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { findChromium } from '../scripts/chromium.mjs';
import { SHADOW_TEXT, startMockApi, WORD_COUNT } from './mock-api.mjs';

const extension = fileURLToPath(new URL('../.output/chrome-mv3', import.meta.url));
const shots = process.env.SHOTS_DIR;
if (shots) await mkdir(shots, { recursive: true });

const api = await startMockApi();
const profile = await mkdtemp(join(tmpdir(), 'hanzi-lens-'));
const context = await chromium.launchPersistentContext(profile, {
  executablePath: findChromium(),
  headless: process.env.HEADED !== '1',
  viewport: { width: 1000, height: 760 },
  ignoreDefaultArgs: ['--disable-extensions'],
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
});
await context.grantPermissions(['clipboard-read', 'clipboard-write']);

let failed = false;
async function step(name, run) {
  try {
    await run();
    console.log(`✔ ${name}`);
  } catch (error) {
    failed = true;
    console.log(`✖ ${name}\n  ${String(error.stack ?? error).split('\n').slice(0, 6).join('\n  ')}`);
  }
}
const shot = (page, name) => (shots ? page.screenshot({ path: join(shots, `${name}.png`) }) : null);

try {
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const extensionId = new URL(worker.url()).host;
  const setSettings = (settings) =>
    worker.evaluate((value) => chrome.storage.local.set({ settings: value }), {
      baseURL: api.baseURL,
      apiKey: 'test-key',
      model: 'mock-model',
      extraBody: '{"temperature": 0.2}',
      ...settings,
    });

  const page = await context.newPage();
  await page.goto(api.origin);
  const select = async () => {
    await page.click('#passage', { clickCount: 3 });
    await page.click('hanzi-lens .trigger');
  };

  await step('no trigger for a selection without Chinese', async () => {
    await page.click('#english', { clickCount: 3 });
    await page.waitForTimeout(150);
    assert.equal(await page.locator('hanzi-lens .trigger').count(), 0);
  });

  await step('asks for setup before settings are saved', async () => {
    await select();
    await page.waitForSelector('hanzi-lens .message');
    assert.match(await page.textContent('hanzi-lens .message'), /settings/);
    assert.equal(api.requests.length, 0);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('hanzi-lens .popup').count(), 0);
  });

  await step('streams pinyin, words and the sentence translation', async () => {
    await setSettings();
    await select();
    await page.waitForFunction(
      (count) => document.querySelector('hanzi-lens').shadowRoot.querySelectorAll('.w').length === count,
      WORD_COUNT,
    );
    assert.match(await page.textContent('hanzi-lens .en'), /^Ever since ancient times/);
    assert.equal(await page.locator('hanzi-lens .pending .p').count(), 0);
    assert.equal(await page.locator('hanzi-lens .sentence').count(), 2);
    const first = page.locator('hanzi-lens .w').first();
    assert.equal(await first.locator('.hz').textContent(), '自古以来');
    assert.deepEqual(await first.locator('.py span').allTextContents(), ['zì', 'gǔ', 'yǐ', 'lái']);
    await shot(page, '1-sentence');
  });

  await step('sends an OpenAI-style request with the configured model and extras', async () => {
    assert.equal(api.requests.length, 1);
    const { url, authorization, body } = api.requests[0];
    assert.equal(url, '/v1/chat/completions');
    assert.equal(authorization, 'Bearer test-key');
    assert.equal(body.model, 'mock-model');
    assert.equal(body.stream, true);
    assert.equal(body.temperature, 0.2);
    assert.equal(body.messages.at(-1).content, await page.textContent('#passage'));
  });

  await step('hovering another sentence shows its translation', async () => {
    await page.hover('hanzi-lens .w:has-text("只有")');
    assert.match(await page.textContent('hanzi-lens .en'), /^Only when the crops/);
  });

  await step('pressing a word shows its pinyin, meanings and HSK level', async () => {
    const word = page.locator('hanzi-lens .w:has-text("农业")');
    await word.hover();
    await page.mouse.down();
    assert.equal(await page.textContent('hanzi-lens .word-hz'), '农业');
    assert.equal(await page.textContent('hanzi-lens .word-py'), 'nóng yè');
    assert.equal(await page.textContent('hanzi-lens .hsk'), 'HSK5');
    assert.deepEqual(await page.locator('hanzi-lens .gloss').allTextContents(), ['agriculture', 'farming']);
    await page.mouse.up();
    assert.equal(await page.textContent('hanzi-lens .word-hz'), '农业');
    await shot(page, '2-word');
  });

  await step('copy puts the pressed word on the clipboard', async () => {
    await page.click('hanzi-lens [aria-label="Copy word"]');
    await page.waitForSelector('hanzi-lens [aria-label="Copied"]');
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), '农业');
    // The page's selection must survive the click.
    assert.equal(await page.evaluate(() => getSelection().toString().length > 0), true);
  });

  await step('saving a word stores it and marks it in the text', async () => {
    await page.click('hanzi-lens [aria-label="Save word"]');
    await page.waitForSelector('hanzi-lens .w.saved');
    const { savedWords } = await worker.evaluate(() => chrome.storage.local.get('savedWords'));
    assert.equal(savedWords.length, 1);
    assert.equal(savedWords[0].hanzi, '农业');
    assert.equal(savedWords[0].hsk, 5);
    assert.match(savedWords[0].sentence, /^自古以来.*工作。$/);
    assert.match(savedWords[0].en, /^Ever since/);
  });

  await step('pressing empty space returns to the sentence', async () => {
    await page.locator('hanzi-lens .text').click({ position: { x: 4, y: 4 } });
    assert.equal(await page.locator('hanzi-lens .word-hz').count(), 0);
    assert.match(await page.textContent('hanzi-lens .en'), /^Ever since ancient times/);
  });

  await step('copy puts the sentence translation on the clipboard', async () => {
    await page.click('hanzi-lens [aria-label="Copy translation"]');
    await page.waitForSelector('hanzi-lens [aria-label="Copied"]');
    assert.match(await page.evaluate(() => navigator.clipboard.readText()), /^Ever since ancient times.*people\.$/);
  });

  await step('clicking the page closes the popup', async () => {
    await page.click('h1');
    assert.equal(await page.locator('hanzi-lens .popup').count(), 0);
  });

  await step('a repeated selection is served from the cache', async () => {
    await select();
    await page.waitForFunction(
      (count) => document.querySelector('hanzi-lens').shadowRoot.querySelectorAll('.w').length === count,
      WORD_COUNT,
    );
    assert.equal(api.requests.length, 1);
    assert.equal(await page.locator('hanzi-lens .w.saved').count(), 1);
    await shot(page, '3-cached-with-saved');
    await page.keyboard.press('Escape');
  });

  for (const mode of ['open', 'closed']) {
    await step(`works for text inside ${mode} shadow DOM`, async () => {
      const before = api.requests.length;
      const box = await page.locator(`#${mode}-shadow`).boundingBox();
      await page.mouse.click(box.x + 40, box.y + box.height / 2, { clickCount: 3 });
      const trigger = page.locator('hanzi-lens .trigger');
      await trigger.waitFor();
      const at = await trigger.boundingBox();
      await trigger.click();
      await page.waitForFunction(() => document.querySelector('hanzi-lens').shadowRoot.querySelector('.pending')?.childElementCount === 0);
      assert.equal(api.requests.length, before + 1);
      assert.equal(api.requests.at(-1).body.messages.at(-1).content, SHADOW_TEXT);
      const popup = await page.locator('hanzi-lens .popup').boundingBox();
      assert.ok(Math.abs(popup.y - (box.y + box.height)) < 30, `popup at y=${popup.y}, text ends at y=${box.y + box.height}`);
      // Open roots can be measured, so the popup lines up with the text and the
      // button sits after it. Closed ones fall back to where the mouse was.
      const expectedLeft = mode === 'open' ? box.x : box.x + 40;
      assert.ok(Math.abs(popup.x - expectedLeft) < 2, `popup at x=${popup.x}, expected ${expectedLeft}`);
      const textWidth = SHADOW_TEXT.length * 18;
      const expectedTrigger = mode === 'open' ? box.x + textWidth + 6 : box.x + 46;
      assert.ok(Math.abs(at.x - expectedTrigger) < 4, `trigger at x=${at.x}, expected ${expectedTrigger}`);
      if (mode === 'open') await shot(page, '7-shadow');
      await page.keyboard.press('Escape');
    });
  }

  await step('API errors are shown with a way to settings', async () => {
    await setSettings({ apiKey: 'wrong-key' });
    await worker.evaluate(() => chrome.storage.local.remove('cache'));
    await select();
    await page.waitForSelector('hanzi-lens .message');
    assert.match(await page.textContent('hanzi-lens .message'), /401.*Invalid API key/);
    assert.equal(await page.locator('hanzi-lens .link-btn').count(), 1);
    await shot(page, '4-error');
    await page.keyboard.press('Escape');
  });

  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html`);

  await step('settings page loads stored settings and rejects bad input', async () => {
    assert.equal(await options.inputValue('#baseURL'), api.baseURL);
    assert.equal(await options.inputValue('#model'), 'mock-model');
    await options.fill('#baseURL', 'not a url');
    await options.click('button[type="submit"]');
    assert.equal(await options.textContent('#status'), 'API URL is not a valid URL.');
    await shot(options, '5-settings');
  });

  await step('saving the settings form stores it', async () => {
    await options.fill('#baseURL', 'https://api.example.com/v1/');
    await options.fill('#apiKey', 'sk-example');
    await options.fill('#model', 'qwen-test');
    await options.click('button[type="submit"]');
    // Headless Chromium never answers the host-permission prompt, so only the stored value is checked.
    await options.waitForFunction(() => document.getElementById('status').textContent.startsWith('Saved.'));
    const { settings } = await worker.evaluate(() => chrome.storage.local.get('settings'));
    assert.deepEqual(settings, {
      baseURL: 'https://api.example.com/v1/',
      apiKey: 'sk-example',
      model: 'qwen-test',
      extraBody: '{"temperature": 0.2}',
    });
  });

  await step('settings page lists saved words and removes them', async () => {
    await options.click('#tab-saved');
    assert.equal(await options.textContent('#saved-table .hanzi'), '农业');
    await shot(options, '6-saved');
    await options.click('#saved-table button');
    await options.waitForSelector('#saved-empty:not([hidden])');
  });
} finally {
  await context.close();
  api.close();
  await rm(profile, { recursive: true, force: true });
}

process.exit(failed ? 1 : 0);
