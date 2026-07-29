import { type DataFrame, DataFrameType, FieldType, toDataFrame } from '@grafana/data';
import {
  type BinnedHeatmapCell,
  frameToBinnedHeatmap,
  isBinnedHeatmapFrame,
} from 'lib/echarts/converters/binnedHeatmap';

const findCell = (cells: BinnedHeatmapCell[], xStart: number, yStart: number): BinnedHeatmapCell | undefined =>
  cells.find((cell) => cell.xStart === xStart && cell.yStart === yStart);

describe('isBinnedHeatmapFrame', () => {
  it.each([DataFrameType.HeatmapRows, DataFrameType.HeatmapCells])('is true for %s frames', (type) => {
    const frame = toDataFrame({ meta: { type }, fields: [{ name: 'x', type: FieldType.number, values: [1] }] });
    expect(isBinnedHeatmapFrame(frame)).toBe(true);
  });

  it('is false for frames without a heatmap meta type', () => {
    const frame = toDataFrame({
      fields: [
        { name: 'time', type: FieldType.time, values: [1] },
        { name: 'v', type: FieldType.number, values: [1] },
      ],
    });
    expect(isBinnedHeatmapFrame(frame)).toBe(false);
  });
});

describe('frameToBinnedHeatmap - heatmap-rows', () => {
  const rowsFrame = (): DataFrame =>
    toDataFrame({
      meta: { type: DataFrameType.HeatmapRows },
      fields: [
        { name: 'time', type: FieldType.time, values: [1, 2] },
        { name: 'b1', type: FieldType.number, values: [5, 6], labels: { le: '10' } },
        { name: 'b2', type: FieldType.number, values: [7, 8], labels: { le: '20' } },
        { name: 'b3', type: FieldType.number, values: [9, 10], labels: { le: '+Inf' } },
      ],
    });

  it('derives bucket bounds from le labels and contiguous lower bounds', () => {
    const result = frameToBinnedHeatmap([rowsFrame()]);
    expect(result).not.toBeNull();

    // 3 buckets x 2 timestamps.
    expect(result!.cells).toHaveLength(6);

    expect(findCell(result!.cells, 1, 0)).toMatchObject({ xStart: 1, xEnd: 2, yStart: 0, yEnd: 10, value: 5 });
    expect(findCell(result!.cells, 1, 10)).toMatchObject({ yStart: 10, yEnd: 20, value: 7 });
    // The +Inf top bucket reuses the previous bucket height (10) so it stays finite.
    expect(findCell(result!.cells, 1, 20)).toMatchObject({ yStart: 20, yEnd: 30, value: 9 });
  });

  it('spans X cells by the smallest timestamp gap', () => {
    const result = frameToBinnedHeatmap([rowsFrame()]);
    expect(findCell(result!.cells, 2, 0)).toMatchObject({ xStart: 2, xEnd: 3 });
  });

  it('reports value and bucket ranges', () => {
    const result = frameToBinnedHeatmap([rowsFrame()]);
    expect(result!.valueMin).toBe(5);
    expect(result!.valueMax).toBe(10);
    expect(result!.yMin).toBe(0);
    expect(result!.yMax).toBe(30);
  });

  it('flags a time X field as a time axis', () => {
    const result = frameToBinnedHeatmap([rowsFrame()]);
    expect(result!.xIsTime).toBe(true);
  });

  it('derives bound-placed bucket labels from le labels', () => {
    const result = frameToBinnedHeatmap([rowsFrame()]);
    expect(result!.yLabelPlacement).toBe('bound');
    expect(result!.yBuckets).toEqual([
      { start: 0, end: 10, label: '10' },
      { start: 10, end: 20, label: '20' },
      { start: 20, end: 30, label: '+Inf' },
    ]);
  });

  it('uses the first field as the X axis even when it is numeric (no time field)', () => {
    const frame = toDataFrame({
      meta: { type: DataFrameType.HeatmapRows },
      fields: [
        { name: 'x', type: FieldType.number, values: [1, 2] },
        { name: 'b1', type: FieldType.number, values: [5, 6], labels: { le: '10' } },
        { name: 'b2', type: FieldType.number, values: [7, 8], labels: { le: '20' } },
      ],
    });

    const result = frameToBinnedHeatmap([frame]);
    expect(result).not.toBeNull();
    // 2 buckets x 2 X values; the numeric X field is not treated as a bucket row.
    expect(result!.cells).toHaveLength(4);
    expect(findCell(result!.cells, 1, 0)).toMatchObject({ xStart: 1, xEnd: 2, yStart: 0, yEnd: 10, value: 5 });
    expect(findCell(result!.cells, 2, 10)).toMatchObject({ xStart: 2, xEnd: 3, yStart: 10, yEnd: 20, value: 8 });
    // A numeric X field drives a value axis, not a time axis.
    expect(result!.xIsTime).toBe(false);
  });

  it('falls back to unit-height index buckets when no le labels exist', () => {
    const frame = toDataFrame({
      meta: { type: DataFrameType.HeatmapRows },
      fields: [
        { name: 'time', type: FieldType.time, values: [1] },
        { name: 'a', type: FieldType.number, values: [3] },
        { name: 'b', type: FieldType.number, values: [4] },
      ],
    });

    const result = frameToBinnedHeatmap([frame]);
    expect(findCell(result!.cells, 1, 0)).toMatchObject({ yStart: 0, yEnd: 1, value: 3 });
    expect(findCell(result!.cells, 1, 1)).toMatchObject({ yStart: 1, yEnd: 2, value: 4 });
    // No le labels: rows are ordinal, labelled by field name at their center.
    expect(result!.yLabelPlacement).toBe('center');
    expect(result!.yBuckets).toEqual([
      { start: 0, end: 1, label: 'a' },
      { start: 1, end: 2, label: 'b' },
    ]);
  });
});

