import { createTheme, type DataFrame, FieldType, toDataFrame } from '@grafana/data';
import { frameToMatrixHeatmap } from 'lib/echarts/converters/matrixHeatmap';

const theme = createTheme();

// Wide/pivot frame: a string field (Y rows) plus numeric fields (X columns).
const wideFrame = (): DataFrame =>
  toDataFrame({
    fields: [
      { name: 'row', type: FieldType.string, values: ['a', 'b'] },
      { name: 'c1', type: FieldType.number, values: [1, 2] },
      { name: 'c2', type: FieldType.number, values: [3, 4] },
    ],
  });

describe('frameToMatrixHeatmap', () => {
  it('maps numeric field names to X categories and string rows to Y categories', () => {
    const data = frameToMatrixHeatmap([wideFrame()], theme);
    expect(data).not.toBeNull();
    expect(data!.xCategories).toEqual(['c1', 'c2']);
    expect(data!.yCategories).toEqual(['a', 'b']);
  });

  it('emits one [xIndex, yIndex, value] cell per column/row pair', () => {
    const data = frameToMatrixHeatmap([wideFrame()], theme);
    expect(data!.cells).toEqual([
      [0, 0, 1],
      [0, 1, 2],
      [1, 0, 3],
      [1, 1, 4],
    ]);
  });

  it('reports the finite value range for the visualMap', () => {
    const data = frameToMatrixHeatmap([wideFrame()], theme);
    expect(data!.valueMin).toBe(1);
    expect(data!.valueMax).toBe(4);
  });

  it('falls back to row indices when the frame has no string field', () => {
    const frame = toDataFrame({
      fields: [
        { name: 'c1', type: FieldType.number, values: [1, 2] },
        { name: 'c2', type: FieldType.number, values: [3, 4] },
      ],
    });
    const data = frameToMatrixHeatmap([frame], theme);
    expect(data!.yCategories).toEqual(['0', '1']);
    expect(data!.xCategories).toEqual(['c1', 'c2']);
  });

  it('renders non-finite values as null tiles', () => {
    const frame = toDataFrame({
      fields: [
        { name: 'row', type: FieldType.string, values: ['a'] },
        { name: 'c1', type: FieldType.number, values: [NaN] },
      ],
    });
    const data = frameToMatrixHeatmap([frame], theme);
    expect(data!.cells).toEqual([[0, 0, null]]);
    // No finite values: the range collapses to 0..0.
    expect(data!.valueMin).toBe(0);
    expect(data!.valueMax).toBe(0);
  });

  it('returns null when no frame has a numeric field', () => {
    const frame = toDataFrame({
      fields: [{ name: 'row', type: FieldType.string, values: ['a', 'b'] }],
    });
    expect(frameToMatrixHeatmap([frame], theme)).toBeNull();
  });
});
