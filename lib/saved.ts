import type { SavedWord } from './types';

const KEY = 'savedWords';

export async function loadSaved(): Promise<SavedWord[]> {
  const stored = await chrome.storage.local.get(KEY);
  return (stored[KEY] as SavedWord[] | undefined) ?? [];
}

export async function saveWord(word: SavedWord): Promise<void> {
  const words = (await loadSaved()).filter((w) => w.hanzi !== word.hanzi);
  words.unshift(word);
  await chrome.storage.local.set({ [KEY]: words });
}

export async function removeWord(hanzi: string): Promise<void> {
  const words = (await loadSaved()).filter((w) => w.hanzi !== hanzi);
  await chrome.storage.local.set({ [KEY]: words });
}

export function toCsv(words: SavedWord[]): string {
  const cell = (value: string | number | undefined) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const rows = words.map((w) => [w.hanzi, w.pinyin, w.gloss, w.hsk, w.sentence, w.en].map(cell).join(','));
  return ['Word,Pinyin,Meaning,HSK,Sentence,Translation', ...rows].join('\r\n');
}
