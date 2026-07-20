import { FieldColorModeId, type FieldConfigSource, FieldType, toDataFrame } from '@grafana/data';
import { render } from '@testing-library/react';
import { removeCanvasTransforms } from 'jest-canvas-mock-compare';
import { removeCanvasClear, SERIES_ZLEVEL } from 'test/canvas';
import { getComponent, getSeriesCanvasEvents, height, width } from 'test/panel';

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
  // Wide: each numeric field is one slice. The fields have uneven non-null
  // counts, so Sum and Mean produce different *proportions* (not just scaled
  // values) — the pie is proportional, so this makes the two reducer snapshots
  // genuinely differ. Sum → 120 / 60 / 15; Mean → 40 / 60 / 7.5.
  const wideFrame = toDataFrame({
    fields: [
      { name: 'A', type: FieldType.number, values: [30, 40, 50], config: { displayName: 'A' } },
      { name: 'B', type: FieldType.number, values: [60, null, null], config: { displayName: 'B' } },
      { name: 'C', type: FieldType.number, values: [5, 10, null], config: { displayName: 'C' } },
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

  describe('type', () => {
    // Donut = a pie with an inner hole (series radius [inner, outer]). The reducer
    // cases above cover the default pie, so this guards the donut radius path.
    it('donut (inner hole)', async () => {
      const { defaultEvents, seriesEvents } = await renderPie([wideFrame], {
        reduceOptions: { calcs: ['sum'], values: false },
        pieType: 'donut',
      });

      expect(removeCanvasTransforms(removeCanvasClear(seriesEvents))).toMatchCanvasSnapshot(defaultEvents, {
        width,
        height,
      });
    });
  });

  describe('sort', () => {
    // Slices default to Descending (largest first); ascending reverses the order,
    // so this guards that the `sort` option reorders the rendered slices.
    it('ascending (smallest first)', async () => {
      const { defaultEvents, seriesEvents } = await renderPie([wideFrame], {
        reduceOptions: { calcs: ['sum'], values: false },
        sort: 'asc',
      });

      expect(removeCanvasTransforms(removeCanvasClear(seriesEvents))).toMatchCanvasSnapshot(defaultEvents, {
        width,
        height,
      });
    });
  });

  describe('min slice angle', () => {
    // A long-tail frame: two dominant slices plus two hairline slices that, at
    // their true share, would be near-invisible. `minAngle: 10` enlarges the tiny
    // slices to at least 10°, so this guards that getPieMinAngle reaches the series
    // and reshapes the render (the default 0 is covered by the reducer cases above).
    const longTailFrame = toDataFrame({
      fields: [
        { name: 'Big', type: FieldType.number, values: [100], config: { displayName: 'Big' } },
        { name: 'Mid', type: FieldType.number, values: [50], config: { displayName: 'Mid' } },
        { name: 'Tiny', type: FieldType.number, values: [2], config: { displayName: 'Tiny' } },
        { name: 'Sliver', type: FieldType.number, values: [1], config: { displayName: 'Sliver' } },
      ],
    });

    it('enlarges tiny long-tail slices', async () => {
      const { defaultEvents, seriesEvents } = await renderPie([longTailFrame], {
        reduceOptions: { calcs: ['sum'], values: false },
        minAngle: 10,
      });

      expect(removeCanvasTransforms(removeCanvasClear(seriesEvents))).toMatchCanvasSnapshot(defaultEvents, {
        width,
        height,
      });
    });
  });

  describe('start/end angle', () => {
    // Advanced arc range: start 180 / end 360 renders a half-pie (bottom
    // semicircle), and combined with donut a semicircle donut. Guards that
    // getPieAngles threads startAngle/endAngle into the series.
    it('half-pie (start 180 / end 360)', async () => {
      const { defaultEvents, seriesEvents } = await renderPie([wideFrame], {
        reduceOptions: { calcs: ['sum'], values: false },
        startAngle: 180,
        endAngle: 360,
      });

      expect(removeCanvasTransforms(removeCanvasClear(seriesEvents))).toMatchCanvasSnapshot(defaultEvents, {
        width,
        height,
      });
    });

    it('semicircle donut (donut + start 180 / end 360)', async () => {
      const { defaultEvents, seriesEvents } = await renderPie([wideFrame], {
        reduceOptions: { calcs: ['sum'], values: false },
        pieType: 'donut',
        startAngle: 180,
        endAngle: 360,
      });

      expect(removeCanvasTransforms(removeCanvasClear(seriesEvents))).toMatchCanvasSnapshot(defaultEvents, {
        width,
        height,
      });
    });
  });

  describe('labels', () => {
    // Slice-label content (Name / Value / Percent) rendered on the slices via the
    // "Labels" option. Exercises getPieContentLabel's formatter during a real
    // render (the default Name label is covered by the reducer cases above).
    it('name + value + percent labels', async () => {
      const { defaultEvents, seriesEvents } = await renderPie([wideFrame], {
        reduceOptions: { calcs: ['sum'], values: false },
        displayLabels: ['name', 'value', 'percent'],
      });

      expect(removeCanvasTransforms(removeCanvasClear(seriesEvents))).toMatchCanvasSnapshot(defaultEvents, {
        width,
        height,
      });
    });
  });

  describe('rose type', () => {
    // Rose (Nightingale) rendering encodes each slice's value as its radius or
    // area on top of the angle. Uses a near-equal frame so slices barely differ
    // by angle alone; radius vs. area then reshape them visibly and differently
    // (area scales by sqrt of value). The default `none` is covered by the
    // reducer cases above, so these guard the two opted-in rose paths.
    const nearEqualFrame = toDataFrame({
      fields: [
        { name: 'category', type: FieldType.string, values: ['A', 'B', 'C', 'D'] },
        { name: 'value', type: FieldType.number, values: [30, 28, 26, 24] },
      ],
    });

    it('radius (value as slice radius)', async () => {
      const { defaultEvents, seriesEvents } = await renderPie([nearEqualFrame], {
        reduceOptions: { calcs: [], values: true },
        roseType: 'radius',
      });

      expect(removeCanvasTransforms(removeCanvasClear(seriesEvents))).toMatchCanvasSnapshot(defaultEvents, {
        width,
        height,
      });
    });

    it('area (value as slice area)', async () => {
      const { defaultEvents, seriesEvents } = await renderPie([nearEqualFrame], {
        reduceOptions: { calcs: [], values: true },
        roseType: 'area',
      });

      expect(removeCanvasTransforms(removeCanvasClear(seriesEvents))).toMatchCanvasSnapshot(defaultEvents, {
        width,
        height,
      });
    });
  });

  describe('label position', () => {
    // Placement of the slice labels (ECharts `label.position`). The reducer/labels
    // cases above cover the default `outside`, so these guard the Advanced-only
    // `inside` (labels drawn on the slices) and `center` (a single donut-hole
    // readout) paths through getPieContentLabel.
    it('inside (labels on the slices)', async () => {
      const { defaultEvents, seriesEvents } = await renderPie([wideFrame], {
        reduceOptions: { calcs: ['sum'], values: false },
        displayLabels: ['name', 'value'],
        labelPosition: 'inside',
      });

      expect(removeCanvasTransforms(removeCanvasClear(seriesEvents))).toMatchCanvasSnapshot(defaultEvents, {
        width,
        height,
      });
    });

    it('center on a donut (single readout in the hole)', async () => {
      const { defaultEvents, seriesEvents } = await renderPie([wideFrame], {
        reduceOptions: { calcs: ['sum'], values: false },
        pieType: 'donut',
        displayLabels: ['value'],
        labelPosition: 'center',
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

  // Long category names, one row per category — exercises label overflow/width.
  const longNamesFrame = toDataFrame({
    fields: [
      {
        name: 'category',
        type: FieldType.string,
        values: ['Engineering & Platform', 'Customer Support Operations', 'Sales and Marketing', 'Finance'],
      },
      { name: 'value', type: FieldType.number, values: [43, 25, 30, 22] },
    ],
  });

  // A dominant slice plus several tiny ones — exercises min-show-label-angle.
  const longTailFrame = toDataFrame({
    fields: [
      { name: 'category', type: FieldType.string, values: ['Major', 'Tiny1', 'Tiny2', 'Tiny3', 'Tiny4'] },
      { name: 'value', type: FieldType.number, values: [200, 3, 2, 2, 1] },
    ],
  });

  describe('label font size', () => {
    // Advanced-only label.fontSize override; larger labels with all content shown.
    it('enlarged slice labels', async () => {
      const { defaultEvents, seriesEvents } = await renderPie([wideFrame], {
        reduceOptions: { calcs: ['sum'], values: false },
        displayLabels: ['name', 'value', 'percent'],
        labelFontSize: 24,
      });

      expect(removeCanvasTransforms(removeCanvasClear(seriesEvents))).toMatchCanvasSnapshot(defaultEvents, {
        width,
        height,
      });
    });
  });

  // --- Advanced (Tier 3) interactivity & polish -----------------------------
  // Each block exercises one Advanced option's ECharts wiring during a real
  // render. Emphasis is a hover-only state (not fired by the static render), so
  // it is verified by unit assertion in `options/pie.test.ts` instead.

  describe('select / explode', () => {
    // A static `selectedOffset` pushes the first slice outward even without a
    // click, so the exploded slice is visible in the snapshot.
    it('single selection with an explode offset', async () => {
      const { defaultEvents, seriesEvents } = await renderPie([wideFrame], {
        reduceOptions: { calcs: ['sum'], values: false },
        selectedMode: 'single',
        selectedOffset: 20,
      });

      expect(removeCanvasTransforms(removeCanvasClear(seriesEvents))).toMatchCanvasSnapshot(defaultEvents, {
        width,
        height,
      });
    });
  });

  describe('label overflow', () => {
    // Advanced-only label.overflow + label.width; long names truncate at 80px.
    it('truncated long labels', async () => {
      const { defaultEvents, seriesEvents } = await renderPie([longNamesFrame], {
        reduceOptions: { calcs: [], values: true },
        displayLabels: ['name'],
        labelOverflow: 'truncate',
        labelWidth: 80,
      });

      expect(removeCanvasTransforms(removeCanvasClear(seriesEvents))).toMatchCanvasSnapshot(defaultEvents, {
        width,
        height,
      });
    });
  });

  describe('rounded corners', () => {
    // A non-zero itemStyle.borderRadius rounds each slice's corners.
    it('slice border radius', async () => {
      const { defaultEvents, seriesEvents } = await renderPie([wideFrame], {
        reduceOptions: { calcs: ['sum'], values: false },
        sliceBorderRadius: 12,
      });

      expect(removeCanvasTransforms(removeCanvasClear(seriesEvents))).toMatchCanvasSnapshot(defaultEvents, {
        width,
        height,
      });
    });
  });

  describe('empty circle', () => {
    // An all-zero frame: `showEmptyCircle` draws the placeholder ring, while
    // `stillShowZeroSum: false` suppresses the even zero-sum pie. The two options
    // produce visibly different renders on the same empty data.
    const zeroFrame = toDataFrame({
      fields: [
        { name: 'A', type: FieldType.number, values: [0], config: { displayName: 'A' } },
        { name: 'B', type: FieldType.number, values: [0], config: { displayName: 'B' } },
      ],
    });

    it('show empty circle on a zero-sum frame', async () => {
      const { defaultEvents, seriesEvents } = await renderPie([zeroFrame], {
        reduceOptions: { calcs: ['sum'], values: false },
        showEmptyCircle: true,
        stillShowZeroSum: false,
      });

      expect(removeCanvasTransforms(removeCanvasClear(seriesEvents))).toMatchCanvasSnapshot(defaultEvents, {
        width,
        height,
      });
    });
  });

  describe('clockwise', () => {
    // Counter-clockwise layout reverses the rendered slice order.
    it('counter-clockwise slice order', async () => {
      const { defaultEvents, seriesEvents } = await renderPie([wideFrame], {
        reduceOptions: { calcs: ['sum'], values: false },
        clockwise: false,
      });

      expect(removeCanvasTransforms(removeCanvasClear(seriesEvents))).toMatchCanvasSnapshot(defaultEvents, {
        width,
        height,
      });
    });
  });

  describe('label color', () => {
    // An explicit label color overrides the theme text color in getPieLabelStyle.
    it('name labels tinted with a custom color', async () => {
      const { defaultEvents, seriesEvents } = await renderPie([wideFrame], {
        reduceOptions: { calcs: ['sum'], values: false },
        displayLabels: ['name'],
        labelColor: '#ff0000',
      });

      expect(removeCanvasTransforms(removeCanvasClear(seriesEvents))).toMatchCanvasSnapshot(defaultEvents, {
        width,
        height,
      });
    });
  });

  describe('min show label angle', () => {
    // Advanced-only series.minShowLabelAngle; tiny-slice labels are hidden.
    it('hides labels on tiny slices', async () => {
      const { defaultEvents, seriesEvents } = await renderPie([longTailFrame], {
        reduceOptions: { calcs: [], values: true },
        displayLabels: ['name'],
        minShowLabelAngle: 10,
      });

      expect(removeCanvasTransforms(removeCanvasClear(seriesEvents))).toMatchCanvasSnapshot(defaultEvents, {
        width,
        height,
      });
    });
  });

  describe('slice separation', () => {
    // Advanced-only itemStyle.borderWidth/borderColor; a border between slices.
    it('bordered slices', async () => {
      const { defaultEvents, seriesEvents } = await renderPie([wideFrame], {
        reduceOptions: { calcs: ['sum'], values: false },
        sliceBorderWidth: 2,
        sliceBorderColor: '#000000',
      });

      expect(removeCanvasTransforms(removeCanvasClear(seriesEvents))).toMatchCanvasSnapshot(defaultEvents, {
        width,
        height,
      });
    });
  });

  describe('custom radius/center', () => {
    // Advanced-only radius + center overrides; a smaller off-center donut.
    it('custom inner/outer radius and center', async () => {
      const { defaultEvents, seriesEvents } = await renderPie([wideFrame], {
        reduceOptions: { calcs: ['sum'], values: false },
        innerRadius: 40,
        outerRadius: 60,
        centerX: 30,
      });

      expect(removeCanvasTransforms(removeCanvasClear(seriesEvents))).toMatchCanvasSnapshot(defaultEvents, {
        width,
        height,
      });
    });
  });

  describe('label text shadow', () => {
    // Re-enables the ECharts label drop shadow that getPieLabelStyle zeroes by
    // default; visible labels are needed for the shadow to paint.
    it('text shadow on visible labels', async () => {
      const { defaultEvents, seriesEvents } = await renderPie([wideFrame], {
        reduceOptions: { calcs: ['sum'], values: false },
        displayLabels: ['name'],
        labelTextShadow: true,
      });

      expect(removeCanvasTransforms(removeCanvasClear(seriesEvents))).toMatchCanvasSnapshot(defaultEvents, {
        width,
        height,
      });
    });
  });
});
