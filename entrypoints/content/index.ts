import { el } from './dom';
import { Popup } from './popup';
import css from './style.css?inline';

const HAN = /\p{Script=Han}/u;

const shadowRootsIn = (path: EventTarget[]) => path.filter((node) => node instanceof ShadowRoot);
const hasSize = (rect: DOMRect) => rect.width > 0 || rect.height > 0;

const withoutSpaces = (text: string) => text.replace(/\s+/g, '');

/**
 * A range to position the popup by, and whether it covers the selection exactly.
 *
 * For text inside shadow DOM the regular API only gives a collapsed range at
 * the shadow host, so the real one has to be asked for by naming the shadow
 * roots it may be in.
 */
function selectedRange(selection: Selection, shadowRoots: ShadowRoot[]): { range: Range; exact: boolean } | null {
  if (shadowRoots.length > 0) {
    try {
      const composed = selection.getComposedRanges({ shadowRoots })[0];
      if (composed && !composed.collapsed) {
        const root = composed.startContainer.getRootNode();
        const range = document.createRange();
        range.setStart(composed.startContainer, composed.startOffset);
        if (composed.endContainer.getRootNode() === root) {
          range.setEnd(composed.endContainer, composed.endOffset);
          return { range, exact: true };
        }
        // A live range cannot cross a shadow boundary, and a triple-click ends
        // just outside the component it was made in. Keep the part inside.
        if (root instanceof ShadowRoot) {
          range.setEnd(root, root.childNodes.length);
          return { range, exact: false };
        }
      }
    } catch {
      // Older Chrome: fall through to the regular range.
    }
  }
  return selection.rangeCount > 0 ? { range: selection.getRangeAt(0).cloneRange(), exact: true } : null;
}

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    let host: HTMLElement | null = null;
    let shadow: ShadowRoot | null = null;
    let trigger: HTMLButtonElement | null = null;
    let popup: Popup | null = null;
    /** Shadow roots under the last press, where a drag selection starts. */
    let pressRoots: ShadowRoot[] = [];

    // Created on the first Chinese selection, so other pages are left untouched.
    function ensureShadow(): ShadowRoot {
      if (shadow && host?.isConnected) return shadow;
      host = document.createElement('hanzi-lens');
      host.style.cssText = 'position:absolute;top:0;left:0;z-index:2147483647;';
      shadow = host.attachShadow({ mode: 'open' });
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(css);
      shadow.adoptedStyleSheets = [sheet];
      document.documentElement.append(host);
      return shadow;
    }

    function hideTrigger(): void {
      trigger?.remove();
      trigger = null;
    }

    function closePopup(): void {
      popup?.destroy();
      popup = null;
    }

    function openPopup(text: string, anchor: DOMRect): void {
      closePopup();
      popup = new Popup(ensureShadow(), text, anchor);
      popup.onClose = closePopup;
    }

    /** Positioned by `range` when the selection could be measured, else by where the mouse was released. */
    function showTrigger(text: string, range: Range | null, pointer: DOMRect): void {
      hideTrigger();
      const anchor = () => {
        const rect = range?.getBoundingClientRect();
        return rect && hasSize(rect) ? rect : pointer;
      };
      const rects = range?.getClientRects();
      const end = rects?.[rects.length - 1] ?? anchor();
      const maxLeft = document.documentElement.clientWidth - 38;

      trigger = el('button', 'trigger', '文');
      trigger.type = 'button';
      trigger.title = 'Translate with Hanzi Lens';
      trigger.setAttribute('aria-label', 'Translate selection');
      trigger.style.left = `${Math.max(4, Math.min(end.right + 6, maxLeft)) + window.scrollX}px`;
      trigger.style.top = `${end.bottom + 6 + window.scrollY}px`;
      // Without this the click would clear the selection before it is read.
      trigger.addEventListener('mousedown', (event) => event.preventDefault());
      trigger.addEventListener('click', () => {
        hideTrigger();
        openPopup(text, anchor());
      });
      ensureShadow().append(trigger);
    }

    function onSelectionEnd(event: Event): void {
      // Read now: the path is gone once the event has finished dispatching.
      const path = event.composedPath();
      if (host && path.includes(host)) return;
      const shadowRoots = [...new Set([...pressRoots, ...shadowRootsIn(path)])];
      const pointer = event instanceof MouseEvent ? new DOMRect(event.clientX, event.clientY, 0, 0) : null;

      // The selection is only final after the event has finished dispatching.
      setTimeout(() => {
        const selection = window.getSelection();
        // Not `isCollapsed`: it is true for any selection inside shadow DOM.
        const text = selection?.toString().replace(/\r\n?/g, '\n').replace(/\n{2,}/g, '\n').trim() ?? '';
        if (!selection || !HAN.test(text)) {
          hideTrigger();
          return;
        }
        const found = selectedRange(selection, shadowRoots);
        const rect = found?.range.getBoundingClientRect();
        if (!found || !rect || !hasSize(rect)) {
          // Nothing measurable, as in closed shadow roots.
          if (pointer) showTrigger(text, null, pointer);
          return;
        }
        // A partial range is only trusted when it holds the whole selected text.
        const trusted = found.exact || withoutSpaces(found.range.toString()) === withoutSpaces(text);
        showTrigger(text, trusted || !pointer ? found.range : null, pointer ?? rect);
      });
    }

    // Capture phase, so pages that stop these events from bubbling do not hide them.
    document.addEventListener('mouseup', onSelectionEnd, true);
    document.addEventListener(
      'keyup',
      (event) => {
        if (event.shiftKey || event.key === 'Shift') onSelectionEnd(event);
      },
      true,
    );
    document.addEventListener(
      'mousedown',
      (event) => {
        const path = event.composedPath();
        if (host && path.includes(host)) return;
        pressRoots = shadowRootsIn(path);
        hideTrigger();
        closePopup();
      },
      true,
    );
    document.addEventListener(
      'keydown',
      (event) => {
        if (event.key === 'Escape') {
          hideTrigger();
          closePopup();
        }
      },
      true,
    );
  },
});
