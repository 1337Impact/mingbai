import type { SvgNode } from '@/lib/cat-icon';

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  text = '',
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

// Icons are built with DOM calls rather than innerHTML so the popup also works
// on pages that enforce Trusted Types.
const SVG_NS = 'http://www.w3.org/2000/svg';

function icon(paths: string[], filled = false): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '18');
  svg.setAttribute('height', '18');
  svg.setAttribute('fill', filled ? 'currentColor' : 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of paths) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

/** Builds an SVG element from its description, for artwork with more than plain paths. */
export function svgElement([tag, attrs, children = []]: SvgNode): SVGElement {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (name !== 'xmlns') node.setAttribute(name, value);
  }
  node.append(...children.map(svgElement));
  return node;
}

const BOOKMARK = 'M6 4h12a1 1 0 0 1 1 1v15l-7-4.5L5 20V5a1 1 0 0 1 1-1z';

export const icons = {
  speaker: () => icon(['M4 9.5v5h3.5L12 18V6L7.5 9.5H4z', 'M15.5 9a4 4 0 0 1 0 6', 'M18 6.5a7.5 7.5 0 0 1 0 11']),
  bookmark: () => icon([BOOKMARK]),
  bookmarkFilled: () => icon([BOOKMARK], true),
  close: () => icon(['M6 6l12 12', 'M18 6L6 18']),
  copy: () =>
    icon([
      'M10 9h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1z',
      'M15 9V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h4',
    ]),
  check: () => icon(['M5 12.5l4.5 4.5L19 7.5']),
  /** Three quarters of a circle; rotated by the `.busy` style. */
  spinner: () => icon(['M12 3a9 9 0 1 0 9 9']),
};

/** Copies text to the clipboard. Returns false if the page does not allow it. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // The async clipboard is unavailable on plain http pages; fall back to the
    // old command, then put the page's selection back.
    const selection = window.getSelection();
    const ranges = selection ? Array.from({ length: selection.rangeCount }, (_, i) => selection.getRangeAt(i)) : [];
    const area = el('textarea');
    area.value = text;
    area.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
    document.documentElement.append(area);
    area.select();
    const copied = document.execCommand('copy');
    area.remove();
    selection?.removeAllRanges();
    for (const range of ranges) selection?.addRange(range);
    return copied;
  }
}

export function iconButton(label: string, glyph: SVGSVGElement, onClick: () => void): HTMLButtonElement {
  const button = el('button', 'icon-btn');
  button.type = 'button';
  button.title = label;
  button.setAttribute('aria-label', label);
  button.append(glyph);
  button.addEventListener('click', onClick);
  return button;
}
