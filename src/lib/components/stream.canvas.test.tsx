import { type FieldConfigSource, FieldMatcherID, FieldType, toDataFrame } from '@grafana/data';
import { normalizeCanvasEvents } from 'test/canvas';
import { height, width } from 'test/panel';
import { ambiguousFrame, logVolumeFrame, longFrame, renderStream } from 'test/streamCanvas';

// Stream (theme river) canvas snapshots: a case per editor option, mirroring
// `multivariate.canvas.test.tsx`. Every test here is a snapshot test — the baseline *is*
// the assertion, reviewed as an image, so a geometry or style regression surfaces as a
// diff.
//
// The ribbon counts and the "this option reaches ECharts at all" matrix are claims about
// counts and differences rather than about one picture, so they live next door in
// `stream.integration.test.tsx` and commit no baseline.
//
// See `test/streamCanvas.tsx` for the harness, the editor mode and the three fixtures.

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

  describe('bubble variant', () => {
    // The family's second render: one `singleAxis` row per layer, each with a
    // `scatter` whose symbol size encodes the value. A different series type and a
    // different number of axes, so nothing about this can look like the river.
    it('one row of value-sized bubbles per layer', async () => {
      const { defaultEvents, seriesEvents } = await renderStream([logVolumeFrame], { streamChartType: 'bubble' });

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });

    // `symbolSize` scales every row from the layer set's shared maximum, so raising
    // the cap grows every bubble.
    it('max bubble size', async () => {
      const { defaultEvents, seriesEvents } = await renderStream([logVolumeFrame], {
        streamChartType: 'bubble',
        streamBubbleMaxSize: 40,
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
