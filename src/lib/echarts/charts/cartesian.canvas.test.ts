import { createTheme, type DataFrame, dateTime, FieldType, type TimeRange, toDataFrame } from '@grafana/data';
import { seriesTypePath } from 'editor/constants';
import { type SeriesType } from 'editor/types';
import { removeCanvasTransforms } from 'jest-canvas-mock-compare';
import { type ChartContext } from 'lib/echarts/charts/types';
import { DEFAULT_CHART_LEGEND } from 'lib/echarts/options/legend';
import { buildPanelChartOption } from 'lib/echarts/options/panelOption';
import { renderEChartsOptionToCanvasEvents } from 'test/canvas';
import { type PanelOptions } from 'types';

// Canvas style-regression tests: build the full panel ECharts option (the same
// tooltip/axisPointer assembly Panel.tsx feeds to setOption), render it into a
// jest-canvas-mock canvas, and snapshot the emitted draw calls. A styling change
// (colors, series line/bar styling) shifts the draw calls and fails the snapshot.
//
// Only the series-layer draw calls are committed to the snapshot; the far noisier
// grid/axis layer is passed as viewer-only context (rendered in the local
// jest-canvas-mock-compare payload on failure, kept out of the repo) to keep the
// committed snapshot small. See `test/canvas.ts` for the zlevel-based split.

const width = 400;
const height = 300;

const theme = createTheme();

// Bounds only need to bracket the fixture's epoch-ms time values (1..3).
const timeRange: TimeRange = {
  from: dateTime(0),
  to: dateTime(4),
  raw: { from: 'now-4ms', to: 'now' },
};

const buildContext = (frames: DataFrame[], seriesType: SeriesType): ChartContext => ({
  frames,
  theme,
  timeZone: 'utc',
  timeRange,
  options: {
    [seriesTypePath]: seriesType,
    legend: DEFAULT_CHART_LEGEND,
  } as PanelOptions,
  seriesType,
  formatValue: (value) => String(value ?? ''),
});

describe('cartesian chart canvas styles', () => {
  it('renders a time-axis line chart', () => {
    const frame = toDataFrame({
      fields: [
        { name: 'time', type: FieldType.time, values: [1, 2, 3] },
        { name: 'cpu', type: FieldType.number, values: [10, 20, 30], config: { displayName: 'cpu' } },
        { name: 'mem', type: FieldType.number, values: [40, 50, 60], config: { displayName: 'mem' } },
      ],
    });

    const option = buildPanelChartOption(buildContext([frame], 'line'), { isGrafanaLegend: false });
    expect(option).not.toBeNull();

    const { seriesEvents, axisEvents } = renderEChartsOptionToCanvasEvents(option!, { width, height });
    expect(removeCanvasTransforms(seriesEvents)).toMatchCanvasSnapshot(axisEvents, { width, height });
  });

  it('renders a category-axis bar chart', () => {
    const frame = toDataFrame({
      fields: [
        { name: 'category', type: FieldType.string, values: ['Sales', 'Admin', 'IT'] },
        { name: 'Budget', type: FieldType.number, values: [43, 10, 30], config: { displayName: 'Budget' } },
        { name: 'Actual', type: FieldType.number, values: [50, 14, 28], config: { displayName: 'Actual' } },
      ],
    });

    const option = buildPanelChartOption(buildContext([frame], 'bar'), { isGrafanaLegend: false });
    expect(option).not.toBeNull();

    const { seriesEvents, axisEvents } = renderEChartsOptionToCanvasEvents(option!, { width, height });
    expect(removeCanvasTransforms(seriesEvents)).toMatchCanvasSnapshot(axisEvents, { width, height });
  });
});
