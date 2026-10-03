import type { Settings, TranslateEvent } from './types';

const KEY = 'cache';
const MAX_ENTRIES = 50;

interface Entry {
  key: string;
  events: TranslateEvent[];
}

export function cacheKey(settings: Settings, text: string): string {
  return `${settings.baseURL}\n${settings.model}\n${text}`;
}

async function load(): Promise<Entry[]> {
  const stored = await chrome.storage.local.get(KEY);
  return (stored[KEY] as Entry[] | undefined) ?? [];
}

export async function getCached(key: string): Promise<TranslateEvent[] | null> {
  return (await load()).find((entry) => entry.key === key)?.events ?? null;
}

export async function putCached(key: string, events: TranslateEvent[]): Promise<void> {
  const entries = (await load()).filter((entry) => entry.key !== key);
  entries.unshift({ key, events });
  await chrome.storage.local.set({ [KEY]: entries.slice(0, MAX_ENTRIES) });
}
