import {
  createTheme,
  type DataFrame,
  DataFrameType,
  dateTime,
  FieldType,
  formattedValueToString,
  type TimeRange,
  toDataFrame,
  type ValueFormatter,
} from '@grafana/data';
import { AxisPlacement, LegendDisplayMode, type VizLegendOptions } from '@grafana/schema';
import { type YAXisOption } from 'echarts/types/src/coord/cartesian/AxisModel';
import { seriesTypePath } from 'editor/constants';
import { AXIS_OFFSET_STEP } from 'lib/echarts/axes/yAxes';
import {
  COLOR_SCHEMES,
  HEATMAP_VALUE_DIM,
  HEATMAP_VISUALMAP_HEIGHT,
  HEATMAP_VISUALMAP_WIDTH,
} from 'lib/echarts/options/constants';
import { type HeatmapColorScheme } from 'lib/echarts/options/types';
import { type HeatmapColorScalePlacement, type PanelOptions } from 'types';
import { heatmapChartModule } from './heatmap';
import { type ChartContext, type EChartBinnedHeatmapOption, type EChartMatrixHeatmapOption } from './types';

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
const buildHeatmapOption = (
  ...args: Parameters<typeof heatmapChartModule.buildOption>
): EChartBinnedHeatmapOption | null => heatmapChartModule.buildOption(...args) as EChartBinnedHeatmapOption | null;

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

