import { HeatmapData } from 'echarts/converters/heatmap';
import { getHeatmapBucketAxis } from 'echarts/options/heatmap';

const baseData = (overrides: Partial<HeatmapData>): HeatmapData => ({
  cells: [],
  valueMin: 0,
  valueMax: 1,
  yMin: 0,
  yMax: 1,
  xIsTime: true,
  yBuckets: [],
  yLabelPlacement: 'bound',
  ...overrides,
});

describe('getHeatmapBucketAxis', () => {
  it('returns nothing when there are no buckets', () => {
    expect(getHeatmapBucketAxis(baseData({ yBuckets: [] }))).toEqual({});
  });

  it('places labels at bucket upper bounds (plus the first lower bound) for "bound" placement', () => {
    const axis = getHeatmapBucketAxis(
      baseData({
        yLabelPlacement: 'bound',
        yBuckets: [
          { start: 0, end: 10, label: '10' },
          { start: 10, end: 20, label: '20' },
          { start: 20, end: 30, label: '+Inf' },
        ],
      })
    );

    // Labels at 0, 10, 20, 30; grid lines at every boundary.
    expect((axis.axisLabel as { customValues: number[] }).customValues).toEqual([0, 10, 20, 30]);
    expect((axis.splitLine as { customValues: number[] }).customValues).toEqual([0, 10, 20, 30]);

    const formatter = (axis.axisLabel as { formatter: (v: number) => string }).formatter;
    expect(formatter(0)).toBe('0');
    expect(formatter(10)).toBe('10');
    expect(formatter(30)).toBe('+Inf');
    expect(formatter(15)).toBe('');
  });

  it('places labels at bucket centers for "center" (ordinal) placement', () => {
    const axis = getHeatmapBucketAxis(
      baseData({
        yLabelPlacement: 'center',
        yBuckets: [
          { start: 0, end: 1, label: 'a' },
          { start: 1, end: 2, label: 'b' },
        ],
      })
    );

    expect((axis.axisLabel as { customValues: number[] }).customValues).toEqual([0.5, 1.5]);
    expect((axis.splitLine as { customValues: number[] }).customValues).toEqual([0, 1, 2]);

    const formatter = (axis.axisLabel as { formatter: (v: number) => string }).formatter;
    expect(formatter(0.5)).toBe('a');
    expect(formatter(1.5)).toBe('b');
  });

  it('drops non-finite boundaries from the grid lines', () => {
    const axis = getHeatmapBucketAxis(
      baseData({
        yLabelPlacement: 'bound',
        yBuckets: [{ start: 0, end: Infinity, label: '+Inf' }],
      })
    );
    expect((axis.splitLine as { customValues: number[] }).customValues).toEqual([0]);
  });
});
