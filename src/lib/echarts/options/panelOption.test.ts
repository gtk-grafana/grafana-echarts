import {
  ByNamesMatcherMode,
  createTheme,
  type DataFrame,
  DataFrameType,
  dateTime,
  FieldMatcherID,
  FieldType,
  type FieldConfigSource,
  type SystemConfigOverrideRule,
  type TimeRange,
  toDataFrame,
  type ValueFormatter,
} from '@grafana/data';
import { LegendDisplayMode, type VizLegendOptions } from '@grafana/schema';
import { seriesTypePath } from 'editor/constants';
import { type SeriesType } from 'editor/types';
import { type ChartContext } from 'lib/echarts/charts/types';
import { type PanelOptions } from 'types';
import { buildPanelChartOption } from './panelOption';

const timeRange: TimeRange = {
  from: dateTime(1783137094497),
  to: dateTime(1783147894497),
  raw: { from: 'now-3h', to: 'now' },
};

const formatValue: ValueFormatter = (value) => ({ text: String(value) });

const legend: VizLegendOptions = {
  showLegend: true,
  displayMode: LegendDisplayMode.List,
  placement: 'bottom',
  calcs: [],
};

// A two-series time frame (the reported "line" case).
const timeFrame = (): DataFrame =>
  toDataFrame({
    fields: [
      { name: 'time', type: FieldType.time, values: [1783137094497, 1783140694497] },
      { name: 'a', type: FieldType.number, values: [1, 2] },
      { name: 'b', type: FieldType.number, values: [3, 4] },
    ],
  });

// A category frame: a string label field plus numeric value fields (renders on
// a category x-axis because there is no time field).
const categoryFrame = (): DataFrame =>
  toDataFrame({
    fields: [
      { name: 'category', type: FieldType.string, values: ['Sales', 'Admin', 'IT'] },
      { name: 'Budget', type: FieldType.number, values: [43, 10, 30] },
      { name: 'Actual', type: FieldType.number, values: [50, 14, 28] },
    ],
  });

// A candlestick frame: OHLC value fields over time (the multi-value cartesian
// family renders these as a single series on a category x-axis).
const candlestickFrame = (): DataFrame =>
  toDataFrame({
    name: 'OHLC',
    fields: [
      { name: 'time', type: FieldType.time, values: [1783137094497, 1783140694497] },
      { name: 'open', type: FieldType.number, values: [1, 2] },
      { name: 'high', type: FieldType.number, values: [4, 5] },
      { name: 'low', type: FieldType.number, values: [0, 1] },
      { name: 'close', type: FieldType.number, values: [3, 4] },
    ],
  });

// A dataplane heatmap-rows frame (bucket-per-field over time).
const heatmapFrame = (): DataFrame =>
  toDataFrame({
    meta: { type: DataFrameType.HeatmapRows },
    fields: [
      { name: 'time', type: FieldType.time, values: [1783137094497, 1783140694497] },
      { name: 'b1', type: FieldType.number, values: [5, 6], labels: { le: '10' } },
      { name: 'b2', type: FieldType.number, values: [7, 8], labels: { le: '20' } },
    ],
  });

// A cartesian overlay frame on the heatmap (numeric field overridden to a line).
const overlayFrame = (): DataFrame =>
  toDataFrame({
    fields: [
      { name: 'time', type: FieldType.time, values: [1783137094497, 1783140694497] },
      {
        name: 'metric',
        type: FieldType.number,
        values: [10, 20],
        config: { displayName: 'overlay-metric', custom: { seriesType: 'line' } },
      },
    ],
  });

// The field config core writes when every series is deselected in the legend:
// a `hideSeriesFrom` system override keeping nothing visible (exclude mode with
// an empty name list), so every numeric field is hidden from the viz.
const hideAllOverride: SystemConfigOverrideRule = {
  __systemRef: 'hideSeriesFrom',
  matcher: {
    id: FieldMatcherID.byNames,
    options: { mode: ByNamesMatcherMode.exclude, names: [], prefix: 'All except:', readOnly: true },
  },
  properties: [{ id: 'custom.hideFrom', value: { viz: true, legend: false, tooltip: true } }],
};

