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
import { HEATMAP_VISUALMAP_HEIGHT, HEATMAP_VISUALMAP_WIDTH } from 'lib/echarts/options/constants';
import { type HeatmapColorScalePlacement, type PanelOptions } from 'types';
import { type ChartContext } from './types';
import { heatmapChartModule } from './heatmap';

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

const makeContext = (frames: DataFrame[], placement?: HeatmapColorScalePlacement): ChartContext => ({
  frames,
  theme: createTheme(),
  timeZone: 'utc',
  timeRange,
  options: {
    [seriesTypePath]: 'heatmap',
    legend,
    ...(placement ? { heatmapColorScale: { placement } } : {}),
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
    const option = heatmapChartModule.buildOption(makeContext([heatmapFrame()]), { isGrafanaLegend: true }) as any;
    expect(option.visualMap.orient).toBe('vertical');
    expect(option.visualMap.right).toBeDefined();
    // hoverLink drives the cell highlight on visualMap hover; must stay enabled.
    expect(option.visualMap.hoverLink).not.toBe(false);
    expect(Number(option.grid.right)).toEqual(HEATMAP_VISUALMAP_WIDTH);
  });

  it('places the visualMap on the bottom (horizontal) and reserves grid height for bottom placement', () => {
    const option = heatmapChartModule.buildOption(makeContext([heatmapFrame()], 'bottom'), {
      isGrafanaLegend: true,
    }) as any;
    expect(option.visualMap.orient).toBe('horizontal');
    expect(option.visualMap.bottom).toBeDefined();
    expect(Number(option.grid.bottom)).toEqual(HEATMAP_VISUALMAP_HEIGHT);
  });
});
