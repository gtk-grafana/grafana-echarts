import {
  createTheme,
  type DataFrame,
  dateTime,
  type FieldConfigSource,
  FieldType,
  type TimeRange,
  toDataFrame,
  type ValueFormatter,
} from '@grafana/data';
import { seriesTypePath } from 'editor/constants';
import { type ChartContext } from 'lib/echarts/charts/types';
import { getPaletteColorByIndex } from 'lib/echarts/style';
import { type PanelOptions } from 'types';
import { hierarchyChartModule } from './hierarchy';

const theme = createTheme();

const timeRange: TimeRange = {
  from: dateTime(0),
  to: dateTime(1),
  raw: { from: 'now-1h', to: 'now' },
};

const formatValue: ValueFormatter = (value) => ({ text: String(value) });

// Flat categorical frame: each category becomes a top-level (root) node, so the
// legend lists one item per category — the case where per-node recoloring is
// most useful.
const categoricalFrame = (): DataFrame =>
  toDataFrame({
    fields: [
      { name: 'category', type: FieldType.string, values: ['Sales', 'Admin', 'IT'] },
      { name: 'value', type: FieldType.number, values: [43, 10, 30] },
    ],
  });

const ctx = (fieldConfig: FieldConfigSource): ChartContext => ({
  frames: [categoricalFrame()],
  theme,
  timeZone: 'utc',
  timeRange,
  // buildLegendItems ignores options/seriesType; a minimal shape satisfies the type.
  options: { [seriesTypePath]: 'treemap' } as PanelOptions,
  seriesType: 'treemap',
  formatValue,
  replaceVariables: (value: string) => value,
  fieldConfig,
});

describe('hierarchyChartModule.buildLegendItems colors', () => {
  it('colors each root legend item from the classic palette by position', () => {
    const items = hierarchyChartModule.buildLegendItems(ctx({ defaults: {}, overrides: [] }), []);

    expect(items.map((item) => item.label)).toEqual(['Sales', 'Admin', 'IT']);
    expect(items[0].color).toBe(getPaletteColorByIndex(0, theme));
    expect(items[1].color).toBe(getPaletteColorByIndex(1, theme));
  });

  it('applies a fixed-color override to the matching legend item, keeping others on the palette', () => {
    const fieldConfig: FieldConfigSource = {
      defaults: {},
      overrides: [
        {
          matcher: { id: 'byName', options: 'Admin' },
          properties: [{ id: 'color', value: { mode: 'fixed', fixedColor: '#123456' } }],
        },
      ],
    };

    const items = hierarchyChartModule.buildLegendItems(ctx(fieldConfig), []);

    expect(items.find((item) => item.label === 'Admin')?.color).toBe('#123456');
    expect(items.find((item) => item.label === 'Sales')?.color).toBe(getPaletteColorByIndex(0, theme));
    expect(items.find((item) => item.label === 'IT')?.color).toBe(getPaletteColorByIndex(2, theme));
  });
});