const allHiddenFieldConfig: FieldConfigSource = {
  defaults: {},
  overrides: [hideAllOverride],
};

const makeContext = (
  frames: DataFrame[],
  seriesType: SeriesType,
  fieldConfig: FieldConfigSource,
  extraOptions?: Partial<PanelOptions>
): ChartContext => ({
  frames,
  theme: createTheme(),
  timeZone: 'utc',
  timeRange,
  options: { [seriesTypePath]: seriesType, legend, ...extraOptions } as PanelOptions,
  seriesType,
  formatValue,
  fieldConfig,
});

type PanelOption = ReturnType<typeof buildPanelChartOption>;

const firstXAxis = (option: PanelOption) => {
  const { xAxis } = option as unknown as {
    xAxis?: Array<{ type?: string; data?: unknown }> | { type?: string; data?: unknown };
  };
  return Array.isArray(xAxis) ? xAxis[0] : xAxis;
};

const seriesArray = (option: PanelOption) => {
  const { series } = option as unknown as { series?: unknown };
  return Array.isArray(series) ? series : series ? [series] : [];
};

describe('buildPanelChartOption with all series hidden', () => {
  it('renders a time x-axis with no series for the time cartesian (line) path', () => {
    const option = buildPanelChartOption(makeContext([timeFrame()], 'line', allHiddenFieldConfig), {
      isGrafanaLegend: true,
    });

    // The x-axis still anchors to the dashboard range (matches core Grafana).
    expect(firstXAxis(option)?.type).toBe('time');
    // Nothing is plotted while every series is hidden.
    expect(seriesArray(option)).toEqual([]);
  });

  it('keeps the category x-axis labels with no series for the category path', () => {
    const option = buildPanelChartOption(makeContext([categoryFrame()], 'bar', allHiddenFieldConfig), {
      isGrafanaLegend: true,
    });

    const xAxis = firstXAxis(option);
    expect(xAxis?.type).toBe('category');
    // The category labels come from the surviving string field.
    expect(xAxis?.data).toEqual(['Sales', 'Admin', 'IT']);
    expect(seriesArray(option)).toEqual([]);
  });

  it('renders the category axis with no series for the multi-value (candlestick) path', () => {
    const option = buildPanelChartOption(makeContext([candlestickFrame()], 'candlestick', allHiddenFieldConfig), {
      isGrafanaLegend: true,
    });

    // Candlestick/boxplot render on a category x-axis.
    expect(firstXAxis(option)?.type).toBe('category');
    expect(seriesArray(option)).toEqual([]);
  });

  it('renders the heatmap axes with no cells/overlays instead of throwing', () => {
    const option = buildPanelChartOption(
      makeContext([heatmapFrame(), overlayFrame()], 'heatmap', allHiddenFieldConfig),
      {
        isGrafanaLegend: true,
      }
    );

    expect(firstXAxis(option)?.type).toBe('time');
    expect(seriesArray(option)).toEqual([]);
    // No cells means no color mapping is emitted.
    expect(option).not.toHaveProperty('visualMap');
  });
});

