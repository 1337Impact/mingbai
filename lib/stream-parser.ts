import type { TranslateEvent } from './types';

export type ParsedEvent = Extract<TranslateEvent, { type: 'sentence' | 'token' }>;

/** How many Chinese characters a token's match may skip before it is treated as unrelated. */
const MAX_SKIPPED_HAN = 6;
/** After this many rejected tokens in a row, accept any forward match to resynchronise. */
const RESYNC_AFTER = 3;

/**
 * Turns the model's streamed output (one JSON value per line, see prompt.ts) into events.
 *
 * Tokens are aligned against the source text, so the emitted tokens always
 * concatenate back to the exact selection: anything the model skips is emitted
 * as plain text, and lines that do not match the source are dropped.
 */
export class StreamParser {
  private buffer = '';
  private cursor = 0;
  private rejected = 0;
  private inThink = false;
  private hasSentence = false;
  private readonly source: string;
  private readonly emit: (event: ParsedEvent) => void;

  constructor(source: string, emit: (event: ParsedEvent) => void) {
    this.source = source;
    this.emit = emit;
  }

  push(chunk: string): void {
    this.buffer += chunk;
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() ?? '';
    for (const line of lines) this.line(line);
  }

  /** Flushes the remaining output. Returns true if the model left part of the text unannotated. */
  end(): boolean {
    this.line(this.buffer);
    this.buffer = '';
    const tail = this.source.slice(this.cursor);
    this.plain(tail);
    this.cursor = this.source.length;
    return tail.trim().length > 0;
  }

  private line(raw: string): void {
    let line = this.stripThinking(raw).trim();
    if (line.endsWith(',')) line = line.slice(0, -1);
    if (!line.startsWith('[') && !line.startsWith('{')) return;

    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      return;
    }

    if (Array.isArray(value)) {
      this.token(value);
    } else if (typeof (value as { en?: unknown } | null)?.en === 'string') {
      this.hasSentence = true;
      this.emit({ type: 'sentence', en: (value as { en: string }).en });
    }
  }

  /** Some servers inline the model's reasoning in the content as <think>...</think>. */
  private stripThinking(line: string): string {
    if (this.inThink) {
      const end = line.indexOf('</think>');
      if (end === -1) return '';
      this.inThink = false;
      line = line.slice(end + '</think>'.length);
    }
    const start = line.indexOf('<think>');
    if (start === -1) return line;
    const end = line.indexOf('</think>', start);
    if (end === -1) {
      this.inThink = true;
      return line.slice(0, start);
    }
    return line.slice(0, start) + line.slice(end + '</think>'.length);
  }

  private token(parts: unknown[]): void {
    const [text, pinyin, gloss] = parts;
    if (typeof text !== 'string' || text === '') return;

    const index = this.source.indexOf(text, this.cursor);
    if (index === -1) {
      this.rejected++;
      return;
    }
    const gap = this.source.slice(this.cursor, index);
    const skippedHan = gap.match(/\p{Script=Han}/gu)?.length ?? 0;
    if (skippedHan > MAX_SKIPPED_HAN && this.rejected < RESYNC_AFTER) {
      this.rejected++;
      return;
    }
    this.rejected = 0;

    this.plain(gap);
    this.cursor = index + text.length;
    this.emitToken(text, typeof pinyin === 'string' ? pinyin : '', typeof gloss === 'string' ? gloss : '');
  }

  private plain(text: string): void {
    if (text !== '') this.emitToken(text, '', '');
  }

  private emitToken(text: string, pinyin: string, gloss: string): void {
    if (!this.hasSentence) {
      this.hasSentence = true;
      this.emit({ type: 'sentence', en: '' });
    }
    this.emit({ type: 'token', token: { text, pinyin: pinyin.trim(), gloss: gloss.trim() } });
  }
}
