import { loadSaved, removeWord, saveWord } from '@/lib/saved';
import {
  MAX_SELECTION_LENGTH,
  TRANSLATE_PORT,
  type Token,
  type TranslateEvent,
  type TranslateRequest,
} from '@/lib/types';
import { copyText, el, iconButton, icons } from './dom';
import { speak, stopSpeaking } from './speech';
import { TextView } from './text-view';

interface Sentence {
  en: string;
  text: string;
  el: HTMLElement;
}

interface Word {
  token: Token;
  sentence: Sentence;
  el: HTMLElement;
}

const WIDTH = 460;
const MARGIN = 8;
/** Room the popup wants below the selection before it opens above it instead. */
const MIN_SPACE_BELOW = 340;

export class Popup {
  private readonly root = el('div', 'popup');
  private readonly main = el('div', 'panel-main');
  private readonly note = el('div', 'note');
  private readonly audioNote = el('div', 'note');
  private readonly listenButton: HTMLButtonElement;
  /** Counts presses of the listen button, to tell the latest one apart. */
  private listens = 0;
  private readonly saveButton: HTMLButtonElement;
  private readonly copyButton: HTMLButtonElement;
  private copiedTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly view: TextView;
  private readonly words = new WeakMap<Element, Word>();
  private readonly wordsByText = new Map<string, Word[]>();
  private readonly sentences: Sentence[] = [];
  private readonly saved = new Set<string>();
  private port: chrome.runtime.Port | null = null;
  private active: Sentence | null = null;
  private selected: Word | null = null;
  private error: Extract<TranslateEvent, { type: 'error' }> | null = null;
  private finished = false;

  constructor(parent: ShadowRoot, text: string, anchor: DOMRect) {
    this.view = new TextView(text);
    this.saveButton = iconButton('Save word', icons.bookmark(), () => void this.toggleSaved());
    this.copyButton = iconButton('Copy', icons.copy(), () => void this.copy());
    this.listenButton = iconButton('Listen', icons.speaker(), () => void this.listen());

    const actions = el('div', 'actions');
    actions.append(
      this.copyButton,
      this.listenButton,
      this.saveButton,
      iconButton('Close', icons.close(), () => this.onClose()),
    );
    const panel = el('div', 'panel');
    panel.append(this.main, actions);
    this.note.hidden = this.audioNote.hidden = true;
    this.root.append(panel, this.view.root, this.note, this.audioNote);

    // Keep the page's selection while the popup is being used.
    this.root.addEventListener('mousedown', (event) => event.preventDefault());
    this.view.root.addEventListener('mousedown', (event) => this.onPress(event));
    this.view.root.addEventListener('mouseover', (event) => this.onHover(event));

    this.place(anchor);
    parent.append(this.root);
    this.renderPanel();

    if (text.length > MAX_SELECTION_LENGTH) {
      this.fail({
        type: 'error',
        code: 'api',
        message: `That selection is ${text.length} characters. Select up to ${MAX_SELECTION_LENGTH} at a time.`,
      });
      return;
    }
    void loadSaved().then((words) => {
      for (const word of words) this.markSaved(word.hanzi, true);
    });
    this.request(text);
  }

  /** Set by the owner; called when the user closes the popup from inside it. */
  onClose: () => void = () => {};

  destroy(): void {
    this.finished = true;
    this.port?.disconnect();
    clearTimeout(this.copiedTimer);
    stopSpeaking();
    this.root.remove();
  }

  private place(anchor: DOMRect): void {
    const viewportWidth = document.documentElement.clientWidth;
    const width = Math.min(WIDTH, viewportWidth - 2 * MARGIN);
    const left = Math.max(MARGIN, Math.min(anchor.left, viewportWidth - width - MARGIN));
    const spaceBelow = window.innerHeight - anchor.bottom;
    const above = spaceBelow < MIN_SPACE_BELOW && anchor.top > spaceBelow;

    this.root.style.width = `${width}px`;
    this.root.style.left = `${left + window.scrollX}px`;
    this.root.style.top = `${(above ? anchor.top - MARGIN : anchor.bottom + MARGIN) + window.scrollY}px`;
    this.root.classList.toggle('above', above);
  }

  private request(text: string): void {
    try {
      this.port = chrome.runtime.connect({ name: TRANSLATE_PORT });
      this.port.onMessage.addListener((event: TranslateEvent) => this.handle(event));
      this.port.onDisconnect.addListener(() => {
        if (!this.finished) {
          this.fail({ type: 'error', code: 'api', message: 'The translation was interrupted. Try again.' });
        }
      });
      this.port.postMessage({ text } satisfies TranslateRequest);
    } catch {
      // Happens on tabs that were open while the extension was updated or reloaded.
      this.fail({ type: 'error', code: 'api', message: 'Mingbai was updated. Reload this page to use it.' });
    }
  }

  private handle(event: TranslateEvent): void {
    switch (event.type) {
      case 'sentence': {
        const sentence: Sentence = { en: event.en, text: '', el: this.view.addSentence() };
        this.sentences.push(sentence);
        if (!this.active) this.setActive(sentence);
        break;
      }
      case 'token':
        this.addToken(event.token);
        break;
      case 'done':
        this.finished = true;
        this.port?.disconnect();
        if (event.truncated) {
          this.note.textContent = 'The model stopped early, so part of the text has no annotations.';
          this.note.hidden = false;
        }
        this.renderPanel();
        break;
      case 'error':
        this.fail(event);
        break;
    }
  }

