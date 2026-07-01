import { createTheme } from '@grafana/data';
import { type HeatmapData } from 'lib/echarts/converters/heatmap';
import { buildHeatmapTooltip, getHeatmapBucketAxis } from 'lib/echarts/options/heatmap';
import { type TopLevelFormatterParams } from 'echarts/types/dist/shared';

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

describe('buildHeatmapTooltip', () => {
  const theme = createTheme();
  const formatValue = (value: number | null) => (value == null ? 'null' : `${value}`);
  const ctx = { theme, timeZone: 'utc', formatValue };
  // Encoded cell tuple: [xStart, yStart, xEnd, yEnd, value].
  const asParams = (tuple: Array<number | null>) => ({ value: tuple }) as unknown as TopLevelFormatterParams;

  it('formats the x header as time and shows the value and bucket name', () => {
    const formatter = buildHeatmapTooltip(
      baseData({
        xIsTime: true,
        yBuckets: [
          { start: 0, end: 10, label: '10' },
          { start: 10, end: 20, label: '20' },
        ],
      }),
      ctx
    );

    const el = formatter(asParams([0, 10, 60000, 20, 7]));

    // xStart = 0 -> unix epoch in the forced-UTC test timezone.
    expect(el.textContent).toContain('1970-01-01 00:00:00');
    expect(el.textContent).toContain('Value');
    expect(el.textContent).toContain('7');
    expect(el.textContent).toContain('Name');
    // Bucket keyed by yStart:yEnd (10:20).
    expect(el.textContent).toContain('20');
  });

  it('formats a numeric x header when the axis is not time', () => {
    const formatter = buildHeatmapTooltip(
      baseData({ xIsTime: false, yBuckets: [{ start: 0, end: 1, label: 'a' }] }),
      ctx
    );

    const el = formatter(asParams([5, 0, 6, 1, 3]));

    expect(el.textContent).toContain('5');
    expect(el.textContent).toContain('a');
    expect(el.textContent).toContain('3');
  });

  it('falls back to the numeric bucket bounds when no label matches', () => {
    const formatter = buildHeatmapTooltip(
      baseData({ xIsTime: false, yBuckets: [{ start: 0, end: 1, label: 'a' }] }),
      ctx
    );

    const el = formatter(asParams([0, 100, 1, 200, 9]));

    expect(el.textContent).toContain('100 - 200');
  });

  it('renders the Grafana no-value fallback for null cells', () => {
    const formatter = buildHeatmapTooltip(
      baseData({ xIsTime: false, yBuckets: [{ start: 0, end: 1, label: 'a' }] }),
      ctx
    );

    const el = formatter(asParams([0, 0, 1, 1, null]));

    expect(el.textContent).toContain('N/A');
  });
});
