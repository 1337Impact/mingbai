import OpenAI from 'openai';
import { SYSTEM_PROMPT } from './prompt';
import { StreamParser } from './stream-parser';
import type { Settings, TranslateEvent } from './types';

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
  const client = new OpenAI({
    baseURL: settings.baseURL.trim().replace(/\/+$/, ''),
    // Local servers often need no key, but the SDK requires a non-empty value.
    apiKey: settings.apiKey.trim() || 'none',
    dangerouslyAllowBrowser: true,
    maxRetries: 1,
  });

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
