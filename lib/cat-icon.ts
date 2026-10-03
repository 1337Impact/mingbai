/** An SVG element as [tag, attributes, children], so it can be built without innerHTML. */
export type SvgNode = [tag: string, attrs: Record<string, string>, children?: SvgNode[]];

const INK = '#2a2f3a';
const RED = '#e0402f';
const PINK = '#ff8f9c';

/**
 * The face of the Mingbai cat with its beckoning paw: the icon at small sizes
 * and the button next to a selection. public/icon/icon.svg is the full figure.
 */
export const CAT_FACE: SvgNode = [
  'svg',
  { xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 128 128' },
  [
    [
      'defs',
      {},
      [
        [
          'linearGradient',
          { id: 'mb-sky', x1: '0', y1: '0', x2: '1', y2: '1' },
          [
            ['stop', { offset: '0', 'stop-color': '#4bb0f0' }],
            ['stop', { offset: '1', 'stop-color': '#1a63b8' }],
          ],
        ],
        ['clipPath', { id: 'mb-tile' }, [['rect', { width: '128', height: '128', rx: '29' }]]],
        ['clipPath', { id: 'mb-head' }, [['ellipse', { cx: '52', cy: '78', rx: '42', ry: '36' }]]],
      ],
    ],
    [
      'g',
      { 'clip-path': 'url(#mb-tile)' },
      [
        ['rect', { width: '128', height: '128', fill: 'url(#mb-sky)' }],
        // The raised paw.
        ['path', { d: 'M110 128V58', fill: 'none', stroke: '#fff', 'stroke-width': '22', 'stroke-linecap': 'round' }],
        ['path', { d: 'M106 50v8M114 50v8', stroke: '#c3cfdf', 'stroke-width': '3.5', 'stroke-linecap': 'round' }],
        // Ears, red inside.
        ['path', { d: 'M14 66 20 22 46 45zM90 66 84 22 58 45z', fill: '#fff', stroke: '#fff', 'stroke-width': '6', 'stroke-linejoin': 'round' }],
        ['path', { d: 'M23 50 26 34 37 44zM81 50 78 34 67 44z', fill: RED, stroke: RED, 'stroke-width': '3', 'stroke-linejoin': 'round' }],
        // Head with calico patches.
        ['ellipse', { cx: '52', cy: '78', rx: '42', ry: '36', fill: '#fff' }],
        [
          'g',
          { 'clip-path': 'url(#mb-head)' },
          [
            ['circle', { cx: '18', cy: '48', r: '22', fill: '#f6a23c' }],
            ['circle', { cx: '85', cy: '45', r: '17', fill: '#3a3f4b' }],
          ],
        ],
        ['path', { d: 'M25 79q9-12 18 0M61 79q9-12 18 0', fill: 'none', stroke: INK, 'stroke-width': '6.5', 'stroke-linecap': 'round' }],
        ['circle', { cx: '25', cy: '93', r: '8.5', fill: PINK, opacity: '.75' }],
        ['circle', { cx: '79', cy: '93', r: '8.5', fill: PINK, opacity: '.75' }],
        ['path', { d: 'M47 86h10l-5 6z', fill: '#ff6b81', stroke: '#ff6b81', 'stroke-width': '2.5', 'stroke-linejoin': 'round' }],
        ['path', { d: 'M40 97q6 8 12 0q6 8 12 0', fill: 'none', stroke: INK, 'stroke-width': '4.5', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }],
        // Collar and bell.
        ['path', { d: 'M18 110q34 18 68 0v18h-68z', fill: RED }],
        ['circle', { cx: '52', cy: '123', r: '8', fill: '#ffd45e', stroke: '#e9a91f', 'stroke-width': '2' }],
      ],
    ],
  ],
];
