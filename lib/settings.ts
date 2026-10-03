import type { Settings } from './types';

export const DEFAULT_SETTINGS: Settings = {
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: '',
  model: 'qwen/qwen3.8-27b:free',
  extraBody: '',
};

const KEY = 'settings';

export async function loadSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get(KEY);
  return { ...DEFAULT_SETTINGS, ...(stored[KEY] as Partial<Settings> | undefined) };
}

/** False until the user has saved the settings page at least once. */
export async function isConfigured(): Promise<boolean> {
  const stored = await chrome.storage.local.get(KEY);
  return stored[KEY] !== undefined;
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ [KEY]: settings });
}

/** Returns a message describing what is wrong with the settings, or null if usable. */
export function validateSettings(settings: Settings): string | null {
  if (!settings.baseURL.trim()) return 'API URL is required.';
  try {
    const url = new URL(settings.baseURL);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return 'API URL must start with https:// or http://.';
    }
  } catch {
    return 'API URL is not a valid URL.';
  }
  if (!settings.model.trim()) return 'Model ID is required.';
  if (settings.extraBody.trim()) {
    try {
      const parsed: unknown = JSON.parse(settings.extraBody);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return 'Extra request parameters must be a JSON object.';
      }
    } catch {
      return 'Extra request parameters are not valid JSON.';
    }
  }
  return null;
}
