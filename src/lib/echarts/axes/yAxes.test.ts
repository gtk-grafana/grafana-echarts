import { createTheme, type Field, FieldType, type ValueFormatter, toDataFrame } from '@grafana/data';
import { AxisPlacement } from '@grafana/schema';
import { AXIS_OFFSET_STEP, buildCartesianYAxes, getAxisGridSpacing } from 'lib/echarts/axes/yAxes';
import { getCartesianAxisStyle } from 'lib/echarts/options/cartesian';

const theme = createTheme();
const axisStyle = getCartesianAxisStyle(theme);
const baseYAxis = { type: 'value' as const, scale: true };
const fallback: ValueFormatter = (value) => ({ text: `fb:${value}` });

/** Build a numeric field with a unit and optional per-field axis placement. */
const field = (name: string, unit?: string, placement?: AxisPlacement): Field => {
  const frame = toDataFrame({
    fields: [
      {
        name,
        type: FieldType.number,
        values: [1, 2, 3],
        config: { unit, ...(placement ? { custom: { axisPlacement: placement } } : {}) },
      },
    ],
  });
  return frame.fields[0];
};

/** Numeric field carrying explicit standard Min/Max bounds. */
const fieldWithBounds = (name: string, min?: number, max?: number): Field =>
  toDataFrame({
    fields: [{ name, type: FieldType.number, values: [1, 2, 3], config: { min, max } }],
  }).fields[0];

const build = (fields: Field[]) =>
  buildCartesianYAxes({ fields, baseYAxis, axisStyle, theme, fallbackFormatter: fallback });