// A cartesian overlay frame with two distinct units, so the overlay builds one
// value axis per unit (bytes, percent). An optional placement override on the
// percent field exercises the Left/Right/Hidden axis-placement path.
const twoUnitOverlayFrame = (percentPlacement?: AxisPlacement): DataFrame =>
  toDataFrame({
    fields: [
      { name: 'time', type: FieldType.time, values: [1783137094497, 1783140694497] },
      {
        name: 'bytesMetric',
        type: FieldType.number,
        values: [10, 20],
        config: { unit: 'bytes', custom: { seriesType: 'line' } },
      },
      {
        name: 'percentMetric',
        type: FieldType.number,
        values: [40, 55],
        config: {
          unit: 'percent',
          custom: { seriesType: 'line', ...(percentPlacement ? { axisPlacement: percentPlacement } : {}) },
        },
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

  it('hides the visualMap and reserves no grid space for it when placement is none', () => {
    const option = buildHeatmapOption(makeContext([heatmapFrame()], 'none'), { isGrafanaLegend: true });
    const visualMap = single(option?.visualMap);
    const grid = single(option?.grid);
    // Hidden legend, but the color mapping stays so the cells remain colored.
    expect(visualMap?.show).toBe(false);
    expect(visualMap?.dimension).toBe(HEATMAP_VALUE_DIM);
    // No visualMap band reserved on either edge.
    expect(Number(grid?.right)).toBe(0);
    expect(grid?.bottom).not.toBe(HEATMAP_VISUALMAP_HEIGHT);
  });

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

  it('emits a single bucket y-axis (object, not array) for a pure heatmap', () => {
    const option = buildHeatmapOption(makeContext([heatmapFrame()]), { isGrafanaLegend: true });
    // No overlay: keep a single y-axis so the pure heatmap layout is unchanged.
    expect(Array.isArray(option?.yAxis)).toBe(false);
  });

  it('adds a secondary auto-scaled y-axis for the overlay (index 1)', () => {
    const option = buildHeatmapOption(makeContext([heatmapFrame(), overlayFrame()]), { isGrafanaLegend: true });
    // The overlay references yAxisIndex 1, so that axis must exist or ECharts
    // errors during series init.
    expect(Array.isArray(option?.yAxis)).toBe(true);
    const yAxes = (Array.isArray(option?.yAxis) ? option?.yAxis : []) as YAXisOption[];
    expect(yAxes).toHaveLength(2);
    // Bucket axis (index 0) stays pinned to the bucket range.
    expect(yAxes[0]?.min).toBe(0);
    expect(yAxes[0]?.max).toBe(20);
    // Overlay axis (index 1) auto-fits its own values instead of the bucket scale.
    // `scale` lives on the value-axis variant of the YAXisOption union.
    const overlayAxis = yAxes[1] as { type?: string; scale?: boolean };
    expect(overlayAxis.type).toBe('value');
    expect(overlayAxis.scale).toBe(true);
  });

  it('defaults the overlay axis to the right so it clears the bucket axis', () => {
    const option = buildHeatmapOption(makeContext([heatmapFrame(), overlayFrame()]), { isGrafanaLegend: true });
    const yAxes = (Array.isArray(option?.yAxis) ? option?.yAxis : []) as YAXisOption[];
    // Bucket axis keeps the left; the overlay axis defaults to the right.
    expect(yAxes[1]?.position).toBe('right');
    // The bucket axis owns the split lines; the overlay axis stays clear.
    expect(yAxes[1]?.splitLine?.show).toBe(false);
  });

  it('builds one overlay axis per distinct unit, stacked on the right after the bucket axis', () => {
    const option = buildHeatmapOption(makeContext([heatmapFrame(), twoUnitOverlayFrame()]), { isGrafanaLegend: true });
    const yAxes = (Array.isArray(option?.yAxis) ? option?.yAxis : []) as YAXisOption[];
    // Bucket axis (0) plus one axis per overlay unit (1: bytes, 2: percent).
    expect(yAxes).toHaveLength(3);
    expect(yAxes[0]?.min).toBe(0);
    expect(yAxes[0]?.max).toBe(20);
    expect(yAxes[1]?.position).toBe('right');
    expect(yAxes[2]?.position).toBe('right');
    // Stacked on the right with increasing offsets so labels don't overlap.
    expect(yAxes[1]?.offset).toBe(0);
    expect(yAxes[2]?.offset).toBe(AXIS_OFFSET_STEP);
  });

  it('reserves extra grid width for stacked overlay right axes', () => {
    const option = buildHeatmapOption(makeContext([heatmapFrame(), twoUnitOverlayFrame()]), { isGrafanaLegend: true });
    const grid = single(option?.grid);
    // visualMap width plus one extra offset slot for the second right axis.
    expect(Number(grid?.right)).toBe(HEATMAP_VISUALMAP_WIDTH + AXIS_OFFSET_STEP);
  });

  it('hides an overlay axis whose field sets axisPlacement=hidden but still plots it', () => {
    const option = buildHeatmapOption(makeContext([heatmapFrame(), twoUnitOverlayFrame(AxisPlacement.Hidden)]), {
      isGrafanaLegend: true,
    });
    const yAxes = (Array.isArray(option?.yAxis) ? option?.yAxis : []) as YAXisOption[];
    // The percent axis (index 2) is hidden; its series still maps to it.
    expect(yAxes[2]?.axisLabel?.show).toBe(false);
    expect(yAxes[2]?.axisTick?.show).toBe(false);
    // A hidden axis reserves no grid width beyond the visualMap.
    const grid = single(option?.grid);
    expect(Number(grid?.right)).toBe(HEATMAP_VISUALMAP_WIDTH);
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

describe('heatmapChartModule.buildOption matrix layout', () => {
  // Wide/pivot frame: string field (Y rows) plus numeric fields (X columns).
  const matrixFrame = (): DataFrame =>
    toDataFrame({
      fields: [
        { name: 'row', type: FieldType.string, values: ['a', 'b'] },
        { name: 'c1', type: FieldType.number, values: [1, 2] },
        { name: 'c2', type: FieldType.number, values: [3, 4] },
      ],
    });

  const matrixContext = (frames: DataFrame[]): ChartContext => {
    const ctx = makeContext(frames);
    return { ...ctx, options: { ...ctx.options, heatmapLayout: 'matrix' } };
  };

  const buildMatrix = (frames: DataFrame[]): EChartMatrixHeatmapOption | null =>
    heatmapChartModule.buildOption(matrixContext(frames), {
      isGrafanaLegend: true,
    }) as EChartMatrixHeatmapOption | null;

  it('renders on two category axes', () => {
    const option = buildMatrix([matrixFrame()]);
    expect(single(option?.xAxis)?.type).toBe('category');
    expect(single(option?.yAxis)?.type).toBe('category');
  });

  it('emits a single native heatmap series and a visualMap', () => {
    const option = buildMatrix([matrixFrame()]);
    const series = Array.isArray(option?.series) ? option?.series : option?.series ? [option.series] : [];
    expect(series).toHaveLength(1);
    expect(series?.[0]).toMatchObject({ type: 'heatmap', name: 'Heatmap' });
    expect(option).toHaveProperty('visualMap');
    expect(single(option?.visualMap)?.min).toBe(1);
    expect(single(option?.visualMap)?.max).toBe(4);
  });

  it('returns null when there is no numeric data', () => {
    const frame = toDataFrame({ fields: [{ name: 'row', type: FieldType.string, values: ['a', 'b'] }] });
    expect(buildMatrix([frame])).toBeNull();
  });
});

describe('heatmapChartModule.buildOption series composition', () => {
  const seriesOf = (option: EChartBinnedHeatmapOption | null) =>
    (Array.isArray(option?.series) ? option?.series : option?.series ? [option.series] : []) ?? [];

  it('emits a single heatmap cell series for a pure heatmap', () => {
    const series = seriesOf(buildHeatmapOption(makeContext([heatmapFrame()]), { isGrafanaLegend: true }));
    expect(series).toHaveLength(1);
    // The binned cell layer is drawn as a custom series (interval rectangles).
    expect(series[0]).toMatchObject({ type: 'custom', name: 'Heatmap' });
  });

  it('appends cartesian overlays after the cell layer on a secondary y-axis', () => {
    const series = seriesOf(
      buildHeatmapOption(makeContext([heatmapFrame(), overlayFrame()]), { isGrafanaLegend: true })
    );
    expect(series).toHaveLength(2);
    // Cell layer stays first (series index 0, which the visualMap colors).
    expect(series[0]).toMatchObject({ type: 'custom', name: 'Heatmap' });
    // The overlay renders against the secondary y-axis so it isn't squashed onto
    // the bucket scale.
    expect(series[1]).toMatchObject({ yAxisIndex: 1 });
  });

  it('pins each overlay series to its unit axis, offset past the bucket axis', () => {
    const series = seriesOf(
      buildHeatmapOption(makeContext([heatmapFrame(), twoUnitOverlayFrame()]), { isGrafanaLegend: true })
    );
    // Cell layer + one overlay series per unit.
    expect(series).toHaveLength(3);
    expect(series[0]).toMatchObject({ type: 'custom', name: 'Heatmap' });
    // Bucket axis is index 0, so unit axes start at 1 (bytes) and 2 (percent).
    expect(series[1]).toMatchObject({ yAxisIndex: 1 });
    expect(series[2]).toMatchObject({ yAxisIndex: 2 });
  });
});

describe('heatmapChartModule.getTooltipValueFormatter', () => {
  it('uses the panel formatter for the cell layer (series index 0)', () => {
    const resolve = heatmapChartModule.getTooltipValueFormatter(makeContext([heatmapFrame(), twoUnitOverlayFrame()]));
    // The cell layer is series index 0; it falls back to the panel formatter.
    expect(resolve({ seriesIndex: 0 })(5)).toEqual(formatValue(5));
  });

  it('resolves each overlay series to its own field unit formatter', () => {
    const resolve = heatmapChartModule.getTooltipValueFormatter(makeContext([heatmapFrame(), twoUnitOverlayFrame()]));
    // Overlays follow the cell layer: index 1 is bytes, index 2 is percent.
    expect(formattedValueToString(resolve({ seriesIndex: 2 })(50))).toContain('%');
    // The bytes overlay formats with its unit, unlike the raw panel formatter.
    expect(formattedValueToString(resolve({ seriesIndex: 1 })(1048576))).not.toBe(String(1048576));
  });

  it('falls back to the panel formatter for an unknown series index', () => {
    const resolve = heatmapChartModule.getTooltipValueFormatter(makeContext([heatmapFrame()]));
    expect(resolve({ seriesIndex: 5 })(7)).toEqual(formatValue(7));
  });
});
