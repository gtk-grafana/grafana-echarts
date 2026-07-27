/**
 * Proximity hit-testing against a live ECharts instance, so the pixel maths runs
 * through the real coordinate system (axis bounds, multiple y axes) rather than
 * a stubbed one. Pixel expectations are derived from `convertToPixel` rather
 * than hard-coded, so they survive layout changes.
 */
import {
  createTheme,
  type DataFrame,
  dateTime,
  FieldType,
  type TimeRange,
  toDataFrame,
  type ValueFormatter,
} from '@grafana/data';
import { LegendDisplayMode, TooltipDisplayMode, type VizLegendOptions } from '@grafana/schema';
import { seriesTypePath } from 'editor/constants';
import { type ChartContext } from 'lib/echarts/charts/types';
import { type EChartsType, init } from 'lib/echarts/echarts';
import { buildPanelChartOption } from 'lib/echarts/options/panelOption';
import { type PanelOptions } from 'types';
import { FOCUS_PROXIMITY_PX, findHoveredPoint, nearestIndex, type SeriesPoints } from './proximity';

const FROM = 1783137094497;
const TO = 1783147894497;
const timeRange: TimeRange = { from: dateTime(FROM), to: dateTime(TO), raw: { from: 'now-3h', to: 'now' } };
const formatValue: ValueFormatter = (value) => ({ text: String(value) });
const legend: VizLegendOptions = {
  showLegend: true,
  displayMode: LegendDisplayMode.List,
  placement: 'bottom',
  calcs: [],
};

/** Five evenly spaced timestamps across the panel range. */
const TIMES = [0, 1, 2, 3, 4].map((i) => FROM + ((TO - FROM) * i) / 4);

const frameOf = (values: Record<string, Array<number | null>>): DataFrame =>
  toDataFrame({
    fields: [
      { name: 'time', type: FieldType.time, values: TIMES },
      ...Object.entries(values).map(([name, vals]) => ({ name, type: FieldType.number, values: vals })),
    ],
  });

const makeContext = (frames: DataFrame[]): ChartContext => ({
  frames,
  theme: createTheme(),
  timeZone: 'utc',
  timeRange,
  options: {
    [seriesTypePath]: 'line',
    legend,
    tooltip: { mode: TooltipDisplayMode.Single, sort: undefined, hideZeros: false },
  } as unknown as PanelOptions,
  seriesType: 'line',
  formatValue,
  replaceVariables: (value: string) => value,
  fieldConfig: { defaults: {}, overrides: [] },
});

/** Mount a live 400x300 chart for `frames` and return it with its series values. */
function mount(frames: DataFrame[]): { chart: EChartsType; series: SeriesPoints[] } {
  const option = buildPanelChartOption(makeContext(frames), { isGrafanaLegend: true });
  const dom = document.createElement('div');
  dom.style.width = '400px';
  dom.style.height = '300px';
  document.body.appendChild(dom);
  const chart = init(dom);
  chart.setOption(option, { notMerge: true });

  const series: SeriesPoints[] = [];
  for (const frame of frames) {
    const time = frame.fields.find((f) => f.type === FieldType.time)!;
    for (const field of frame.fields) {
      if (field.type === FieldType.number) {
        series.push({ x: time.values, y: field.values });
      }
    }
  }
  return { chart, series };
}

/** Pixel position of one datapoint, as the chart lays it out. */
const pixelOf = (chart: EChartsType, series: SeriesPoints[], seriesIndex: number, dataIndex: number) => {
  const [x, y] = chart.convertToPixel({ seriesIndex }, [
    series[seriesIndex].x[dataIndex],
    series[seriesIndex].y[dataIndex] as number,
  ]) as number[];
  return { x, y };
};

describe('nearestIndex', () => {
  it('returns -1 for an empty series', () => {
    expect(nearestIndex([], 5)).toBe(-1);
  });

  it('finds the closest value and clamps outside the range', () => {
    const xs = [0, 10, 20, 30];
    expect(nearestIndex(xs, -100)).toBe(0);
    expect(nearestIndex(xs, 9)).toBe(1);
    expect(nearestIndex(xs, 11)).toBe(1);
    expect(nearestIndex(xs, 16)).toBe(2);
    expect(nearestIndex(xs, 999)).toBe(3);
  });

  it('breaks an exact midpoint tie toward the lower index', () => {
    expect(nearestIndex([0, 10], 5)).toBe(0);
  });
});