describe('buildCartesianYAxes', () => {
  it('returns a single fallback axis when there are no fields', () => {
    const { yAxis, seriesYAxisIndex, leftAxisCount, rightAxisCount } = build([]);

    expect(yAxis).toHaveLength(1);
    expect(seriesYAxisIndex).toEqual([]);
    expect(leftAxisCount).toBe(1);
    expect(rightAxisCount).toBe(0);
  });

  it('groups fields that share a unit onto one left axis', () => {
    const { yAxis, seriesYAxisIndex, leftAxisCount, rightAxisCount } = build([
      field('a', 'bytes'),
      field('b', 'bytes'),
    ]);

    expect(yAxis).toHaveLength(1);
    expect(seriesYAxisIndex).toEqual([0, 0]);
    expect(yAxis[0].position).toBe('left');
    expect(yAxis[0].offset).toBe(0);
    expect(leftAxisCount).toBe(1);
    expect(rightAxisCount).toBe(0);
  });

  it('puts the first unit on the left and additional units on the right (auto)', () => {
    const { yAxis, seriesYAxisIndex } = build([field('a', 'bytes'), field('b', 'percent')]);

    expect(yAxis).toHaveLength(2);
    expect(seriesYAxisIndex).toEqual([0, 1]);
    expect(yAxis[0].position).toBe('left');
    expect(yAxis[1].position).toBe('right');
  });

  it('only the first visible axis draws split lines', () => {
    const { yAxis } = build([field('a', 'bytes'), field('b', 'percent')]);

    expect(yAxis[0].splitLine?.show).toBe(true);
    expect(yAxis[1].splitLine?.show).toBe(false);
  });

  it('honors explicit Left/Right placement overrides', () => {
    const { yAxis } = build([field('a', 'bytes', AxisPlacement.Right), field('b', 'percent', AxisPlacement.Left)]);

    expect(yAxis[0].position).toBe('right');
    expect(yAxis[1].position).toBe('left');
  });

  it('stacks multiple axes on the same side with increasing offsets', () => {
    // Three units all forced right: offsets 0, STEP, 2*STEP.
    const { yAxis, rightAxisCount } = build([
      field('a', 'bytes', AxisPlacement.Right),
      field('b', 'percent', AxisPlacement.Right),
      field('c', 'watt', AxisPlacement.Right),
    ]);

    expect(yAxis.map((axis) => axis.offset)).toEqual([0, AXIS_OFFSET_STEP, 2 * AXIS_OFFSET_STEP]);
    expect(rightAxisCount).toBe(3);
  });

  it('hides a Hidden axis but still maps its series and reserves no space', () => {
    const { yAxis, seriesYAxisIndex, leftAxisCount, rightAxisCount } = build([
      field('a', 'bytes'),
      field('b', 'percent', AxisPlacement.Hidden),
    ]);

    expect(seriesYAxisIndex).toEqual([0, 1]);
    expect(yAxis[1].axisLabel?.show).toBe(false);
    expect(yAxis[1].axisTick?.show).toBe(false);
    // Hidden axis is not counted for grid spacing.
    expect(leftAxisCount).toBe(1);
    expect(rightAxisCount).toBe(0);
  });

  it('applies explicit Min/Max bounds from the field config', () => {
    const { yAxis } = build([fieldWithBounds('a', 0, 100)]);

    expect(yAxis[0].min).toBe(0);
    expect(yAxis[0].max).toBe(100);
  });

  it('applies only the bound that is set, leaving the other for auto-fit', () => {
    const { yAxis } = build([fieldWithBounds('a', undefined, 100)]);

    expect(yAxis[0].min).toBeUndefined();
    expect(yAxis[0].max).toBe(100);
  });

  it('omits Min/Max when neither is configured', () => {
    const { yAxis } = build([field('a', 'bytes')]);

    expect(yAxis[0].min).toBeUndefined();
    expect(yAxis[0].max).toBeUndefined();
  });

  it('reads Min/Max from the representative field of a unit group', () => {
    // Both fields share the empty-unit group; the first is representative.
    const { yAxis } = build([fieldWithBounds('a', -5, 5), fieldWithBounds('b', 0, 100)]);

    expect(yAxis).toHaveLength(1);
    expect(yAxis[0].min).toBe(-5);
    expect(yAxis[0].max).toBe(5);
  });

  it('formats each axis with its own unit formatter', () => {
    const { yAxis } = build([field('a', 'percent'), field('b', 'bytes')]);

    const percentFormatter = yAxis[0].axisLabel?.formatter as (value: number) => string;
    expect(percentFormatter(50)).toContain('%');
  });

  it('sends all auto-placed units to autoSide when provided (overlay default)', () => {
    // The heatmap overlay passes `right` so its axes clear the bucket axis; even
    // the first unit lands on the right instead of the usual left.
    const { yAxis, seriesYAxisIndex } = buildCartesianYAxes({
      fields: [field('a', 'bytes'), field('b', 'percent')],
      baseYAxis,
      axisStyle,
      theme,
      fallbackFormatter: fallback,
      autoSide: 'right',
    });

    expect(yAxis).toHaveLength(2);
    expect(yAxis[0].position).toBe('right');
    expect(yAxis[1].position).toBe('right');
    expect(yAxis.map((axis) => axis.offset)).toEqual([0, AXIS_OFFSET_STEP]);
    expect(seriesYAxisIndex).toEqual([0, 1]);
  });

  it('offsets left axes past an initial (reserved) left axis and counts it', () => {
    // initialLeftCount reserves the heatmap bucket's left slot, so an explicit
    // Left overlay axis stacks outboard of it.
    const { yAxis, leftAxisCount } = buildCartesianYAxes({
      fields: [field('a', 'bytes', AxisPlacement.Left)],
      baseYAxis,
      axisStyle,
      theme,
      fallbackFormatter: fallback,
      initialLeftCount: 1,
    });

    expect(yAxis[0].position).toBe('left');
    expect(yAxis[0].offset).toBe(AXIS_OFFSET_STEP);
    expect(leftAxisCount).toBe(2);
    expect(getAxisGridSpacing({ leftAxisCount, rightAxisCount: 0 }).left).toBe(AXIS_OFFSET_STEP);
  });

  it('does not draw split lines when a side is pre-occupied by an initial axis', () => {
    // The reserved (bucket) axis owns the grid split lines, so overlay axes stay
    // clear to avoid a doubled grid.
    const { yAxis } = buildCartesianYAxes({
      fields: [field('a', 'bytes')],
      baseYAxis,
      axisStyle,
      theme,
      fallbackFormatter: fallback,
      autoSide: 'right',
      initialLeftCount: 1,
    });

    expect(yAxis[0].splitLine?.show).toBe(false);
  });
});

describe('getAxisGridSpacing', () => {
  it('reserves offset space per extra axis beyond the first on each side', () => {
    expect(getAxisGridSpacing({ leftAxisCount: 1, rightAxisCount: 1 })).toEqual({ left: 0, right: 0 });
    expect(getAxisGridSpacing({ leftAxisCount: 2, rightAxisCount: 3 })).toEqual({
      left: AXIS_OFFSET_STEP,
      right: 2 * AXIS_OFFSET_STEP,
    });
  });
});
