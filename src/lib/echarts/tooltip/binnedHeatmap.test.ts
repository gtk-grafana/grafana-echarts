import { createTheme, FieldType, type ValueFormatter } from '@grafana/data';
import { type TopLevelFormatterParams } from 'echarts/types/dist/shared';
import { type BinnedHeatmapData } from 'lib/echarts/converters/binnedHeatmap';
import { buildBinnedHeatmapTooltipModel } from 'lib/echarts/tooltip/binnedHeatmap';
import { type TooltipModel } from 'lib/echarts/tooltip/types';

const baseData = (overrides: Partial<BinnedHeatmapData>): BinnedHeatmapData => ({
  cells: [],
  valueMin: 0,
  valueMax: 1,
  yMin: 0,
  yMax: 1,
  xIsTime: true,
  yBuckets: [],
  yLabelPlacement: 'bound',
  valueField: { name: 'value', type: FieldType.number, values: [], config: {} },
  ...overrides,
});

describe('buildBinnedHeatmapTooltipModel', () => {
  const theme = createTheme();
  // Mirrors getValueFormatter: empty values (null/undefined/NaN) render No value text.
  const formatValue: ValueFormatter = (value) => ({ text: value == null || Number.isNaN(value) ? 'null' : `${value}` });
  const ctx = { theme, timeZone: 'utc', formatValue };
  // Encoded cell tuple: [xStart, yStart, xEnd, yEnd, value].
  const asParams = (tuple: Array<number | null>) => ({ value: tuple }) as unknown as TopLevelFormatterParams;
  // Flatten the model to a searchable string (header + each row's label/value).
  const text = (model: TooltipModel) =>
    [model.header?.label, model.header?.value, ...model.rows.flatMap((row) => [row.label, row.value])].join(' ');

  it('formats the x header as time and shows the value and bucket name', () => {
    const formatter = buildBinnedHeatmapTooltipModel(
      baseData({
        xIsTime: true,
        yBuckets: [
          { start: 0, end: 10, label: '10' },
          { start: 10, end: 20, label: '20' },
        ],
      }),
      ctx
    );

    const model = formatter(asParams([0, 10, 60000, 20, 7]));

    // xStart = 0 -> unix epoch in the forced-UTC test timezone.
    expect(model.header?.value).toContain('1970-01-01 00:00:00');
    expect(text(model)).toContain('Value');
    expect(text(model)).toContain('7');
    expect(text(model)).toContain('Name');
    // Bucket keyed by yStart:yEnd (10:20).
    expect(text(model)).toContain('20');
  });

  it('formats a numeric x header when the axis is not time', () => {
    const formatter = buildBinnedHeatmapTooltipModel(
      baseData({ xIsTime: false, yBuckets: [{ start: 0, end: 1, label: 'a' }] }),
      ctx
    );

    const model = formatter(asParams([5, 0, 6, 1, 3]));

    expect(text(model)).toContain('5');
    expect(text(model)).toContain('a');
    expect(text(model)).toContain('3');
  });

  it('falls back to the numeric bucket bounds when no label matches', () => {
    const formatter = buildBinnedHeatmapTooltipModel(
      baseData({ xIsTime: false, yBuckets: [{ start: 0, end: 1, label: 'a' }] }),
      ctx
    );

    const model = formatter(asParams([0, 100, 1, 200, 9]));

    expect(text(model)).toContain('100 - 200');
  });

  it('routes null cells through the field formatter for its No value text', () => {
    const formatter = buildBinnedHeatmapTooltipModel(
      baseData({ xIsTime: false, yBuckets: [{ start: 0, end: 1, label: 'a' }] }),
      ctx
    );

    const model = formatter(asParams([0, 0, 1, 1, null]));

    // The representative formatter (stub) emits the field's No value text; in
    // production this is `config.noValue` (default '-'). See getValueFormatter.
    expect(text(model)).toContain('null');
  });
});
