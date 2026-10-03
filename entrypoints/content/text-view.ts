import type { Token } from '@/lib/types';
import { el } from './dom';

const CLOSING = /^[，。！？；：、）》」』”’…—,.!?;:)\]}〉】%％]$/;
const OPENING = /^[（《「『“‘(\[{〈【]$/;
// Line break | spaces | one Chinese character, punctuation mark or symbol | a run of anything else.
const UNIT = /\n|[^\S\n]+|[\p{Script=Han}\p{P}\p{S}]|[^\s\p{Script=Han}\p{P}\p{S}]+/gu;

interface Unit {
  node: Node;
  length: number;
  text: string;
}

function box(className: string, text: string, pinyin = ''): HTMLElement {
  const node = el('span', className);
  const syllables = pinyin.split(/\s+/);
  const py = el('span', 'py');
  if (syllables.length > 1 && syllables.length === [...text].length) {
    // One cell per character, so each syllable sits above its own character.
    py.classList.add('split');
    py.append(...syllables.map((syllable) => el('span', '', syllable)));
  } else {
    py.textContent = pinyin;
  }
  node.append(py, el('span', 'hz', text));
  return node;
}

function plainUnits(text: string): Unit[] {
  return (text.match(UNIT) ?? []).map((part) => {
    if (part === '\n') return { node: el('br'), length: 1, text: part };
    if (part.trim() === '') return { node: document.createTextNode(' '), length: part.length, text: part };
    return { node: box('p', part), length: part.length, text: part };
  });
}

/**
 * The Chinese text of the popup. Starts as the greyed-out selection and is
 * replaced piece by piece with annotated words as tokens stream in.
 */
export class TextView {
  readonly root = el('div', 'text');
  private readonly pending = el('span', 'pending');
  private readonly source: string;
  private pendingUnits: Unit[] = [];
  private consumed = 0;
  private sentence: HTMLElement | null = null;
  /** Group that following closing punctuation attaches to, so it never starts a line. */
  private group: HTMLElement | null = null;
  /** Group begun by opening punctuation, waiting for its word. */
  private openGroup: HTMLElement | null = null;

  constructor(source: string) {
    this.source = source;
    this.root.lang = 'zh';
    this.root.append(this.pending);
    this.resetPending();
  }

  addSentence(): HTMLElement {
    this.sentence = el('span', 'sentence');
    this.group = this.openGroup = null;
    this.root.insertBefore(this.sentence, this.pending);
    return this.sentence;
  }

  /** Renders a token into the current sentence. Returns the element for annotated words. */
  addToken(token: Token): HTMLElement | null {
    const sentence = this.sentence ?? this.addSentence();
    this.consume(token.text.length);

    if (token.pinyin || token.gloss) {
      const word = box('w', token.text, token.pinyin);
      const group = this.openGroup ?? sentence.appendChild(el('span', 'g'));
      group.append(word);
      this.group = group;
      this.openGroup = null;
      return word;
    }

    for (const unit of plainUnits(token.text)) {
      if (CLOSING.test(unit.text) && this.group) {
        this.group.append(unit.node);
      } else if (OPENING.test(unit.text)) {
        this.openGroup ??= sentence.appendChild(el('span', 'g'));
        this.openGroup.append(unit.node);
        this.group = null;
      } else {
        sentence.append(unit.node);
        this.group = this.openGroup = null;
      }
    }
    return null;
  }

  private resetPending(): void {
    this.pendingUnits = plainUnits(this.source.slice(this.consumed));
    this.pending.replaceChildren(...this.pendingUnits.map((unit) => unit.node));
  }

  /** Removes `length` characters from the front of the not-yet-annotated text. */
  private consume(length: number): void {
    this.consumed += length;
    while (length > 0) {
      const unit = this.pendingUnits[0];
      if (!unit || unit.length > length) {
        // The token ends in the middle of a unit; rebuild from the new position.
        this.resetPending();
        return;
      }
      this.pendingUnits.shift();
      unit.node.parentNode?.removeChild(unit.node);
      length -= unit.length;
    }
  }
}
