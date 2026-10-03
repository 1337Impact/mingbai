export interface Settings {
  /** Base URL of an OpenAI-compatible API, e.g. https://generativelanguage.googleapis.com/v1beta/openai/ */
  baseURL: string;
  apiKey: string;
  model: string;
  /** Optional JSON object merged into the chat completion request body. */
  extraBody: string;
  /** Model for the listen button, called at {baseURL}/audio/speech. Empty uses the browser's voice. */
  ttsModel: string;
  ttsVoice: string;
}

/** One piece of the selected text. Tokens concatenate back to the exact selection. */
export interface Token {
  text: string;
  /** Empty for punctuation and other text that is shown but not annotated. */
  pinyin: string;
  gloss: string;
  /** HSK 2.0 level (1-6) when the word is on the official list. */
  hsk?: number;
}

export type TranslateEvent =
  | { type: 'sentence'; en: string }
  | { type: 'token'; token: Token }
  | { type: 'done'; truncated: boolean }
  | { type: 'error'; code: 'config' | 'api'; message: string };

export interface TranslateRequest {
  text: string;
  /** Skip the cache, used by the settings page connection test. */
  noCache?: boolean;
}

/** Background's answer to a `speak` message. `browser` means no speech model is set. */
export type SpeakResponse =
  | { type: 'audio'; base64: string }
  | { type: 'browser' }
  | { type: 'error'; message: string };

export interface SavedWord {
  hanzi: string;
  pinyin: string;
  gloss: string;
  hsk?: number;
  /** Sentence the word was saved from, with its translation. */
  sentence: string;
  en: string;
  url: string;
  savedAt: number;
}

export const TRANSLATE_PORT = 'translate';
export const MAX_SELECTION_LENGTH = 1000;
