import { createTheme, FieldType, getDisplayProcessor, type Field, type ValueFormatter } from '@grafana/data';
import { type MatrixHeatmapData } from 'lib/echarts/converters/matrixHeatmap';
import { getMatrixHeatmapSeries, getMatrixHeatmapVisualMap } from 'lib/echarts/options/matrixHeatmap';
import { COLOR_SCHEMES } from 'lib/echarts/options/constants';

const theme = createTheme();
const formatValue: ValueFormatter = (value) => ({ text: `${value}` });
// The series only threads this through to its tooltip formatter.
const ctx = { theme, timeZone: 'utc', formatValue };

const xField: Field<number> = { name: 'c1', type: FieldType.number, values: [1, 4], config: {} };
const xField2: Field<number> = { name: 'c2', type: FieldType.number, values: [2, 3], config: {} };
const yField: Field<string> = { name: 'row', type: FieldType.string, values: ['a', 'b'], config: {} };
const formatDisplayValue = getDisplayProcessor({ theme, field: yField });

const data: MatrixHeatmapData = {
  xCategories: ['c1', 'c2'],
  yCategories: ['a', 'b'],
  cells: [
    [0, 0, 1],
    [1, 1, 4],
  ],
  valueMin: 1,
  valueMax: 4,
  xField,
  xFields: [xField, xField2],
  yField,
};

describe('getMatrixHeatmapSeries', () => {
  it('builds a native heatmap series carrying the cell tuples and zlevel', () => {
    const series = getMatrixHeatmapSeries(data, ctx, 7);
    expect(series.type).toBe('heatmap');
    expect(series.name).toBe('Heatmap');
    expect(series.zlevel).toBe(7);
    expect(series.data).toEqual(data.cells);
    // The cell grid is not a togglable legend series.
    expect(series.legendHoverLink).toBe(false);
  });
});

describe('getMatrixHeatmapVisualMap', () => {
  it('scales to the value range on the value dimension', () => {
    const visualMap = getMatrixHeatmapVisualMap({
      data,
      theme,
      seriesIndex: 0,
      placement: 'right',
      formatDisplayValue,
    });
    expect(visualMap.min).toBe(1);
    expect(visualMap.max).toBe(4);
    // Value is the third dim of the [xIndex, yIndex, value] tuple.
    expect(visualMap.dimension).toBe(2);
    expect(visualMap.hoverLink).not.toBe(false);
  });

  it('places the scale on the right (vertical) by default', () => {
    const visualMap = getMatrixHeatmapVisualMap({
      data,
      theme,
      seriesIndex: 0,
      placement: 'right',
      formatDisplayValue,
    });
    expect(visualMap.orient).toBe('vertical');
    expect(visualMap.right).toBeDefined();
  });

  it('places the scale on the bottom (horizontal) for bottom placement', () => {
    const visualMap = getMatrixHeatmapVisualMap({
      data,
      theme,
      seriesIndex: 0,
      placement: 'bottom',
      formatDisplayValue,
    });
    expect(visualMap.orient).toBe('horizontal');
    expect(visualMap.bottom).toBeDefined();
  });

  it('keeps the bar thin in both orientations so it fits the reserved grid margin', () => {
    // ECharts `itemHeight` is the bar length and `itemWidth` its thickness in
    // both orientations; a thick bar overflows the grid band and overlaps cells.
    const vertical = getMatrixHeatmapVisualMap({ data, theme, seriesIndex: 0, placement: 'right', formatDisplayValue });
    const horizontal = getMatrixHeatmapVisualMap({
      data,
      theme,
      seriesIndex: 0,
      placement: 'bottom',
      formatDisplayValue,
    });
    expect(vertical.itemWidth).toBe(horizontal.itemWidth);
    expect(vertical.itemHeight).toBe(horizontal.itemHeight);
    expect(vertical.itemWidth).toBeLessThan(Number(vertical.itemHeight));
  });

  it('hides the color scale but keeps color mapping when placement is none', () => {
    const visualMap = getMatrixHeatmapVisualMap({
      data,
      theme,
      seriesIndex: 0,
      placement: 'none',
      formatDisplayValue,
    });
    // Legend hidden, but min/max/dimension mapping stays so the cells stay colored.
    expect(visualMap.show).toBe(false);
    expect(visualMap.min).toBe(1);
    expect(visualMap.max).toBe(4);
    expect(visualMap.dimension).toBe(2);
  });

  it('applies the selected color scheme', () => {
    const visualMap = getMatrixHeatmapVisualMap({
      data,
      theme,
      seriesIndex: 0,
      placement: 'right',
      scheme: 'blues',
      formatDisplayValue,
    });
    expect(visualMap.inRange?.color).toEqual(COLOR_SCHEMES.blues);
  });

  it('widens a degenerate single-value range so the scale still renders', () => {
    const flat = { ...data, valueMin: 5, valueMax: 5 };
    const visualMap = getMatrixHeatmapVisualMap({
      data: flat,
      theme,
      seriesIndex: 0,
      placement: 'right',
      formatDisplayValue,
    });
    expect(visualMap.min).toBe(5);
    expect(visualMap.max).toBe(6);
  });
});
