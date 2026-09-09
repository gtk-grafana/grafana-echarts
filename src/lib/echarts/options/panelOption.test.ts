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
import { LegendDisplayMode, SortOrder, TooltipDisplayMode, type VizLegendOptions } from '@grafana/schema';
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
  replaceVariables: (value: string) => value,
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

describe('buildPanelChartOption tooltip mode', () => {
  const radarFrame = (): DataFrame =>
    toDataFrame({
      fields: [
        { name: 'metric', type: FieldType.string, values: ['speed', 'power'] },
        { name: 'alpha', type: FieldType.number, values: [80, 70] },
        { name: 'bravo', type: FieldType.number, values: [60, 90] },
      ],
    });
  const noOverrides: FieldConfigSource = { defaults: {}, overrides: [] };
  const tooltipOf = (option: PanelOption) => (option as unknown as { tooltip?: { show?: boolean } }).tooltip;

  it('clamps a persisted All mode to Single for radar, which has no All tooltip', () => {
    // The editor no longer offers All (see `modules/multivariate/module.tsx`),
    // but dashboards saved before that still carry `multi`.
    const option = buildPanelChartOption(
      makeContext([radarFrame()], 'radar', noOverrides, {
        tooltip: { mode: TooltipDisplayMode.Multi, sort: SortOrder.None },
      }),
      { isGrafanaLegend: true }
    );

    // Single on a non-cartesian axis is an item trigger, and the multi-only row
    // options (sort/hideZeros) never apply.
    expect(tooltipOf(option)).toMatchObject({ show: true, trigger: 'item' });
  });

  it('still honours Hidden mode for radar', () => {
    const option = buildPanelChartOption(
      makeContext([radarFrame()], 'radar', noOverrides, {
        tooltip: { mode: TooltipDisplayMode.None, sort: SortOrder.None },
      }),
      { isGrafanaLegend: true }
    );

    expect(tooltipOf(option)).toEqual({ show: false });
  });

  it('leaves All mode alone for families that support it', () => {
    const option = buildPanelChartOption(
      makeContext([timeFrame()], 'line', noOverrides, {
        tooltip: { mode: TooltipDisplayMode.Multi, sort: SortOrder.None },
      }),
      { isGrafanaLegend: true }
    );

    expect(tooltipOf(option)).toMatchObject({ trigger: 'axis' });
  });
});

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
// field, so the converter returned null and the build threw. The pie series type
// is now excluded from the pre-strip (see `pieSeriesTypes` in
// `buildPanelChartOption`) and reads hidden slices itself.
describe('buildPanelChartOption for the pie (row/series family)', () => {
  // A wide pie source frame: each numeric field is one slice (Grafana's default),
  // named after the field so the legend visibility/color overrides target it.
  const pieFrame = (): DataFrame =>
    toDataFrame({
      fields: [
        { name: 'Sales', type: FieldType.number, values: [43], config: { displayName: 'Sales' } },
        { name: 'Admin', type: FieldType.number, values: [25], config: { displayName: 'Admin' } },
        { name: 'IT', type: FieldType.number, values: [30], config: { displayName: 'IT' } },
        { name: 'Support', type: FieldType.number, values: [48], config: { displayName: 'Support' } },
        { name: 'Ops', type: FieldType.number, values: [22], config: { displayName: 'Ops' } },
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
      buildPanelChartOption(makeContext([pieFrame()], 'pie', pieLegendFieldConfig), {
        isGrafanaLegend: true,
      });

    expect(build).not.toThrow();
    // Slices are ordered by the default sort (Descending): Support 48, Sales 43,
    // IT 30, Admin 25. 'Ops' (22) is hidden and dropped from the chart data.
    const names = pieData(build()).map((slice) => slice.name);
    expect(names).toEqual(['Support', 'Sales', 'IT', 'Admin']);
    expect(names).not.toContain('Ops');
  });

  it('applies the fixed-color override to the matching slice (theme-resolved)', () => {
    const option = buildPanelChartOption(makeContext([pieFrame()], 'pie', pieLegendFieldConfig), {
      isGrafanaLegend: true,
    });

    // The override stores the Grafana color name 'purple'; the slice must carry the
    // theme-resolved CSS color so ECharts can render it.
    expect(pieData(option).find((slice) => slice.name === 'Sales')?.itemStyle?.color).toBe(
      createTheme().visualization.getColorByName('purple')
    );
  });
});

// The panel-level `animation` flag is an opt-in, off by default, independent of
// the data. Density thresholds were tried and removed — they could not fire
// before the render that needed them. See `resolveAnimation`.
describe('buildPanelChartOption animation resolution', () => {
  const visible: FieldConfigSource = { defaults: {}, overrides: [] };
  const animationOf = (option: PanelOption | null): boolean | undefined => option?.animation;

  // A single-series time frame with `points` rows, to prove density is ignored.
  const denseTimeFrame = (points: number): DataFrame =>
    toDataFrame({
      fields: [
        { name: 'time', type: FieldType.time, values: Array.from({ length: points }, (_, i) => 1783137094497 + i) },
        { name: 'a', type: FieldType.number, values: Array.from({ length: points }, (_, i) => i) },
      ],
    });

  it('is off by default on a small time chart', () => {
    const option = buildPanelChartOption(makeContext([timeFrame()], 'line', visible), { isGrafanaLegend: true });
    expect(animationOf(option)).toBe(false);
  });

  // The Animation switch is Advanced-gated, and Default editor mode resets every
  // Advanced value before the render reads it (see `applyEditorModeDefaults`), so
  // the opt-in only takes effect in Advanced/API mode. Cartesian used not to
  // normalize at all, which is why this case previously passed without a mode;
  // it now behaves like the pie family, whose `ADVANCED_PIE_DEFAULTS` has always
  // reset `animation`.
  it('is on when explicitly enabled in Advanced mode', () => {
    const option = buildPanelChartOption(
      makeContext([timeFrame()], 'line', visible, { editorMode: 'advanced', animation: { enabled: true } }),
      { isGrafanaLegend: true }
    );
    expect(animationOf(option)).toBe(true);
  });

  // The opt-in is honored regardless of size: the user asked for it explicitly,
  // and there is no threshold left to overrule them.
  it('stays on when explicitly enabled on a dense chart', () => {
    const option = buildPanelChartOption(
      makeContext([denseTimeFrame(10_000)], 'line', visible, {
        editorMode: 'advanced',
        animation: { enabled: true },
      }),
      { isGrafanaLegend: true }
    );
    expect(animationOf(option)).toBe(true);
  });

  // The other half of the contract above: a stored opt-in is inert while the
  // switch that sets it is hidden, so a Default-mode panel renders unanimated
  // even with `animation.enabled: true` in its JSON.
  it('is off when enabled but the editor is in Default mode', () => {
    const option = buildPanelChartOption(
      makeContext([timeFrame()], 'line', visible, { editorMode: 'default', animation: { enabled: true } }),
      { isGrafanaLegend: true }
    );
    expect(animationOf(option)).toBe(false);
  });

  it('stays off on a dense chart when unset', () => {
    const option = buildPanelChartOption(makeContext([denseTimeFrame(10_000)], 'line', visible), {
      isGrafanaLegend: true,
    });
    expect(animationOf(option)).toBe(false);
  });
});

/**
 * The relations family reads only the field-based graph contract, which the plugin's
 * registered transformation produces above the panel. These are the two ends of that:
 * the shape the panel is handed builds a series, and a shape it cannot draw leaves the
 * panel empty instead of erroring.
 *
 * See todo/graph-wide-migration.md phases 1-2 and data-plane/graph-wide.md.
 */
describe('buildPanelChartOption for the relations family', () => {
  const visible: FieldConfigSource = { defaults: {}, overrides: [] };

  // What `legacyToWide` (or a native producer) hands the panel: one field per edge, with
  // the endpoints in labels, and one field per node.
  const wideFrames = (): DataFrame[] => [
    toDataFrame({
      name: 'edges',
      meta: { type: 'graph-edges-wide' as DataFrameType },
      fields: [
        { name: 'e1', type: FieldType.number, labels: { source: 'a', target: 'b' }, values: [10] },
        { name: 'e2', type: FieldType.number, labels: { source: 'b', target: 'c' }, values: [20] },
      ],
    }),
    toDataFrame({
      name: 'nodes',
      meta: { type: 'graph-nodes-wide' as DataFrameType },
      fields: [
        { name: 'a', type: FieldType.number, config: { displayName: 'Gateway' }, values: [1] },
        { name: 'b', type: FieldType.number, values: [2] },
        { name: 'c', type: FieldType.number, values: [3] },
      ],
    }),
  ];

  it.each(['graph', 'sankey', 'chord'] as const)('builds a %s series from wide frames', (seriesType) => {
    const option = buildPanelChartOption(makeContext(wideFrames(), seriesType, visible), { isGrafanaLegend: true });

    const series = seriesArray(option) as Array<{ type?: string; data?: unknown[]; links?: unknown[] }>;
    expect(series).toHaveLength(1);
    expect(series[0].type).toBe(seriesType);
    expect(series[0].data).toHaveLength(3);
    expect(series[0].links).toHaveLength(2);
  });

  /**
   * Previously this threw `Invalid chart option resolved for graph`, replacing the panel
   * with an error boundary. A response with no graph in it is ordinary no-data.
   */
  it('returns null rather than throwing when the frames carry no graph', () => {
    const context = makeContext([timeFrame()], 'graph', visible);

    expect(() => buildPanelChartOption(context, { isGrafanaLegend: true })).not.toThrow();
    expect(buildPanelChartOption(context, { isGrafanaLegend: true })).toBeNull();
  });
});
