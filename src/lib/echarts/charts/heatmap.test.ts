import {
  createTheme,
  type DataFrame,
  DataFrameType,
  dateTime,
  FieldType,
  type TimeRange,
  toDataFrame,
  type ValueFormatter,
} from '@grafana/data';
import { LegendDisplayMode, type VizLegendOptions } from '@grafana/schema';
import { seriesTypePath } from 'editor/constants';
import {
  COLOR_SCHEMES,
  HEATMAP_VALUE_DIM,
  HEATMAP_VISUALMAP_HEIGHT,
  HEATMAP_VISUALMAP_WIDTH,
} from 'lib/echarts/options/constants';
import { type HeatmapColorScheme } from 'lib/echarts/options/types';
import { type HeatmapColorScalePlacement, type PanelOptions } from 'types';
import { heatmapChartModule } from './heatmap';
import { type ChartContext, type EChartHeatmapOption } from './types';

/**
 * ECharts composes each component option to `T | T[]` (see `ComposeOption`).
 * The heatmap builder always emits a single `grid`/`visualMap` object, so unwrap
 * the array form to read component properties directly in assertions.
 */
const single = <T>(value: T | T[] | undefined): T | undefined => (Array.isArray(value) ? value[0] : value);

/**
 * `ChartModule.buildOption` widens the return to the whole `EChartBuildOption`
 * union; narrow it back to the concrete option the heatmap module actually builds.
 */
const buildHeatmapOption = (...args: Parameters<typeof heatmapChartModule.buildOption>): EChartHeatmapOption | null =>
  heatmapChartModule.buildOption(...args) as EChartHeatmapOption | null;

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

const makeContext = (
  frames: DataFrame[],
  placement?: HeatmapColorScalePlacement,
  colorScheme?: HeatmapColorScheme
): ChartContext => ({
  frames,
  theme: createTheme(),
  timeZone: 'utc',
  timeRange,
  options: {
    [seriesTypePath]: 'heatmap',
    legend,
    ...(placement ? { heatmapColorScale: { placement } } : {}),
    ...(colorScheme ? { heatmapColorScheme: colorScheme } : {}),
  } as PanelOptions,
  seriesType: 'heatmap',
  formatValue,
});

// Heatmap-rows cell frame: bucket-per-field over time (see heatmap converter).
const heatmapFrame = (): DataFrame =>
  toDataFrame({
    meta: { type: DataFrameType.HeatmapRows },
    fields: [
      { name: 'time', type: FieldType.time, values: [1783137094497, 1783140694497] },
      { name: 'b1', type: FieldType.number, values: [5, 6], labels: { le: '10' } },
      { name: 'b2', type: FieldType.number, values: [7, 8], labels: { le: '20' } },
    ],
  });

// Heatmap-rows cell frame whose X field is numeric, so the layer must render on
// a value x-axis rather than a time axis (see heatmap converter `xIsTime`).
const numericXHeatmapFrame = (): DataFrame =>
  toDataFrame({
    meta: { type: DataFrameType.HeatmapRows },
    fields: [
      { name: 'x', type: FieldType.number, values: [1, 2] },
      { name: 'b1', type: FieldType.number, values: [5, 6], labels: { le: '10' } },
      { name: 'b2', type: FieldType.number, values: [7, 8], labels: { le: '20' } },
    ],
  });

// A cartesian overlay frame: numeric field overridden to a cartesian series type.
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

describe('heatmapChartModule.buildLegendItems', () => {
  it('returns no items for a pure heatmap (cells use the visualMap)', () => {
    expect(heatmapChartModule.buildLegendItems(makeContext([heatmapFrame()]), [])).toEqual([]);
  });

  it('returns one item per overlaid cartesian series', () => {
    const items = heatmapChartModule.buildLegendItems(makeContext([heatmapFrame(), overlayFrame()]), []);
    expect(items).toHaveLength(1);
    expect(items[0].label).toBe('overlay-metric');
  });
});

