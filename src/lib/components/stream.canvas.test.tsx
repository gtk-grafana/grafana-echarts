import { type FieldConfigSource, FieldMatcherID, FieldType, toDataFrame } from '@grafana/data';
import { render } from '@testing-library/react';
import { normalizeCanvasEvents, SERIES_ZLEVEL } from 'test/canvas';
import { getComponent, getSettledSeriesCanvasEvents, height, width } from 'test/panel';
import { type PanelOptions } from 'types';

// Stream (theme river) canvas coverage: the family's render smoke tests plus a
// case per editor option, mirroring `multivariate.canvas.test.tsx`.
//
// The smoke tests count filled paths — one per rendered ribbon — which is what
// catches a missing series/component registration, a throwing chart module, or a
// `singleAxis` that never lays out. The option matrix below snapshots the
// series-layer draw calls, so a geometry or style regression surfaces as a diff.
//
// Series are placed on SERIES_ZLEVEL, so only the series-layer draw calls are
// committed (the axis paints on the default layer); see `Panel.canvas.test.tsx`
// for the layered-capture rationale. Events are read after a forced single repaint
// — the themeRiver view sets a clip path it removes on a timer when animation is
// enabled, the same multi-paint hazard `getSettledSeriesCanvasEvents` exists for.
//
// Rendered in Advanced editor mode so the advanced options these cases exercise
// (boundary gap, ribbon style, emphasis, label placement) are respected as-is. In
// Default mode `applyStreamEditorModeDefaults` resets every advanced option —
// including forcing `animation.enabled` back on, which would clobber the
// `animation: { enabled: false }` these snapshots rely on for determinism. The
// Default-mode reset itself is covered by the `applyStreamEditorModeDefaults` unit
// tests in `options/stream.test.ts`.
const canvasOptions = (extra: Partial<PanelOptions> = {}): Partial<PanelOptions> => ({
  zLevel: { series: SERIES_ZLEVEL },
  animation: { enabled: false },
  editorMode: 'advanced',
  ...extra,
});

const renderStream = async (
  frames: Parameters<typeof getComponent>[0],
  options: Partial<PanelOptions> = {},
  fieldConfig?: FieldConfigSource
) => {
  const { container } = render(
    getComponent(frames, 'themeRiver', canvasOptions(options), undefined, undefined, 'stream', fieldConfig)
  );
  return getSettledSeriesCanvasEvents(container);
};

/**
 * Filled paths in the *final* repaint — one per rendered ribbon.
 *
 * jest-canvas-mock accumulates draw calls across repaints and never resets on
 * `clearRect`, and the themeRiver view still paints the series layer twice per
 * render (each paint opening with a `clearRect`), so the events are sliced to the
 * last paint before counting.
 */
const fillCount = (events: Array<{ type: string }>) => {
  const lastPaint = events.map((event) => event.type).lastIndexOf('clearRect');
  return events.slice(lastPaint === -1 ? 0 : lastPaint).filter((event) => event.type === 'fill').length;
};

// Wide frame: one layer per numeric field, the shape Prometheus/Loki produce once
// each series lands in its own field. The base case every option builds on.
const logVolumeFrame = toDataFrame({
  fields: [
    { name: 'time', type: FieldType.time, values: [1783137094497, 1783140694497, 1783144294497, 1783147894497] },
    { name: 'error', type: FieldType.number, values: [4, 6, 3, 5], config: { displayName: 'error' } },
    { name: 'warn', type: FieldType.number, values: [8, 5, 9, 7], config: { displayName: 'warn' } },
    { name: 'info', type: FieldType.number, values: [20, 24, 18, 22], config: { displayName: 'info' } },
  ],
});

// Long frame: time + one numeric + a label column, the SQL / SQL-expression shape
// the converter pivots into one layer per label value.
const longFrame = toDataFrame({
  fields: [
    { name: 'time', type: FieldType.time, values: [1783137094497, 1783137094497, 1783144294497, 1783144294497] },
    { name: 'level', type: FieldType.string, values: ['error', 'warn', 'error', 'warn'] },
    { name: 'count', type: FieldType.number, values: [4, 8, 3, 9] },
  ],
});