describe('findHoveredPoint', () => {
  let chart: EChartsType | undefined;
  afterEach(() => {
    chart?.dispose();
    chart = undefined;
  });

  it('resolves the point directly under the cursor', () => {
    const mounted = mount([frameOf({ a: [10, 20, 30, 40, 50] })]);
    chart = mounted.chart;
    const target = pixelOf(chart, mounted.series, 0, 2);

    expect(findHoveredPoint(chart, target, mounted.series)).toMatchObject({ seriesIndex: 0, dataIndex: 2 });
  });

  it('resolves a point the cursor is only near, within the focus band', () => {
    const mounted = mount([frameOf({ a: [10, 20, 30, 40, 50] })]);
    chart = mounted.chart;
    const target = pixelOf(chart, mounted.series, 0, 2);

    const near = findHoveredPoint(chart, { x: target.x, y: target.y - (FOCUS_PROXIMITY_PX - 5) }, mounted.series);
    expect(near).toMatchObject({ seriesIndex: 0, dataIndex: 2 });
  });

  it('reports no hit beyond the focus band, so Single mode shows nothing', () => {
    const mounted = mount([frameOf({ a: [10, 20, 30, 40, 50] })]);
    chart = mounted.chart;
    const target = pixelOf(chart, mounted.series, 0, 2);

    expect(findHoveredPoint(chart, { x: target.x, y: target.y - (FOCUS_PROXIMITY_PX + 5) }, mounted.series)).toBeNull();
  });

  it('is unbounded horizontally: snaps to a far-off x while vertically close', () => {
    // A single flat series: anywhere along its height the nearest point wins,
    // however far the cursor is from that point horizontally.
    const mounted = mount([frameOf({ a: [10, 10, 10, 10, 10] })]);
    chart = mounted.chart;
    const first = pixelOf(chart, mounted.series, 0, 0);
    const last = pixelOf(chart, mounted.series, 0, 4);

    // Just inside the grid on the left, at the line's height -> nearest is idx 0.
    expect(findHoveredPoint(chart, { x: first.x + 1, y: first.y }, mounted.series)).toMatchObject({ dataIndex: 0 });
    // Same, at the right edge -> nearest is idx 4.
    expect(findHoveredPoint(chart, { x: last.x - 1, y: last.y }, mounted.series)).toMatchObject({ dataIndex: 4 });
  });

  it('picks the vertically closest series when several overlap in x', () => {
    const mounted = mount([frameOf({ low: [10, 10, 10, 10, 10], high: [90, 90, 90, 90, 90] })]);
    chart = mounted.chart;
    const low = pixelOf(chart, mounted.series, 0, 2);
    const high = pixelOf(chart, mounted.series, 1, 2);

    expect(findHoveredPoint(chart, low, mounted.series)).toMatchObject({ seriesIndex: 0, dataIndex: 2 });
    expect(findHoveredPoint(chart, high, mounted.series)).toMatchObject({ seriesIndex: 1, dataIndex: 2 });

    // Just above the low line, still nearer to it than to the high one.
    expect(findHoveredPoint(chart, { x: low.x, y: low.y - 10 }, mounted.series)).toMatchObject({ seriesIndex: 0 });
  });

  it('breaks a vertical tie toward the lower series index', () => {
    const mounted = mount([frameOf({ a: [50, 50, 50, 50, 50], b: [50, 50, 50, 50, 50] })]);
    chart = mounted.chart;
    const target = pixelOf(chart, mounted.series, 0, 2);

    expect(findHoveredPoint(chart, target, mounted.series)).toMatchObject({ seriesIndex: 0 });
  });

  it('skips gaps and scans outward to a real point', () => {
    const mounted = mount([frameOf({ a: [10, 10, null, 10, 10] })]);
    chart = mounted.chart;
    const gapX = chart.convertToPixel({ seriesIndex: 0 }, [TIMES[2], 10]) as number[];
    const neighbour = pixelOf(chart, mounted.series, 0, 1);

    // Hovering the gap itself resolves to a neighbouring real point, never index 2.
    const hit = findHoveredPoint(chart, { x: gapX[0], y: neighbour.y }, mounted.series);
    expect(hit?.dataIndex).not.toBe(2);
  });

  it('returns null outside the plot grid', () => {
    const mounted = mount([frameOf({ a: [10, 20, 30, 40, 50] })]);
    chart = mounted.chart;

    expect(findHoveredPoint(chart, { x: 1, y: 1 }, mounted.series)).toBeNull();
  });

  it('honours an explicit hoverProximity as both the x and the y limit', () => {
    const mounted = mount([frameOf({ a: [10, 10, 10, 10, 10] })]);
    chart = mounted.chart;
    const target = pixelOf(chart, mounted.series, 0, 2);

    // Vertically inside the default band but outside a tight explicit one.
    expect(findHoveredPoint(chart, { x: target.x, y: target.y - 20 }, mounted.series)).not.toBeNull();
    expect(
      findHoveredPoint(chart, { x: target.x, y: target.y - 20 }, mounted.series, { hoverProximity: 10 })
    ).toBeNull();

    // Horizontally far from any point: allowed by default, rejected when limited.
    const between = { x: (pixelOf(chart, mounted.series, 0, 2).x + pixelOf(chart, mounted.series, 0, 3).x) / 2 };
    expect(findHoveredPoint(chart, { x: between.x, y: target.y }, mounted.series)).not.toBeNull();
    expect(findHoveredPoint(chart, { x: between.x, y: target.y }, mounted.series, { hoverProximity: 5 })).toBeNull();
  });

  it('resolves per-series y axes independently', () => {
    // Distinct units put each field on its own y axis; a shared-axis assumption
    // would compute the wrong pixel for at least one of them. The two series run
    // in opposite directions so that no index maps them to the same pixel — with
    // proportional values each axis would scale them onto identical heights.
    const frame = toDataFrame({
      fields: [
        { name: 'time', type: FieldType.time, values: TIMES },
        { name: 'bytes', type: FieldType.number, values: [100, 200, 300, 400, 500], config: { unit: 'bytes' } },
        { name: 'pct', type: FieldType.number, values: [5, 4, 3, 2, 1], config: { unit: 'percentunit' } },
      ],
    });
    const mounted = mount([frame]);
    chart = mounted.chart;

    expect(findHoveredPoint(chart, pixelOf(chart, mounted.series, 0, 1), mounted.series)).toMatchObject({
      seriesIndex: 0,
      dataIndex: 1,
    });
    expect(findHoveredPoint(chart, pixelOf(chart, mounted.series, 1, 3), mounted.series)).toMatchObject({
      seriesIndex: 1,
      dataIndex: 3,
    });
  });
});
