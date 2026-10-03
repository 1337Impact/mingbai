import OpenAI from 'openai';
import { geminiSpeechURL, synthesizeWithGemini } from './gemini-tts';
import { SYSTEM_PROMPT } from './prompt';
import { StreamParser } from './stream-parser';
import type { Settings, TranslateEvent } from './types';

const DEFAULT_VOICE = 'alloy';
// Delivery for learners: slower than normal and flat. Models that take
// `instructions` ignore `speed` and the older ones do the reverse, so both are sent.
const SPEECH_SPEED = 0.85;
const SPEECH_INSTRUCTIONS = 'Speak slowly and clearly, in a neutral, even tone with no emotion.';

function createClient(settings: Settings): OpenAI {
  return new OpenAI({
    baseURL: settings.baseURL.trim().replace(/\/+$/, ''),
    // Local servers often need no key, but the SDK requires a non-empty value.
    apiKey: settings.apiKey.trim() || 'none',
    dangerouslyAllowBrowser: true,
    maxRetries: 1,
  });
}

/**
 * Turns text into speech, returned as base64 audio. Uses the OpenAI-compatible
 * /audio/speech endpoint, except for Gemini, which only offers speech natively.
 */
export async function synthesize(text: string, settings: Settings): Promise<string> {
  const gemini = geminiSpeechURL(settings.baseURL);
  if (gemini) return synthesizeWithGemini(gemini, text, settings);

  const response = await createClient(settings).audio.speech.create({
    model: settings.ttsModel.trim(),
    voice: settings.ttsVoice.trim() || DEFAULT_VOICE,
    input: text,
    response_format: 'mp3',
    speed: SPEECH_SPEED,
    instructions: SPEECH_INSTRUCTIONS,
  });
  const bytes = new Uint8Array(await response.arrayBuffer());
  // Chunked to stay within the argument limit of String.fromCharCode.
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/**
 * Streams an annotated translation of `text` from any OpenAI-compatible
 * chat completions endpoint. Throws on API errors; resolves quietly if aborted.
 */
export async function translate(
  text: string,
  settings: Settings,
  emit: (event: TranslateEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  const client = createClient(settings);

  const extraBody = settings.extraBody.trim() ? JSON.parse(settings.extraBody) : {};
  const body: OpenAI.Chat.ChatCompletionCreateParamsStreaming = {
    ...extraBody,
    model: settings.model.trim(),
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: text },
    ],
    stream: true,
  };

  const parser = new StreamParser(text, emit);
  let finishReason: string | null = null;
  try {
    const stream = await client.chat.completions.create(body, { signal });
    for await (const chunk of stream) {
      const choice = chunk.choices?.[0];
      if (choice?.delta?.content) parser.push(choice.delta.content);
      if (choice?.finish_reason) finishReason = choice.finish_reason;
    }
  } catch (error) {
    if (signal.aborted || error instanceof OpenAI.APIUserAbortError) return;
    throw error;
  }

  const incomplete = parser.end();
  emit({ type: 'done', truncated: incomplete || finishReason === 'length' });
}

export function describeError(error: unknown): string {
  if (error instanceof OpenAI.APIConnectionError) {
    return 'Could not reach the API. Check the API URL in settings.';
  }
  if (error instanceof OpenAI.APIError) {
    return error.status ? `API error ${error.status}: ${error.message}` : error.message;
  }
  return error instanceof Error ? error.message : String(error);
}