// The ambiguous frame the "Layers from" radio exists for: a time field, a string
// column *and* two numeric columns, which reads equally well as "two metrics" or
// "one metric per label". Auto keeps the fields path; `labels` pivots on `level`
// and uses the first numeric field as the value.
const ambiguousFrame = toDataFrame({
  fields: [
    { name: 'time', type: FieldType.time, values: [1783137094497, 1783137094497, 1783144294497, 1783144294497] },
    { name: 'level', type: FieldType.string, values: ['error', 'warn', 'error', 'warn'] },
    { name: 'count', type: FieldType.number, values: [4, 8, 3, 9] },
    { name: 'bytes', type: FieldType.number, values: [40, 80, 30, 90] },
  ],
});

describe('stream (themeRiver) canvas renders', () => {
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

describe('stream (themeRiver) canvas snapshots', () => {
  describe('base', () => {
    // Three stacked ribbons over the single time axis, on ECharts' own geometry:
    // no `boundaryGap`, `itemStyle` or `emphasis` key is written at the defaults.
    it('one ribbon per numeric field', async () => {
      const { defaultEvents, seriesEvents } = await renderStream([logVolumeFrame]);

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });

    // A single layer still stacks — the ribbon is the whole river, centred by the
    // boundary gap rather than sitting on a baseline.
    it('a single layer', async () => {
      const single = toDataFrame({
        fields: [
          { name: 'time', type: FieldType.time, values: [1783137094497, 1783140694497, 1783144294497] },
          { name: 'error', type: FieldType.number, values: [4, 6, 3], config: { displayName: 'error' } },
        ],
      });

      const { defaultEvents, seriesEvents } = await renderStream([single]);

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });
  });

  describe('layer source', () => {
    // The long pivot: one ribbon per distinct `level`, from a frame the converter
    // reads as long without being told to.
    it('labels path on an unambiguously long frame', async () => {
      const { defaultEvents, seriesEvents } = await renderStream([longFrame]);

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });

    // The same ambiguous frame read both ways. `fields` gives two ribbons (`count`
    // and `bytes`), `labels` gives two ribbons (`error` and `warn`) built from
    // `count` — different data, so these two snapshots must differ.
    it('Fields source on an ambiguous frame', async () => {
      const { defaultEvents, seriesEvents } = await renderStream([ambiguousFrame], { streamLayerSource: 'fields' });

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });

    it('Labels source on the same ambiguous frame', async () => {
      const { defaultEvents, seriesEvents } = await renderStream([ambiguousFrame], { streamLayerSource: 'labels' });

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });
  });

  describe('contract edge cases', () => {
    // `null` ⇒ `0`: the ribbon pinches to zero height instead of breaking, the one
    // semantic that differs sharply from the cartesian families.
    it('nulls collapse to zero-height', async () => {
      const gappy = toDataFrame({
        fields: [
          { name: 'time', type: FieldType.time, values: [1783137094497, 1783140694497, 1783144294497] },
          { name: 'a', type: FieldType.number, values: [10, null, 12], config: { displayName: 'a' } },
          { name: 'b', type: FieldType.number, values: [5, 5, 5], config: { displayName: 'b' } },
        ],
      });

      const { defaultEvents, seriesEvents } = await renderStream([gappy]);

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });

    // Negative values are passed through unclamped, which distorts the stacked
    // baseline: the ribbons cross. Snapshotted so the distortion is a documented
    // render rather than a bug report.
    it('negative values distort the stacked baseline', async () => {
      const mixedSigns = toDataFrame({
        fields: [
          { name: 'time', type: FieldType.time, values: [1783137094497, 1783140694497, 1783144294497] },
          { name: 'a', type: FieldType.number, values: [10, -8, 12], config: { displayName: 'a' } },
          { name: 'b', type: FieldType.number, values: [5, 6, 5], config: { displayName: 'b' } },
        ],
      });

      const { defaultEvents, seriesEvents } = await renderStream([mixedSigns]);

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });
  });

  describe('layer labels', () => {
    // ECharts draws these by default; the plugin turns them off, so "on" is the
    // case that adds draw calls (the label text) to the base.
    it('labels on', async () => {
      const { defaultEvents, seriesEvents } = await renderStream([logVolumeFrame], { streamShowLabels: true });

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });

    // `label.margin`, the family's only working placement lever: a negative offset
    // moves each name from just-left-of-the-ribbon onto the band itself. ECharts
    // 6.1.0 ignores `label.position` here (`ThemeRiverView` nulls it out), which is
    // why there is no position case.
    it('label offset onto the ribbon', async () => {
      const { defaultEvents, seriesEvents } = await renderStream([logVolumeFrame], {
        streamShowLabels: true,
        streamLabelMargin: -40,
      });

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });

    it('label font size', async () => {
      const { defaultEvents, seriesEvents } = await renderStream([logVolumeFrame], {
        streamShowLabels: true,
        streamLabelFontSize: 18,
      });

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });
  });

  describe('geometry', () => {
    // `series.boundaryGap`: less orthogonal padding, so the river fills more of the
    // panel. Every ribbon's geometry moves.
    it('boundary gap', async () => {
      const { defaultEvents, seriesEvents } = await renderStream([logVolumeFrame], { streamBoundaryGap: 2 });

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });
  });

  describe('ribbon style', () => {
    // `itemStyle.opacity` (0–100 scaled to 0–1): translucent ribbons.
    it('ribbon opacity', async () => {
      const { defaultEvents, seriesEvents } = await renderStream([logVolumeFrame], { streamFillOpacity: 50 });

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });

    // `itemStyle.borderWidth` / `borderColor`: a stroke around each band, which is
    // how two similarly-colored neighbours are told apart. Adds `stroke` calls.
    it('ribbon border', async () => {
      const { defaultEvents, seriesEvents } = await renderStream([logVolumeFrame], {
        streamBorderWidth: 2,
        streamBorderColor: '#000000',
      });

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });
  });

  describe('emphasis', () => {
    // `emphasis.focus: 'self'` only changes the *hover* state, so the resting paint
    // is identical to base by design — the snapshot guards the option reaching
    // ECharts without a hover, and the state itself is verified in the browser
    // against `themeriver-options.json`.
    it('hover emphasis self', async () => {
      const { defaultEvents, seriesEvents } = await renderStream([logVolumeFrame], { streamEmphasisFocus: 'self' });

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });
  });

  describe('field config', () => {
    // A byName fixed-color override pins the `warn` ribbon — applied to the frames
    // via the harness `fieldConfig` (as real Grafana does), so it reaches the
    // converter and rides on the series palette in layer order.
    it('byName fixed-color override', async () => {
      const fieldConfig: FieldConfigSource = {
        defaults: {},
        overrides: [
          {
            matcher: { id: FieldMatcherID.byName, options: 'warn' },
            properties: [{ id: 'color', value: { mode: 'fixed', fixedColor: '#ff0000' } }],
          },
        ],
      };

      const { defaultEvents, seriesEvents } = await renderStream([logVolumeFrame], {}, fieldConfig);

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });

    // The legend's visibility toggle persists as a `custom.hideFrom` byName
    // override: the hidden layer leaves both the data and the palette, so the
    // remaining ribbons keep their own colors and restack.
    it('hidden layer', async () => {
      const fieldConfig: FieldConfigSource = {
        defaults: {},
        overrides: [
          {
            matcher: { id: FieldMatcherID.byName, options: 'warn' },
            properties: [{ id: 'custom.hideFrom', value: { viz: true, legend: false, tooltip: false } }],
          },
        ],
      };

      const { defaultEvents, seriesEvents } = await renderStream([logVolumeFrame], {}, fieldConfig);

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });
  });
});

// A snapshot identical to the base case means the option never reached ECharts,
// which a fresh baseline would silently bless. These assertions state that
// requirement directly, so they hold before any baseline exists and keep holding
// if one is ever regenerated against a broken build.
//
// `emphasis` is deliberately absent: it only changes the hover state, so its
// resting paint *is* the base paint (see the case above).
describe('stream (themeRiver) options reach ECharts', () => {
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
