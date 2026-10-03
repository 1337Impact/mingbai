import type { Settings } from './types';

const GEMINI_HOST = 'generativelanguage.googleapis.com';
/** Delivery for learners. Gemini asks for a short descriptor here, not a full instruction. */
const STYLE = 'speaking slowly and clearly, neutral and even tone, no emotion';

/**
 * Gemini's OpenAI-compatible endpoint has no /audio/speech route, so for a
 * Gemini API URL speech goes to its native Interactions API instead. Returns
 * that endpoint, or null for any other provider.
 */
export function geminiSpeechURL(baseURL: string): string | null {
  let url: URL;
  try {
    url = new URL(baseURL);
  } catch {
    return null;
  }
  if (url.hostname !== GEMINI_HOST) return null;
  // https://<host>/v1beta/openai/ -> https://<host>/v1beta/interactions
  const version = url.pathname.split('/').find(Boolean) ?? 'v1beta';
  return `${url.origin}/${version}/interactions`;
}

interface InteractionResponse {
  error?: { message?: string };
  steps?: { type?: string; content?: { type?: string; data?: string }[] }[];
}

/** Turns text into speech with a Gemini TTS model. Returns WAV audio as base64. */
export async function synthesizeWithGemini(endpoint: string, text: string, settings: Settings): Promise<string> {
  const voice = settings.ttsVoice.trim();
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': settings.apiKey.trim() },
    body: JSON.stringify({
      model: settings.ttsModel.trim(),
      input: [
        {
          type: 'user_input',
          content: [{ type: 'text', text, annotations: [{ type: 'speech_metadata', style: STYLE }] }],
        },
      ],
      response_format: { type: 'audio' },
      ...(voice ? { generation_config: { speech_config: [{ voice }] } } : {}),
    }),
  });

  const body = (await response.json().catch(() => null)) as InteractionResponse | null;
  if (!response.ok) {
    throw new Error(`API error ${response.status}: ${body?.error?.message ?? (response.statusText || 'no details')}`);
  }
  const audio = body?.steps
    ?.flatMap((step) => (step.type === 'model_output' ? (step.content ?? []) : []))
    .filter((part) => part.type === 'audio')
    .at(-1)?.data;
  if (!audio) throw new Error('The speech model returned no audio.');
  return audio;
}
