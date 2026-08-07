import { type FieldConfigSource, FieldMatcherID, FieldType, toDataFrame } from '@grafana/data';
import { normalizeCanvasEvents } from 'test/canvas';
import { ambiguousFrame, fillCount, logVolumeFrame, longFrame, renderStream } from 'test/streamCanvas';
import { type PanelOptions } from 'types';

// Stream (theme river) integration coverage: the family's render smoke tests, which
// count filled paths rather than pin them, and the option matrix that states each
// option reaches ECharts at all.
//
// **No baselines here, by construction.** The smoke tests catch a missing
// series/component registration, a throwing chart module, or a `singleAxis` that never
// lays out — "one ribbon per layer" is a count, and a stored picture would assert it in
// a thousand lines. The option matrix is a *difference* between two renders, which is
// the one thing a pair of baselines cannot state on its own. The geometry and style each
// option produces is snapshotted next door in `stream.canvas.test.tsx`.
//
// See `test/streamCanvas.tsx` for the harness, the editor mode and the three fixtures.

describe('stream ribbon counts', () => {
  it('paints one ribbon per numeric field', async () => {
    const { seriesEvents } = await renderStream([logVolumeFrame]);

    expect(fillCount(seriesEvents)).toBe(3);
  });

  it('paints one ribbon per label value for a long frame', async () => {
    const { seriesEvents } = await renderStream([longFrame]);

    expect(fillCount(seriesEvents)).toBe(2);
  });

  it('paints one ribbon per frame for a one-frame-per-series response', async () => {
    const frame = (name: string, values: number[]) =>
      toDataFrame({
        name,
        fields: [
          { name: 'time', type: FieldType.time, values: [1783137094497, 1783144294497] },
          { name: 'Value', type: FieldType.number, values, config: { displayName: name } },
        ],
      });

    const { seriesEvents } = await renderStream([frame('a', [1, 2]), frame('b', [3, 4])]);

    expect(fillCount(seriesEvents)).toBe(2);
  });

  it('draws a gappy layer as a zero-height ribbon rather than breaking it', async () => {
    const gappy = toDataFrame({
      fields: [
        { name: 'time', type: FieldType.time, values: [1783137094497, 1783140694497, 1783144294497] },
        { name: 'a', type: FieldType.number, values: [5, null, 5], config: { displayName: 'a' } },
        { name: 'b', type: FieldType.number, values: [5, 5, 5], config: { displayName: 'b' } },
      ],
    });

    // A stacked ribbon has no way to draw a hole, so the null becomes 0 and the
    // ribbon still paints as one continuous shape.
    const { seriesEvents } = await renderStream([gappy]);

    expect(fillCount(seriesEvents)).toBe(2);
  });
});
// A snapshot identical to the base case means the option never reached ECharts,
// which a fresh baseline would silently bless. These assertions state that
// requirement directly, so they hold before any baseline exists and keep holding
// if one is ever regenerated against a broken build.
//
// `emphasis` is deliberately absent: it only changes the hover state, so its
// resting paint *is* the base paint (see the case above).
describe('stream options reach ECharts', () => {
  const paintOf = async (options: Partial<PanelOptions>, fieldConfig?: FieldConfigSource) =>
    normalizeCanvasEvents((await renderStream([logVolumeFrame], options, fieldConfig)).seriesEvents);

  // A single case row, so `it.each` always passes exactly one argument: with a
  // tuple table, a row shorter than the callback's arity makes jest-each hand the
  // callback a `done` in the missing slot.
  interface OptionCase {
    name: string;
    options: Partial<PanelOptions>;
    fieldConfig?: FieldConfigSource;
    /** The paint this case must differ from; base when omitted. */
    against?: Partial<PanelOptions>;
  }

  // Rendered once per describe rather than per case — each render is a real
  // ECharts mount, and two of them exceed the default per-test timeout.
  const paints = new Map<string, unknown>();
  const keyOf = (options: Partial<PanelOptions>) => JSON.stringify(options);
  const cachedPaint = async (options: Partial<PanelOptions>) => {
    if (!paints.has(keyOf(options))) {
      paints.set(keyOf(options), await paintOf(options));
    }
    return paints.get(keyOf(options));
  };

  const cases: OptionCase[] = [
    { name: 'layer labels', options: { streamShowLabels: true } },
    { name: 'boundary gap', options: { streamBoundaryGap: 2 } },
    { name: 'ribbon opacity', options: { streamFillOpacity: 50 } },
    { name: 'ribbon border', options: { streamBorderWidth: 2, streamBorderColor: '#000000' } },
    // The label sub-options only matter relative to a labelled river, not to base.
    // `label.margin` is the only placement lever ECharts honours for this series —
    // `label.position` is nulled out by `ThemeRiverView`, which this assertion
    // caught when the option was first written as a Left/Right radio.
    {
      name: 'label offset',
      options: { streamShowLabels: true, streamLabelMargin: -40 },
      against: { streamShowLabels: true },
    },
    {
      name: 'label font size',
      options: { streamShowLabels: true, streamLabelFontSize: 18 },
      against: { streamShowLabels: true },
    },
    {
      name: 'byName fixed color',
      options: {},
      fieldConfig: {
        defaults: {},
        overrides: [
          {
            matcher: { id: FieldMatcherID.byName, options: 'warn' },
            properties: [{ id: 'color', value: { mode: 'fixed', fixedColor: '#ff0000' } }],
          },
        ],
      },
    },
    // The second render variant, and the one option that only applies to it.
    { name: 'bubble variant', options: { streamChartType: 'bubble' } },
    {
      name: 'max bubble size',
      options: { streamChartType: 'bubble', streamBubbleMaxSize: 40 },
      against: { streamChartType: 'bubble' },
    },
  ];

  it.each(cases)('$name changes the rendered series', async ({ options, fieldConfig, against = {} }) => {
    const configured = fieldConfig ? await paintOf(options, fieldConfig) : await cachedPaint(options);

    expect(configured).not.toEqual(await cachedPaint(against));
  });

  // The "Layers from" radio picks between two different layer sets on one frame,
  // which is the whole reason it is Default-tier.
  it('Fields and Labels sources differ on an ambiguous frame', async () => {
    const paint = async (options: Partial<PanelOptions>) =>
      normalizeCanvasEvents((await renderStream([ambiguousFrame], options)).seriesEvents);

    expect(await paint({ streamLayerSource: 'labels' })).not.toEqual(await paint({ streamLayerSource: 'fields' }));
  });
});
