import { FieldColorModeId, type FieldConfigSource, FieldType, toDataFrame } from '@grafana/data';
import { render } from '@testing-library/react';
import { removeCanvasTransforms } from 'jest-canvas-mock-compare';
import { removeCanvasClear, SERIES_ZLEVEL } from 'test/canvas';
import { getSeriesCanvasEvents, getComponent, height, width } from 'test/panel';

// Part-to-whole (pie) canvas snapshots, split out of `Panel.canvas.test.tsx`
// (mirrors `axis.canvas.test.tsx`). The pie is built from the shared slice
// resolver, which drives Grafana's `getFieldDisplayValues` off the standard
// `reduceOptions`: each numeric field is a slice (Calculate) or each row is a
// slice (All values), across every frame (multi-series). Rendered with family
// 'part-to-whole' so the panel resolves the pie chart module. Like hierarchy, the
// pie is axis-less, so only the series layer paints.
//
// Only the series-layer draw calls are committed; see `Panel.canvas.test.tsx` for
// the layered-capture rationale.

const pieOptions = (extra: Record<string, unknown> = {}) => ({
  zLevel: { series: SERIES_ZLEVEL },
  animation: { enabled: false },
  ...extra,
});

const renderPie = async (
  frames: Parameters<typeof getComponent>[0],
  options: Record<string, unknown>,
  fieldConfig?: FieldConfigSource
) => {
  const { container } = render(
    getComponent(frames, 'pie', pieOptions(options), undefined, undefined, 'part-to-whole', fieldConfig)
  );
  return getSeriesCanvasEvents(container);
};

describe('part-to-whole canvas renders', () => {
  // Wide: each numeric field is one slice. Sum and mean weight the fields
  // differently, so the two reducers yield visibly different slice sizes.
  const wideFrame = toDataFrame({
    fields: [
      { name: 'A', type: FieldType.number, values: [30, 40, 50], config: { displayName: 'A' } },
      { name: 'B', type: FieldType.number, values: [10, 20, 30], config: { displayName: 'B' } },
      { name: 'C', type: FieldType.number, values: [5, 15, 25], config: { displayName: 'C' } },
    ],
  });

  // A category label + a value field, one row per category (the All-values case).
  // No `displayName` on the value field, so each row's slice name falls through to
  // the category label rather than repeating the field name.
  const rowsFrame = toDataFrame({
    fields: [
      { name: 'category', type: FieldType.string, values: ['Sales', 'Admin', 'IT', 'Ops'] },
      { name: 'value', type: FieldType.number, values: [43, 25, 30, 22] },
    ],
  });

  describe('reducers', () => {
    it('Calculate sum — one slice per numeric field', async () => {
      const { defaultEvents, seriesEvents } = await renderPie([wideFrame], {
        reduceOptions: { calcs: ['sum'], values: false },
      });

      expect(removeCanvasTransforms(removeCanvasClear(seriesEvents))).toMatchCanvasSnapshot(defaultEvents, {
        width,
        height,
      });
    });

    it('Calculate mean — same fields, different slice sizes', async () => {
      const { defaultEvents, seriesEvents } = await renderPie([wideFrame], {
        reduceOptions: { calcs: ['mean'], values: false },
      });

      expect(removeCanvasTransforms(removeCanvasClear(seriesEvents))).toMatchCanvasSnapshot(defaultEvents, {
        width,
        height,
      });
    });

    it('All values with limit — one slice per row, capped', async () => {
      const { defaultEvents, seriesEvents } = await renderPie([rowsFrame], {
        reduceOptions: { calcs: [], values: true, limit: 3 },
      });

      expect(removeCanvasTransforms(removeCanvasClear(seriesEvents))).toMatchCanvasSnapshot(defaultEvents, {
        width,
        height,
      });
    });

    it('multi-frame — one slice per series', async () => {
      const frames = [
        toDataFrame({
          fields: [{ name: 'A', type: FieldType.number, values: [30, 40], config: { displayName: 'A' } }],
        }),
        toDataFrame({
          fields: [{ name: 'B', type: FieldType.number, values: [10, 20], config: { displayName: 'B' } }],
        }),
        toDataFrame({ fields: [{ name: 'C', type: FieldType.number, values: [5, 15], config: { displayName: 'C' } }] }),
      ];
      const { defaultEvents, seriesEvents } = await renderPie(frames, {
        reduceOptions: { calcs: ['sum'], values: false },
      });

      expect(removeCanvasTransforms(removeCanvasClear(seriesEvents))).toMatchCanvasSnapshot(defaultEvents, {
        width,
        height,
      });
    });
  });

  describe('color', () => {
    // A byName fixed-color override pins slice 'B' — applied to the frames via the
    // harness `fieldConfig` (as real Grafana does), so it reaches the converter.
    it('byName fixed-color override', async () => {
      const fieldConfig: FieldConfigSource = {
        defaults: {},
        overrides: [
          {
            matcher: { id: 'byName', options: 'B' },
            properties: [{ id: 'color', value: { mode: 'fixed', fixedColor: 'purple' } }],
          },
        ],
      };
      const { defaultEvents, seriesEvents } = await renderPie(
        [wideFrame],
        { reduceOptions: { calcs: ['sum'], values: false } },
        fieldConfig
      );

      expect(removeCanvasTransforms(removeCanvasClear(seriesEvents))).toMatchCanvasSnapshot(defaultEvents, {
        width,
        height,
      });
    });

    // A by-value continuous scheme colors each slice from its value (set on the
    // field, as Grafana applies to frames before render), so this differs from the
    // classic-palette pies above — guarding that the scheme is actually applied.
    it('by-value color scheme (All values)', async () => {
      const infernoFrame = toDataFrame({
        fields: [
          { name: 'category', type: FieldType.string, values: ['Sales', 'Admin', 'IT', 'Ops'] },
          {
            name: 'value',
            type: FieldType.number,
            values: [10, 40, 70, 100],
            config: { color: { mode: FieldColorModeId.ContinuousInferno } },
          },
        ],
      });
      const { defaultEvents, seriesEvents } = await renderPie([infernoFrame], {
        reduceOptions: { calcs: [], values: true },
      });

      expect(removeCanvasTransforms(removeCanvasClear(seriesEvents))).toMatchCanvasSnapshot(defaultEvents, {
        width,
        height,
      });
    });
  });
});
