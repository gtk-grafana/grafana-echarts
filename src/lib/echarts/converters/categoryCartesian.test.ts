import {
  createTheme,
  type DataFrame,
  FieldType,
  getDefaultTimeRange,
  toDataFrame,
  type ValueFormatter,
} from '@grafana/data';
import { seriesTypePath } from 'editor/constants';
import { type CartesianSingleValueSeriesType } from 'editor/types';
import { type ChartContext } from 'lib/echarts/charts/types';
import { categoryCartesianToEChartsOption } from 'lib/echarts/converters/categoryCartesian';
import { type PanelOptions } from 'types';

const theme = createTheme();

const formatValue: ValueFormatter = (value) => ({ text: value == null ? '' : String(value) });

/** Build a minimal ChartContext for the category cartesian converter under test. */
const makeContext = (
  frames: DataFrame[],
  seriesType: CartesianSingleValueSeriesType,
  stackSeries?: boolean
): ChartContext<CartesianSingleValueSeriesType> => ({
  frames,
  theme,
  timeZone: 'utc',
  timeRange: getDefaultTimeRange(),
  options: { [seriesTypePath]: seriesType, stackSeries } as PanelOptions,
  seriesType,
  formatValue,
  replaceVariables: (value: string) => value,
  fieldConfig: { defaults: {}, overrides: [] },
});

/** Run the converter, normalizing the ECharts `Arrayable` series into an array. */
const run = (frames: DataFrame[], seriesType: CartesianSingleValueSeriesType, stackSeries?: boolean) => {
  const { categories, series } = categoryCartesianToEChartsOption(makeContext(frames, seriesType, stackSeries));
  expect(Array.isArray(series)).toBe(true);

  if (!Array.isArray(series)) {
    throw new Error('Narrow series to array');
  }

  return { categories, series };
};

const tableFrame = (): DataFrame =>
  toDataFrame({
    fields: [
      { name: 'category', type: FieldType.string, values: ['Sales', 'Admin', 'IT'] },
      { name: 'Budget', type: FieldType.number, values: [43, 10, 30], config: { displayName: 'Budget' } },
      { name: 'Actual', type: FieldType.number, values: [50, 14, 28], config: { displayName: 'Actual' } },
    ],
  });

describe('categoryCartesianToEChartsOption', () => {
  it('projects each numeric field onto the shared category axis', () => {
    const result = run([tableFrame()], 'bar');

    expect(result.categories).toEqual(['Sales', 'Admin', 'IT']);
    expect(result.series).toMatchObject([
      { name: 'Budget', type: 'bar', data: [43, 10, 30] },
      { name: 'Actual', type: 'bar', data: [50, 14, 28] },
    ]);
  });

  it('applies the panel-level series type to every series', () => {
    const result = run([tableFrame()], 'line');

    expect(result.series).toMatchObject([{ type: 'line' }, { type: 'line' }]);
  });

  it('resolves a color for each series (item and line style)', () => {
    const result = run([tableFrame()], 'bar');

    for (const s of result.series) {
      const color = s.itemStyle?.color;
      expect(color).toEqual('#808080');
      expect(s).toMatchObject({ lineStyle: { color } });
    }
  });

  it('falls back to row indices when there is no string field', () => {
    const frame = toDataFrame({
      fields: [{ name: 'v', type: FieldType.number, values: [1, 2], config: { displayName: 'v' } }],
    });

    const result = run([frame], 'bar');

    expect(result.categories).toEqual(['0', '1']);
  });

  describe('stacking', () => {
    it('adds a shared stack group to bar series when stacking is on', () => {
      const result = run([tableFrame()], 'bar', true);

      for (const s of result.series) {
        expect(s).toHaveProperty('stack', 'total');
      }
    });

    it('does not stack bar series when stacking is off', () => {
      const result = run([tableFrame()], 'bar', false);
      const resultStacked = run([tableFrame()], 'bar', true);

      expect(result.series.length).toEqual(resultStacked.series.length);
      for (let i = 0; i < result.series.length; i++) {
        expect(result.series[i]).not.toHaveProperty('stack');
        expect(resultStacked.series[i]).toHaveProperty('stack', 'total');
      }
    });

    it.each(['line', 'scatter'])('never stacks %s series even when stacking is on', (seriesType) => {
      const result = run([tableFrame()], seriesType as CartesianSingleValueSeriesType, true);

      for (const s of result.series) {
        // Asserting something doesn't exist is typically a bad test smell, but paired with the test above I think it's fine to verify that we're not stacking things that should not be stacked
        // Although eCharts does support setting stack on scatter and line, I think those usages are for when scatter/line shares a stack group with a bar chart which is probably fine to set aside for now
        expect(s).not.toHaveProperty('stack');
      }
    });
  });

  it('keeps the category axis with no series when every series is hidden', () => {
    // Hiding all series strips the numeric value fields, leaving only the
    // category (string) field. The axis should still render its labels.
    const frame = toDataFrame({
      fields: [{ name: 'category', type: FieldType.string, values: ['a', 'b'] }],
    });

    const result = run([frame], 'bar');

    expect(result.categories).toEqual(['a', 'b']);
    expect(result.series).toEqual([]);
  });
});