describe('heatmapChartModule.buildOption', () => {
  it('emits a visualMap for the heatmap cell layer', () => {
    const option = heatmapChartModule.buildOption(makeContext([heatmapFrame(), overlayFrame()]), {
      isGrafanaLegend: true,
    });
    expect(option).not.toBeNull();
    expect(option).toHaveProperty('visualMap');
  });

  it('places the visualMap on the right (vertical) by default and reserves grid width', () => {
    const option = buildHeatmapOption(makeContext([heatmapFrame()]), { isGrafanaLegend: true });
    const visualMap = single(option?.visualMap);
    const grid = single(option?.grid);
    expect(visualMap?.orient).toBe('vertical');
    expect(visualMap?.right).toBeDefined();
    // hoverLink drives the cell highlight on visualMap hover; must stay enabled.
    expect(visualMap?.hoverLink).not.toBe(false);
    expect(Number(grid?.right)).toEqual(HEATMAP_VISUALMAP_WIDTH);
  });

  it('places the visualMap on the bottom (horizontal) and reserves grid height for bottom placement', () => {
    const option = buildHeatmapOption(makeContext([heatmapFrame()], 'bottom'), { isGrafanaLegend: true });
    const visualMap = single(option?.visualMap);
    const grid = single(option?.grid);
    expect(visualMap?.orient).toBe('horizontal');
    expect(visualMap?.bottom).toBeDefined();
    expect(Number(grid?.bottom)).toEqual(HEATMAP_VISUALMAP_HEIGHT);
  });
//
  it('returns null when there are no heatmap frames (only a cartesian overlay)', () => {
    expect(buildHeatmapOption(makeContext([overlayFrame()]), { isGrafanaLegend: true })).toBeNull();
  });

  it('returns null when there are no frames at all', () => {
    expect(buildHeatmapOption(makeContext([]), { isGrafanaLegend: true })).toBeNull();
  });

  it('scales the visualMap to the finite cell value range', () => {
    const option = buildHeatmapOption(makeContext([heatmapFrame()]), { isGrafanaLegend: true });
    const visualMap = single(option?.visualMap);
    // heatmapFrame values span 5..8; the visualMap maps that range to colors.
    expect(visualMap?.min).toBe(5);
    expect(visualMap?.max).toBe(8);
    // The value lives in the last dim of the encoded cell tuple.
    expect(visualMap?.dimension).toBe(HEATMAP_VALUE_DIM);
  });

  it('applies the selected color scheme to the visualMap gradient', () => {
    const option = buildHeatmapOption(makeContext([heatmapFrame()], undefined, 'blues'), { isGrafanaLegend: true });
    const visualMap = single(option?.visualMap);
    expect(visualMap?.inRange?.color).toEqual(COLOR_SCHEMES.blues);
  });

  it('bounds the bucket (Y) axis to the heatmap bucket range', () => {
    const option = buildHeatmapOption(makeContext([heatmapFrame()]), { isGrafanaLegend: true });
    const yAxis = single(option?.yAxis);
    // Buckets 0..10 and 10..20 give a 0..20 bucket range.
    expect(yAxis?.min).toBe(0);
    expect(yAxis?.max).toBe(20);
  });

  it('uses a time x-axis when the heatmap X field is time', () => {
    const option = buildHeatmapOption(makeContext([heatmapFrame()]), { isGrafanaLegend: true });
    const xAxis = single(option?.xAxis);
    expect(xAxis?.type).toBe('time');
  });

  it('uses a value x-axis when the heatmap X field is numeric', () => {
    const option = buildHeatmapOption(makeContext([numericXHeatmapFrame()]), { isGrafanaLegend: true });
    const xAxis = single(option?.xAxis);
    expect(xAxis?.type).toBe('value');
  });
});

describe('heatmapChartModule.buildOption series composition', () => {
  const seriesOf = (option: EChartHeatmapOption | null) =>
    (Array.isArray(option?.series) ? option?.series : option?.series ? [option.series] : []) ?? [];

  it('emits a single heatmap cell series for a pure heatmap', () => {
    const series = seriesOf(buildHeatmapOption(makeContext([heatmapFrame()]), { isGrafanaLegend: true }));
    expect(series).toHaveLength(1);
    expect(series[0]).toMatchObject({ type: 'heatmap', name: 'Heatmap' });
  });

  it('appends cartesian overlays after the cell layer on a secondary y-axis', () => {
    const series = seriesOf(
      buildHeatmapOption(makeContext([heatmapFrame(), overlayFrame()]), { isGrafanaLegend: true })
    );
    expect(series).toHaveLength(2);
    // Cell layer stays first (series index 0, which the visualMap colors).
    expect(series[0]).toMatchObject({ type: 'heatmap', name: 'Heatmap' });
    // The overlay renders against the secondary y-axis so it isn't squashed onto
    // the bucket scale.
    expect(series[1]).toMatchObject({ yAxisIndex: 1 });
  });
});
