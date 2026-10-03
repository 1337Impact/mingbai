import type { SpeakResponse } from '@/lib/types';

const MAX_CACHED = 30;
/** Decoded audio by text, so listening again is instant and costs nothing. */
const cache = new Map<string, AudioBuffer>();
let context: AudioContext | null = null;
let playing: AudioBufferSourceNode | null = null;
/** Bumped on every play or stop, so a reply that arrives late is ignored. */
let generation = 0;

/**
 * Reads Chinese text aloud with the speech model from settings, or with the
 * browser's built-in voice when none is set. Resolves once playback starts,
 * with a message if the audio could not be produced.
 */
export async function speak(text: string): Promise<string | null> {
  stopSpeaking();
  const mine = generation;

  let buffer = cache.get(text);
  if (!buffer) {
    let reply: SpeakResponse;
    try {
      reply = await chrome.runtime.sendMessage({ type: 'speak', text });
    } catch {
      return 'Mingbai was updated. Reload this page to use it.';
    }
    if (mine !== generation) return null;
    if (reply.type === 'error') return reply.message;
    if (reply.type === 'browser') {
      speakWithBrowser(text);
      return null;
    }

    try {
      // Web Audio rather than an <audio> element, which a page's media policy can block.
      context ??= new AudioContext();
      const bytes = Uint8Array.from(atob(reply.base64), (char) => char.charCodeAt(0));
      buffer = await context.decodeAudioData(bytes.buffer);
    } catch {
      return 'The API returned audio this browser cannot play.';
    }
    cache.set(text, buffer);
    if (cache.size > MAX_CACHED) cache.delete(cache.keys().next().value!);
    if (mine !== generation) return null;
  }

  context ??= new AudioContext();
  void context.resume();
  playing = context.createBufferSource();
  playing.buffer = buffer;
  playing.connect(context.destination);
  playing.start();
  return null;
}

export function stopSpeaking(): void {
  generation++;
  playing?.stop();
  playing = null;
  speechSynthesis.cancel();
}

function speakWithBrowser(text: string): void {
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'zh-CN';
  utterance.rate = 0.9;
  const voices = speechSynthesis.getVoices();
  const lang = (voice: SpeechSynthesisVoice) => voice.lang.replace('_', '-');
  const voice =
    voices.find((v) => lang(v) === 'zh-CN') ?? voices.find((v) => lang(v).startsWith('zh'));
  if (voice) utterance.voice = voice;
  speechSynthesis.speak(utterance);
}