  private addToken(token: Token): void {
    const sentence = this.sentences.at(-1);
    if (!sentence) return;
    sentence.text += token.text;
    const element = this.view.addToken(token);
    if (!element) return;

    const word: Word = { token, sentence, el: element };
    this.words.set(element, word);
    const sameText = this.wordsByText.get(token.text) ?? [];
    sameText.push(word);
    this.wordsByText.set(token.text, sameText);
    if (this.saved.has(token.text)) element.classList.add('saved');
  }

  private fail(error: Extract<TranslateEvent, { type: 'error' }>): void {
    this.finished = true;
    this.error = error;
    this.port?.disconnect();
    this.renderPanel();
  }

  private onPress(event: MouseEvent): void {
    const element = (event.target as Element).closest('.w');
    const word = element ? this.words.get(element) : undefined;
    // Pressing a word shows it; pressing it again, or empty space, returns to the sentence.
    this.select(word && word !== this.selected ? word : null);
  }

  private onHover(event: MouseEvent): void {
    const element = (event.target as Element).closest('.sentence');
    const sentence = this.sentences.find((s) => s.el === element);
    if (sentence) this.setActive(sentence);
  }

  private setActive(sentence: Sentence): void {
    if (this.active === sentence) return;
    this.active?.el.classList.remove('active');
    this.active = sentence;
    sentence.el.classList.add('active');
    if (!this.selected) this.renderPanel();
  }

  private select(word: Word | null): void {
    this.selected?.el.classList.remove('selected');
    this.selected = word;
    if (word) {
      word.el.classList.add('selected');
      this.setActive(word.sentence);
    }
    this.renderPanel();
  }

  private async listen(): Promise<void> {
    const text = (this.selected?.token.text ?? this.active?.text)?.trim();
    if (!text) return;
    this.audioNote.hidden = true;
    const mine = ++this.listens;
    this.setListenButton(true);
    const problem = await speak(text);
    // A newer press owns the button now; let it clear the spinner.
    if (mine !== this.listens) return;
    this.setListenButton(false);
    if (problem) {
      this.audioNote.textContent = `Could not play audio. ${problem}`;
      this.audioNote.hidden = false;
    }
  }

  /** Copies what the top panel shows: the pressed word, or the sentence's translation. */
  private async copy(): Promise<void> {
    const text = this.selected?.token.text ?? this.active?.en;
    if (!text || !(await copyText(text))) return;
    this.setCopyButton(true);
    clearTimeout(this.copiedTimer);
    this.copiedTimer = setTimeout(() => this.setCopyButton(false), 1500);
  }

  private setCopyButton(copied: boolean): void {
    const label = copied ? 'Copied' : this.selected ? 'Copy word' : 'Copy translation';
    this.copyButton.classList.toggle('on', copied);
    this.copyButton.title = label;
    this.copyButton.setAttribute('aria-label', label);
    this.copyButton.replaceChildren(copied ? icons.check() : icons.copy());
  }

  private setListenButton(loading: boolean): void {
    const label = loading ? 'Loading audio' : 'Listen';
    this.listenButton.classList.toggle('busy', loading);
    this.listenButton.title = label;
    this.listenButton.setAttribute('aria-label', label);
    this.listenButton.replaceChildren(loading ? icons.spinner() : icons.speaker());
  }

  private async toggleSaved(): Promise<void> {
    const word = this.selected;
    if (!word) return;
    const { text, pinyin, gloss, hsk } = word.token;
    if (this.saved.has(text)) {
      this.markSaved(text, false);
      await removeWord(text);
    } else {
      this.markSaved(text, true);
      await saveWord({
        hanzi: text,
        pinyin,
        gloss,
        hsk,
        sentence: word.sentence.text.trim(),
        en: word.sentence.en,
        url: location.href,
        savedAt: Date.now(),
      });
    }
  }

  private markSaved(text: string, saved: boolean): void {
    if (saved) this.saved.add(text);
    else this.saved.delete(text);
    for (const word of this.wordsByText.get(text) ?? []) word.el.classList.toggle('saved', saved);
    if (this.selected?.token.text === text) this.renderSaveButton();
  }

  private renderSaveButton(): void {
    const word = this.selected;
    this.saveButton.hidden = !word || this.error !== null;
    if (!word) return;
    const saved = this.saved.has(word.token.text);
    const label = saved ? 'Remove from saved words' : 'Save word';
    this.saveButton.classList.toggle('on', saved);
    this.saveButton.title = label;
    this.saveButton.setAttribute('aria-label', label);
    this.saveButton.replaceChildren(saved ? icons.bookmarkFilled() : icons.bookmark());
  }

  private renderPanel(): void {
    this.renderSaveButton();
    clearTimeout(this.copiedTimer);
    this.setCopyButton(false);
    this.copyButton.hidden = this.error !== null;
    const { main, error, selected, active } = this;

    if (error) {
      const settings = el('button', 'link-btn', 'Open settings');
      settings.type = 'button';
      settings.addEventListener('click', () => void chrome.runtime.sendMessage({ type: 'openOptions' }));
      main.replaceChildren(el('div', 'message', error.message), settings);
      return;
    }

    if (selected) {
      const { text, pinyin, gloss, hsk } = selected.token;
      const head = el('div', 'word-head');
      head.append(el('span', 'word-hz', text), el('span', 'word-py', pinyin));
      if (hsk) {
        const badge = el('span', 'hsk', `HSK${hsk}`);
        badge.dataset.level = String(hsk);
        head.append(badge);
      }
      const glosses = gloss.split(/\s*;\s*/).filter(Boolean);
      main.replaceChildren(head, ...glosses.map((meaning) => el('div', 'gloss', meaning)));
      return;
    }

    if (active?.en) {
      main.replaceChildren(el('div', 'en', active.en));
    } else {
      main.replaceChildren(el('div', 'en muted', this.finished ? 'No translation for this part.' : 'Translating…'));
    }
  }
}
