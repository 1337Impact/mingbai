import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { geminiSpeechURL, synthesizeWithGemini } from '../lib/gemini-tts.ts';

const settings = {
  baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
  apiKey: ' key-123 ',
  model: 'gemini-chat',
  extraBody: '',
  ttsModel: 'gemini-3.8-flash-lite-tts',
  ttsVoice: 'Kore',
};
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Replaces fetch with one canned reply and records the calls made to it. */
function stubFetch(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(body === undefined ? null : JSON.stringify(body), { status });
  }) as typeof fetch;
  return calls;
}

test('maps a Gemini OpenAI-compatible URL to the native speech endpoint', () => {
  assert.equal(geminiSpeechURL('https://generativelanguage.googleapis.com/v1beta/openai/'), ENDPOINT);
  assert.equal(geminiSpeechURL('https://generativelanguage.googleapis.com/v1beta/openai'), ENDPOINT);
  assert.equal(geminiSpeechURL('https://generativelanguage.googleapis.com'), ENDPOINT);
});

test('leaves other providers on the OpenAI-compatible route', () => {
  assert.equal(geminiSpeechURL('https://openrouter.ai/api/v1'), null);
  assert.equal(geminiSpeechURL('http://localhost:11434/v1'), null);
  assert.equal(geminiSpeechURL('not a url'), null);
});

test('sends the text, model, voice and key in the documented shape', async () => {
  const calls = stubFetch(200, { steps: [{ type: 'model_output', content: [{ type: 'audio', data: 'UklGRg==' }] }] });
  assert.equal(await synthesizeWithGemini(ENDPOINT, '农业', settings), 'UklGRg==');

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, ENDPOINT);
  assert.equal((calls[0].init.headers as Record<string, string>)['x-goog-api-key'], 'key-123');
  assert.deepEqual(JSON.parse(calls[0].init.body as string), {
    model: 'gemini-3.8-flash-lite-tts',
    input: [
      {
        type: 'user_input',
        content: [
          {
            type: 'text',
            text: '农业',
            annotations: [
              { type: 'speech_metadata', style: 'speaking slowly and clearly, neutral and even tone, no emotion' },
            ],
          },
        ],
      },
    ],
    response_format: { type: 'audio' },
    generation_config: { speech_config: [{ voice: 'Kore' }] },
  });
});

test('omits the voice when none is set, so the provider default applies', async () => {
  const calls = stubFetch(200, { steps: [{ type: 'model_output', content: [{ type: 'audio', data: 'AA==' }] }] });
  await synthesizeWithGemini(ENDPOINT, '你好', { ...settings, ttsVoice: '' });
  assert.equal('generation_config' in JSON.parse(calls[0].init.body as string), false);
});

test('takes the last audio block of the model output', async () => {
  stubFetch(200, {
    steps: [
      { type: 'user_input', content: [{ type: 'text', text: '你好' }] },
      { type: 'model_output', content: [{ type: 'audio', data: 'first' }, { type: 'text', text: 'x' }, { type: 'audio', data: 'last' }] },
    ],
  });
  assert.equal(await synthesizeWithGemini(ENDPOINT, '你好', settings), 'last');
});

test('reports API errors with their message', async () => {
  stubFetch(400, { error: { code: 400, message: 'Voice Fola is not available.' } });
  await assert.rejects(synthesizeWithGemini(ENDPOINT, '你好', settings), /API error 400: Voice Fola is not available\./);
});

test('reports an error with no body, and a reply with no audio', async () => {
  stubFetch(404, undefined);
  await assert.rejects(synthesizeWithGemini(ENDPOINT, '你好', settings), /API error 404/);
  stubFetch(200, { steps: [{ type: 'model_output', content: [{ type: 'text', text: 'hello' }] }] });
  await assert.rejects(synthesizeWithGemini(ENDPOINT, '你好', settings), /returned no audio/);
});
