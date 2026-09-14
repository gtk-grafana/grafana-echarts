import { globSync, readFileSync } from 'node:fs';
import { format } from 'pretty-format';
import {
  canvasEventSerializer,
  isCanvasEventList,
  serializeCanvasEvents,
  type SnapshotCanvasEvent,
} from 'test/canvasSerializer';

/**
 * The compact canvas snapshot format, and the one property it cannot lose: the stored
 * baseline has to parse as JSON.
 *
 * `toMatchCanvasSnapshot` reads it back through its own `parseSnapshotJson` to build the
 * "expected" half of the compare viewer's visual diff, and a format that is *nearly* JSON
 * costs the reviewer that half silently — the matcher logs a warning and returns, leaving
 * one render with nothing to compare it to. So every committed baseline is parsed here,
 * not just a hand-written sample.
 */

/** `parseSnapshotJson`, reimplemented from the matcher so the check runs on real input. */
const parseSnapshotJson = (text: string): unknown => {
  let cleaned = text.trim();
  let previous = '';
  while (previous !== cleaned) {
    previous = cleaned;
    cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1').replace(/([}\]])(\s*),\s*(?=[\]}]|$)/g, '$1');
  }
  return JSON.parse(cleaned);
};

const EVENTS = [
  { type: 'fillStyle', props: { value: '#73bf69' } },
  { type: 'fillText', props: { text: 'Gateway', x: 0, y: 6, maxWidth: null } },
];

describe('canvas event serializer', () => {
  it('writes one JSON object per line inside a JSON array', () => {
    expect(serializeCanvasEvents(EVENTS)).toBe(
      [
        '[',
        '{"type":"fillStyle","props":{"value":"#73bf69"}},',
        '{"type":"fillText","props":{"text":"Gateway","x":0,"y":6,"maxWidth":null}}',
        ']',
      ].join('\n')
    );
  });

  it('reaches pretty-format as a plugin, so it is what jest stores', () => {
    expect(format(EVENTS, { plugins: [canvasEventSerializer] })).toBe(serializeCanvasEvents(EVENTS));
  });

  /** The predicate decides which snapshots use this format, so it has to be narrow. */
  it.each([
    ['a draw call list', [{ type: 'save', props: {} }], true],
    ['a nested path array', [{ type: 'stroke', props: { path: [{ type: 'moveTo', props: { x: 1, y: 2 } }] } }], true],
    ['an empty array', [], false],
    ['the label strings an integration test inline-snapshots', ['api-service-...', 'web-service-...'], false],
    ['a plain object', { type: 'save', props: {} }, false],
    ['a list of option objects', [{ type: 'graph', name: 'edges' }], false],
    ['a list with a null in it', [{ type: 'save', props: {} }, null], false],
  ])('does not claim %s', (_label, value, expected) => {
    expect(isCanvasEventList(value)).toBe(expected);
  });
});

/**
 * Not `*.canvas.test.*`, deliberately: this asserts a property of every baseline rather
 * than pinning a picture, and `suiteShape.test.ts` requires a canvas suite to hold
 * nothing but `toMatchCanvasSnapshot` calls.
 */
describe('committed baselines', () => {
  /** `exports[`<key>`] = `<body>`;`, with jest's backtick escaping undone. */
  const BLOCK = /^exports\[`((?:[^`\\]|\\.)*)`\] = `((?:[^`\\]|\\.)*)`;$/gms;

  const baselines = globSync('src/**/__snapshots__/*.snap')
    .sort()
    .flatMap((file) =>
      [...readFileSync(file, 'utf8').matchAll(BLOCK)].map(([, key, body]) => ({
        key,
        body: body.replace(/\\(`|\\|\$\{)/g, '$1'),
      }))
    );

  it('finds the baselines to check', () => {
    expect(baselines.length).toBeGreaterThan(150);
  });

  it.each(baselines.map(({ key, body }) => [key, body]))(
    '%s survives the compare viewer’s JSON parse',
    (_key, body) => {
      const parsed = parseSnapshotJson(body) as SnapshotCanvasEvent[];
      // Round-tripped, so the parse is lossless rather than merely successful. A layer
      // that drew nothing is `[]`, which the serializer leaves to the default printer.
      expect(parsed.length ? serializeCanvasEvents(parsed) : '[]').toBe(body.trim());
    }
  );
});