describe('frameToBinnedHeatmap - heatmap-cells', () => {
  it('uses explicit min/max bounds (sparse) and the first non-axis value field', () => {
    const frame = toDataFrame({
      meta: { type: DataFrameType.HeatmapCells },
      fields: [
        { name: 'xMin', type: FieldType.time, values: [1000, 2000] },
        { name: 'xMax', type: FieldType.time, values: [2000, 3000] },
        { name: 'yMin', type: FieldType.number, values: [0, 10] },
        { name: 'yMax', type: FieldType.number, values: [10, 20] },
        { name: 'Count', type: FieldType.number, values: [3, 7] },
      ],
    });

    const result = frameToBinnedHeatmap([frame]);
    expect(result!.cells).toHaveLength(2);
    expect(result!.cells[0]).toMatchObject({ xStart: 1000, xEnd: 2000, yStart: 0, yEnd: 10, value: 3 });
    expect(result!.cells[1]).toMatchObject({ xStart: 2000, xEnd: 3000, yStart: 10, yEnd: 20, value: 7 });
    // xMin/xMax are time fields, so the axis is time-based.
    expect(result!.xIsTime).toBe(true);
    // Cell bounds give bound-placed bucket labels (the upper edge per row).
    expect(result!.yLabelPlacement).toBe('bound');
    expect(result!.yBuckets).toEqual([
      { start: 0, end: 10, label: '10' },
      { start: 10, end: 20, label: '20' },
    ]);
  });

  it('infers cell size from center x/y values when only centers are present', () => {
    const frame = toDataFrame({
      meta: { type: DataFrameType.HeatmapCells },
      fields: [
        { name: 'x', type: FieldType.number, values: [10, 20] },
        { name: 'y', type: FieldType.number, values: [1, 2] },
        { name: 'Count', type: FieldType.number, values: [5, 8] },
      ],
    });

    const result = frameToBinnedHeatmap([frame]);
    // x step = 10 -> +/- 5; y step = 1 -> +/- 0.5
    expect(result!.cells[0]).toMatchObject({ xStart: 5, xEnd: 15, yStart: 0.5, yEnd: 1.5, value: 5 });
    // The center `x` field is numeric, so the axis is a value axis.
    expect(result!.xIsTime).toBe(false);
  });
});

describe('frameToBinnedHeatmap - no usable data', () => {
  it('returns null when no cells can be derived', () => {
    const frame = toDataFrame({
      meta: { type: DataFrameType.HeatmapRows },
      fields: [{ name: 'time', type: FieldType.time, values: [1] }],
    });
    expect(frameToBinnedHeatmap([frame])).toBeNull();
  });
});
