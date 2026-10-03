import { loadSaved, removeWord, toCsv } from '@/lib/saved';
import { loadSettings, saveSettings, validateSettings } from '@/lib/settings';
import {
  TRANSLATE_PORT,
  type SavedWord,
  type Settings,
  type Token,
  type TranslateEvent,
  type TranslateRequest,
} from '@/lib/types';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const form = $<HTMLFormElement>('settings-form');
const fields = {
  baseURL: $<HTMLInputElement>('baseURL'),
  apiKey: $<HTMLInputElement>('apiKey'),
  model: $<HTMLInputElement>('model'),
  extraBody: $<HTMLTextAreaElement>('extraBody'),
  ttsModel: $<HTMLInputElement>('ttsModel'),
  ttsVoice: $<HTMLInputElement>('ttsVoice'),
};
const status = $('status');
const testButton = $<HTMLButtonElement>('test');

function setStatus(message: string, kind: 'ok' | 'error' | '' = ''): void {
  status.textContent = message;
  status.className = `status ${kind}`;
}

function readForm(): Settings {
  return {
    baseURL: fields.baseURL.value.trim(),
    apiKey: fields.apiKey.value.trim(),
    model: fields.model.value.trim(),
    extraBody: fields.extraBody.value.trim(),
    ttsModel: fields.ttsModel.value.trim(),
    ttsVoice: fields.ttsVoice.value.trim(),
  };
}

/** Validates and stores the form. Returns the settings, or null if they were rejected. */
async function save(): Promise<Settings | null> {
  const settings = readForm();
  const problem = validateSettings(settings);
  if (problem) {
    setStatus(problem, 'error');
    return null;
  }

  // Asked for before any await so it still counts as part of the click. Host
  // permissions ignore the port, and a pattern with one is rejected.
  const { protocol, hostname: host } = new URL(settings.baseURL);
  const permission = chrome.permissions
    .request({ origins: [`${protocol}//${host}/*`] })
    .catch(() => false);

  // Saved first, so the settings are kept even if the permission prompt is ignored.
  await saveSettings(settings);
  setStatus('Saved.', 'ok');
  if (!(await permission)) {
    setStatus(`Saved. Access to ${host} was not granted, so requests only work if that API allows browser calls.`);
  }
  return settings;
}

function test(): Promise<string> {
  return new Promise((resolve, reject) => {
    const words: Token[] = [];
    const port = chrome.runtime.connect({ name: TRANSLATE_PORT });
    port.onMessage.addListener((event: TranslateEvent) => {
      if (event.type === 'token' && event.token.pinyin) words.push(event.token);
      if (event.type === 'error') reject(new Error(event.message));
      if (event.type === 'done') {
        port.disconnect();
        if (words.length === 0) reject(new Error('The model replied, but not in the expected format. Try another model.'));
        else resolve(words.map((w) => `${w.text} ${w.pinyin} (${w.gloss})`).join(' · '));
      }
    });
    port.onDisconnect.addListener(() => reject(new Error('The test was interrupted.')));
    port.postMessage({ text: '你好，世界。', noCache: true } satisfies TranslateRequest);
  });
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  void save();
});

testButton.addEventListener('click', async () => {
  if (!(await save())) return;
  testButton.disabled = true;
  setStatus('Testing…');
  try {
    setStatus(`Working: ${await test()}`, 'ok');
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), 'error');
  } finally {
    testButton.disabled = false;
  }
});

$('toggle-key').addEventListener('click', (event) => {
  const show = fields.apiKey.type === 'password';
  fields.apiKey.type = show ? 'text' : 'password';
  (event.currentTarget as HTMLButtonElement).textContent = show ? 'Hide' : 'Show';
});

// Tabs
const tabs = [...document.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
for (const tab of tabs) {
  tab.addEventListener('click', () => {
    for (const other of tabs) {
      const selected = other === tab;
      other.setAttribute('aria-selected', String(selected));
      $(other.getAttribute('aria-controls')!).hidden = !selected;
    }
  });
}

// Saved words
const table = $<HTMLTableElement>('saved-table');
const rows = table.querySelector('tbody')!;
const empty = $('saved-empty');
const exportButton = $<HTMLButtonElement>('export');
let saved: SavedWord[] = [];

function cell(className: string, ...children: (Node | string)[]): HTMLTableCellElement {
  const td = document.createElement('td');
  td.className = className;
  td.append(...children);
  return td;
}

function span(className: string, text: string): HTMLSpanElement {
  const node = document.createElement('span');
  node.className = className;
  node.textContent = text;
  return node;
}

function renderSaved(): void {
  $('saved-count').textContent = saved.length ? `(${saved.length})` : '';
  empty.hidden = saved.length > 0;
  table.hidden = saved.length === 0;
  exportButton.disabled = saved.length === 0;

  rows.replaceChildren(
    ...saved.map((word) => {
      const row = document.createElement('tr');
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'secondary';
      remove.textContent = 'Remove';
      remove.setAttribute('aria-label', `Remove ${word.hanzi}`);
      remove.addEventListener('click', () => void removeWord(word.hanzi));

      const wordCell = cell('cell-word', span('hanzi', word.hanzi), span('pinyin', word.pinyin));
      if (word.hsk) wordCell.append(document.createElement('br'), span('hsk', `HSK${word.hsk}`));
      row.append(
        wordCell,
        cell('', word.gloss),
        cell('cell-sentence', span('zh', word.sentence), word.en),
        cell('', remove),
      );
      return row;
    }),
  );
}

exportButton.addEventListener('click', () => {
  // The BOM makes Excel read the file as UTF-8.
  const url = URL.createObjectURL(new Blob(['﻿', toCsv(saved)], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'mingbai-words.csv';
  link.click();
  URL.revokeObjectURL(url);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.savedWords) {
    saved = (changes.savedWords.newValue as SavedWord[] | undefined) ?? [];
    renderSaved();
  }
});

void loadSettings().then((settings) => {
  fields.baseURL.value = settings.baseURL;
  fields.apiKey.value = settings.apiKey;
  fields.model.value = settings.model;
  fields.extraBody.value = settings.extraBody;
  fields.ttsModel.value = settings.ttsModel;
  fields.ttsVoice.value = settings.ttsVoice;
});
void loadSaved().then((words) => {
  saved = words;
  renderSaved();
});
