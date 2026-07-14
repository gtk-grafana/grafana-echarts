import { createTheme, FieldType, getDisplayProcessor, type Field, type ValueFormatter } from '@grafana/data';
import { type TopLevelFormatterParams } from 'echarts/types/dist/shared';
import { type MatrixHeatmapData } from 'lib/echarts/converters/matrixHeatmap';
import {
  buildMatrixHeatmapTooltip,
  getMatrixHeatmapSeries,
  getMatrixHeatmapVisualMap,
} from 'lib/echarts/options/matrixHeatmap';
import { COLOR_SCHEMES } from 'lib/echarts/options/constants';

const theme = createTheme();
// Mirrors getValueFormatter: empty values (null/undefined/NaN) render No value text.
const formatValue: ValueFormatter = (value) => ({ text: value == null || Number.isNaN(value) ? 'null' : `${value}` });
const ctx = { theme, timeZone: 'utc', formatValue };

const xField: Field<number> = { name: 'c1', type: FieldType.number, values: [1, 4], config: {} };
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

describe('buildMatrixHeatmapTooltip', () => {
  const asParams = (tuple: Array<number | null>) => ({ value: tuple }) as TopLevelFormatterParams;

  it('maps cell indices back to their category labels and value', () => {
    const formatter = buildMatrixHeatmapTooltip(data, ctx);
    const el = formatter(asParams([1, 0, 3]));
    // X category header, then Value row and the Y category name.
    expect(el.textContent).toContain('c2');
    expect(el.textContent).toContain('Value');
    expect(el.textContent).toContain('3');
    expect(el.textContent).toContain('Name');
    expect(el.textContent).toContain('a');
  });

  it('routes null cells through the field formatter for its No value text', () => {
    const formatter = buildMatrixHeatmapTooltip(data, ctx);
    const el = formatter(asParams([0, 0, null]));
    // The representative formatter (stub) emits the field's No value text; in
    // production this is `config.noValue` (default '-'). See getValueFormatter.
    expect(el.textContent).toContain('null');
  });
});
