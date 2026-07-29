import { createTheme, FieldType, type Field, type ValueFormatter } from '@grafana/data';
import { type TopLevelFormatterParams } from 'echarts/types/dist/shared';
import { type MatrixHeatmapData } from 'lib/echarts/converters/matrixHeatmap';
import { buildMatrixHeatmapTooltipModel } from 'lib/echarts/tooltip/matrixHeatmap';
import { type TooltipModel } from 'lib/echarts/tooltip/types';

const theme = createTheme();
// Mirrors getValueFormatter: empty values (null/undefined/NaN) render No value text.
const formatValue: ValueFormatter = (value) => ({ text: value == null || Number.isNaN(value) ? 'null' : `${value}` });
const ctx = { theme, timeZone: 'utc', formatValue };

const xField: Field<number> = { name: 'c1', type: FieldType.number, values: [1, 4], config: {} };
const xField2: Field<number> = { name: 'c2', type: FieldType.number, values: [2, 3], config: {} };
const yField: Field<string> = { name: 'row', type: FieldType.string, values: ['a', 'b'], config: {} };

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

describe('buildMatrixHeatmapTooltipModel', () => {
  const asParams = (tuple: Array<number | null>) => ({ value: tuple }) as TopLevelFormatterParams;
  const text = (model: TooltipModel) =>
    [model.header?.label, model.header?.value, ...model.rows.flatMap((row) => [row.label, row.value])].join(' ');

  it('maps cell indices back to their category labels and value', () => {
    const formatter = buildMatrixHeatmapTooltipModel(data, ctx);
    const model = formatter(asParams([1, 0, 3]));
    // X category header, then Value row and the Y category name.
    expect(model.header).toEqual({ label: '', value: 'c2' });
    expect(text(model)).toContain('Value');
    expect(text(model)).toContain('3');
    expect(text(model)).toContain('Name');
    expect(text(model)).toContain('a');
  });

  it('resolves the hovered cell back to its own column field and row, for footer links', () => {
    const formatter = buildMatrixHeatmapTooltipModel(data, ctx);
    // Cell [xIndex 1, yIndex 0] is column `c2` at row 0.
    expect(formatter(asParams([1, 0, 3])).source).toEqual({ field: xField2, rowIndex: 0 });
  });

  it('routes null cells through the field formatter for its No value text', () => {
    const formatter = buildMatrixHeatmapTooltipModel(data, ctx);
    const model = formatter(asParams([0, 0, null]));
    // The representative formatter (stub) emits the field's No value text; in
    // production this is `config.noValue` (default '-'). See getValueFormatter.
    expect(text(model)).toContain('null');
  });
});