describe('buildPanelChartOption with no series hidden', () => {
  const visible = { defaults: {}, overrides: [] } satisfies FieldConfigSource;

  it('plots the time cartesian (line) series', () => {
    const option = buildPanelChartOption(makeContext([timeFrame()], 'line', visible), { isGrafanaLegend: true });
    expect(seriesArray(option)).toHaveLength(2);
  });

  it('plots the category series', () => {
    const option = buildPanelChartOption(makeContext([categoryFrame()], 'bar', visible), { isGrafanaLegend: true });
    expect(seriesArray(option)).toHaveLength(2);
  });

  it('plots the multi-value (candlestick) series', () => {
    const option = buildPanelChartOption(makeContext([candlestickFrame()], 'candlestick', visible), {
      isGrafanaLegend: true,
    });
    expect(seriesArray(option)).toHaveLength(1);
  });

  it('plots the heatmap cell layer and its overlay', () => {
    const option = buildPanelChartOption(makeContext([heatmapFrame(), overlayFrame()], 'heatmap', visible), {
      isGrafanaLegend: true,
    });
    // Cell layer plus the cartesian overlay.
    expect(seriesArray(option)).toHaveLength(2);
    expect(option).toHaveProperty('visualMap');
  });
});

// Regression for "Invalid chart option resolved for pie" (the provisioned
// Legend Visibility & Color dashboard). A pie hides slices by *category* name,
// but the shared pre-strip hides by *numeric field* name — with an exclude-mode
// `hideSeriesFrom` keeping only slice names, it dropped the pie's single `value`
// field, so the converter returned null and the build threw. The pie module now
// opts out of the pre-strip (`readsHiddenSeriesInternally`) and reads hidden
// slices itself.
describe('buildPanelChartOption for the pie (row/series family)', () => {
  // A pie source frame: a category label field plus one numeric value field.
  // Slices are the category rows (long format), not the numeric fields.
  const pieFrame = (): DataFrame =>
    toDataFrame({
      fields: [
        { name: 'category', type: FieldType.string, values: ['Sales', 'Admin', 'IT', 'Support', 'Ops'] },
        { name: 'value', type: FieldType.number, values: [43, 25, 30, 48, 22], config: { displayName: 'value' } },
      ],
    });

  // The `hideSeriesFrom` system override the visibility toggle writes: keep every
  // slice except 'Ops' (exclude mode), so 'Ops' is hidden from the viz.
  const pieHideOverride: SystemConfigOverrideRule = {
    __systemRef: 'hideSeriesFrom',
    matcher: {
      id: FieldMatcherID.byNames,
      options: {
        mode: ByNamesMatcherMode.exclude,
        names: ['Sales', 'Admin', 'IT', 'Support'],
        prefix: 'All except:',
        readOnly: true,
      },
    },
    properties: [{ id: 'custom.hideFrom', value: { viz: true, legend: false, tooltip: true } }],
  };

  // Legend interactions as core writes them: a fixed-color override pins 'Sales'
  // purple, plus the `hideSeriesFrom` override above.
  const pieLegendFieldConfig: FieldConfigSource = {
    defaults: {},
    overrides: [
      {
        matcher: { id: FieldMatcherID.byName, options: 'Sales' },
        properties: [{ id: 'color', value: { mode: 'fixed', fixedColor: 'purple' } }],
      },
      pieHideOverride,
    ],
  };

  const pieData = (option: PanelOption): Array<{ name?: string; itemStyle?: { color?: string } }> => {
    const [series] = seriesArray(option);
    return (series as { data?: Array<{ name?: string; itemStyle?: { color?: string } }> })?.data ?? [];
  };

  it('builds without throwing and drops the hidden slice', () => {
    const build = () =>
      buildPanelChartOption(makeContext([pieFrame()], 'pie', pieLegendFieldConfig, { pieFormat: 'long' }), {
        isGrafanaLegend: true,
      });

    expect(build).not.toThrow();
    const names = pieData(build()).map((slice) => slice.name);
    expect(names).toEqual(['Sales', 'Admin', 'IT', 'Support']);
    expect(names).not.toContain('Ops');
  });

  it('applies the fixed-color override to the matching slice', () => {
    const option = buildPanelChartOption(
      makeContext([pieFrame()], 'pie', pieLegendFieldConfig, { pieFormat: 'long' }),
      { isGrafanaLegend: true }
    );

    expect(pieData(option).find((slice) => slice.name === 'Sales')?.itemStyle?.color).toBe('purple');
  });
});
