import hskLevels from '@/assets/hsk.json';
import { cacheKey, getCached, putCached } from '@/lib/cache';
import { describeError, synthesize, translate } from '@/lib/llm';
import { isConfigured, loadSettings, validateSettings } from '@/lib/settings';
import { TRANSLATE_PORT, type SpeakResponse, type TranslateEvent, type TranslateRequest } from '@/lib/types';

const hsk = hskLevels as Record<string, number>;

export default defineBackground(() => {
  chrome.action.onClicked.addListener(() => void chrome.runtime.openOptionsPage());

  chrome.runtime.onInstalled.addListener(({ reason }) => {
    if (reason === 'install') void chrome.runtime.openOptionsPage();
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'openOptions') void chrome.runtime.openOptionsPage();
    if (message?.type === 'speak') {
      void handleSpeak(String(message.text)).then(sendResponse);
      return true; // The response is sent asynchronously.
    }
  });

  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== TRANSLATE_PORT) return;
    const controller = new AbortController();
    port.onDisconnect.addListener(() => controller.abort());
    port.onMessage.addListener((request: TranslateRequest) => {
      void handleTranslate(port, request, controller.signal);
    });
  });
});

async function handleSpeak(text: string): Promise<SpeakResponse> {
  const settings = await loadSettings();
  if (!settings.ttsModel.trim()) return { type: 'browser' };
  try {
    // Messages are JSON, so the audio travels as base64.
    return { type: 'audio', base64: await synthesize(text, settings) };
  } catch (error) {
    return { type: 'error', message: describeError(error) };
  }
}

async function handleTranslate(
  port: chrome.runtime.Port,
  request: TranslateRequest,
  signal: AbortSignal,
): Promise<void> {
  const send = (event: TranslateEvent) => {
    if (!signal.aborted) port.postMessage(event);
  };

  if (!(await isConfigured())) {
    send({ type: 'error', code: 'config', message: 'Add your API URL, key and model in settings to start translating.' });
    return;
  }
  const settings = await loadSettings();
  const problem = validateSettings(settings);
  if (problem) {
    send({ type: 'error', code: 'config', message: problem });
    return;
  }

  const key = cacheKey(settings, request.text);
  if (!request.noCache) {
    const cached = await getCached(key);
    if (cached) {
      cached.forEach(send);
      return;
    }
  }

  const events: TranslateEvent[] = [];
  let complete = false;
  try {
    await translate(
      request.text,
      settings,
      (event) => {
        if (event.type === 'token' && event.token.pinyin) {
          const level = hsk[event.token.text];
          if (level) event.token.hsk = level;
        }
        if (event.type === 'done') complete = !event.truncated;
        events.push(event);
        send(event);
      },
      signal,
    );
  } catch (error) {
    send({ type: 'error', code: 'api', message: describeError(error) });
    return;
  }

  if (complete && !signal.aborted) await putCached(key, events);
}
