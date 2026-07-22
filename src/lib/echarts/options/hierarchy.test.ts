import {
  createTheme,
  type Field,
  FieldColorModeId,
  type FieldConfigSource,
  FieldType,
  getDisplayProcessor,
  toDataFrame,
} from '@grafana/data';
import { LegendDisplayMode, TooltipDisplayMode, type VizLegendOptions, type VizTooltipOptions } from '@grafana/schema';
import { type HierarchyData } from 'lib/echarts/converters/hierarchy';
import { getPaletteColorByIndex } from 'lib/echarts/style';
import { type TooltipModel, type TooltipSink } from 'lib/echarts/tooltip/model';
import type { PanelOptions } from 'types';
import { getSunburstSeries, getTreemapSeries, type HierarchySeriesContext } from './hierarchy';

const theme = createTheme();

const noOverrides: FieldConfigSource = { defaults: {}, overrides: [] };

// Minimal PanelOptions for the hierarchy series builders: they read
// `legend.isVisible`/`legend.width` (treemap breadcrumb), `tooltip.mode`, and
// `zLevel.series`. Mirrors the option shapes built in test/panel.tsx.
const panelOptions = (mode: TooltipDisplayMode): PanelOptions => ({
  legend: {
    showLegend: true,
    isVisible: true,
    displayMode: LegendDisplayMode.List,
    placement: 'bottom',
    calcs: [],
  } as VizLegendOptions,
  tooltip: { mode } as VizTooltipOptions,
});

const ctx = (
  fieldConfig: FieldConfigSource,
  tooltipMode: TooltipDisplayMode = TooltipDisplayMode.Single,
  valueField?: Field,
  tooltipSink?: TooltipSink
): HierarchySeriesContext =>
  ({
    theme,
    options: panelOptions(tooltipMode),
    formatValue: (value) => ({ text: String(value) }),
    fieldConfig,
    valueField,
    tooltipSink,
  }) as HierarchySeriesContext;

// A numeric field carrying a by-value (continuous) Color scheme, with a display
// processor bound so `display(value).color` resolves along the gradient.
const byValueField = (): Field => {
  const [field] = toDataFrame({
    fields: [
      {
        name: 'value',
        type: FieldType.number,
        values: [100, 60, 30],
        config: { min: 0, max: 100, color: { mode: FieldColorModeId.ContinuousGrYlRd } },
      },
    ],
  }).fields;
  return { ...field, display: getDisplayProcessor({ field, theme }) };
};

// Build a hierarchy series with a capturing tooltip sink, invoke its emitting
// `tooltip.formatter` with a test param, and return the emitted TooltipModel.
// ECharts types the series `tooltip.formatter` as a wide union; the hierarchy
// formatter only reads `.name`/`.color`/`.data`, so the param passes straight
// through.
function captureTooltip(
  build: (sink: TooltipSink) => { tooltip?: { formatter?: unknown } },
  param: unknown
): TooltipModel {
  let captured: TooltipModel | undefined;
  const series = build((model) => {
    captured = model;
  });
  const formatter = series.tooltip?.formatter;
  if (typeof formatter !== 'function') {
    throw new Error('expected a tooltip formatter function');
  }
  (formatter as (p: unknown) => unknown)(param);
  if (captured == null) {
    throw new Error('tooltip formatter did not emit a model');
  }
  return captured;
}

// Flatten a model to a searchable string (header + each row's label/value).
const tooltipText = (model: TooltipModel) =>
  [model.header?.label, model.header?.value, ...model.rows.flatMap((row) => [row.label, row.value])].join(' ');

// total > render (a deeper child) and an io sibling, so we can assert both the
// top-level coloring and that deeper nodes stay uncolored.
const data: HierarchyData = {
  roots: [
    { name: 'total', value: 100, self: 10, children: [{ name: 'render', value: 60 }] },
    { name: 'io', value: 30 },
  ],
};

const fixedColorOverride = (name: string, color: string): FieldConfigSource => ({
  defaults: {},
  overrides: [
    {
      matcher: { id: 'byName', options: name },
      properties: [{ id: 'color', value: { mode: 'fixed', fixedColor: color } }],
    },
  ],
});

interface PlainNode {
  name: string;
  value?: number;
  self?: number;
  itemStyle?: { color?: string };
  children?: PlainNode[];
}

// Serialize the ECharts series data to plain objects so the tests can read our
// fields (name/itemStyle/children) without wrestling ECharts' data item types.
function nodesOf(series: { data?: unknown }): PlainNode[] {
  return JSON.parse(JSON.stringify(series.data ?? [])) as PlainNode[];
}

describe('getTreemapSeries top-level colors', () => {
  it('colors top-level nodes from the classic palette by position when no override is set', () => {
    const nodes = nodesOf(getTreemapSeries(data, ctx(noOverrides)));

    expect(nodes.find((node) => node.name === 'total')?.itemStyle?.color).toBe(getPaletteColorByIndex(0, theme));
    expect(nodes.find((node) => node.name === 'io')?.itemStyle?.color).toBe(getPaletteColorByIndex(1, theme));
  });

  it('applies a fixed-color override to the matching top-level node, keeping siblings on the palette', () => {
    const nodes = nodesOf(getTreemapSeries(data, ctx(fixedColorOverride('total', '#123456'))));

    expect(nodes.find((node) => node.name === 'total')?.itemStyle?.color).toBe('#123456');
    // The non-overridden sibling keeps its palette color, keyed by original position.
    expect(nodes.find((node) => node.name === 'io')?.itemStyle?.color).toBe(getPaletteColorByIndex(1, theme));
  });

  it('does not color deeper nodes (they inherit ECharts derived shades)', () => {
    const nodes = nodesOf(getTreemapSeries(data, ctx(noOverrides)));

    const total = nodes.find((node) => node.name === 'total');
    expect(total?.children?.[0].name).toBe('render');
    expect(total?.children?.[0].itemStyle).toBeUndefined();
  });
});

describe('getTreemapSeries by-value color scheme', () => {
  it('colors every node from its value (not the classic palette) when the field is by-value', () => {
    const nodes = nodesOf(getTreemapSeries(data, ctx(noOverrides, TooltipDisplayMode.Single, byValueField())));

    const total = nodes.find((node) => node.name === 'total');
    const io = nodes.find((node) => node.name === 'io');
    const render = total?.children?.[0];

    // The configured scheme applies instead of the classic palette ...
    expect(total?.itemStyle?.color).not.toBe(getPaletteColorByIndex(0, theme));
    // ... deeper nodes are colored too (unlike the classic default) ...
    expect(render?.name).toBe('render');
    expect(render?.itemStyle?.color).toBeDefined();
    // ... and different values map to different colors.
    expect(total?.itemStyle?.color).not.toBe(io?.itemStyle?.color);
  });

  it('lets a fixed-color override win over the by-value scheme', () => {
    const nodes = nodesOf(
      getTreemapSeries(data, ctx(fixedColorOverride('total', '#123456'), TooltipDisplayMode.Single, byValueField()))
    );

    expect(nodes.find((node) => node.name === 'total')?.itemStyle?.color).toBe('#123456');
  });
});

describe('getSunburstSeries top-level colors', () => {
  it('applies a fixed-color override to the matching top-level node', () => {
    const nodes = nodesOf(getSunburstSeries(data, ctx(fixedColorOverride('io', '#abcdef'))));

    expect(nodes.find((node) => node.name === 'io')?.itemStyle?.color).toBe('#abcdef');
    expect(nodes.find((node) => node.name === 'total')?.itemStyle?.color).toBe(getPaletteColorByIndex(0, theme));
  });
});

describe('hierarchy tooltip modes', () => {
  it('Single: shows the hovered node name, its value, and self', () => {
    const model = captureTooltip(
      (sink) => getTreemapSeries(data, ctx(noOverrides, TooltipDisplayMode.Single, undefined, sink)),
      {
        name: 'total',
        color: '#abcdef',
        data: { name: 'total', value: 100, self: 10 },
      }
    );

    const text = tooltipText(model);
    expect(model.header).toEqual({ label: 'total', value: '' });
    expect(text).toContain('Value');
    expect(text).toContain('100');
    expect(text).toContain('Self');
    expect(text).toContain('10');
  });

  // TODO: unskip once `buildHierarchyTooltipModel` implements "All" (Multi) mode.
  // The formatter currently ignores `ctx.options.tooltip.mode` and only renders
  // the hovered node; these assert the intended behavior of listing every
  // top-level node (see the doc comment on `buildHierarchyTooltipModel`).
  it.skip('All: lists every top-level node with its value, regardless of the hovered node', () => {
    // Hover a deep node; "All" mode still summarizes the top-level nodes.
    const model = captureTooltip(
      (sink) => getTreemapSeries(data, ctx(noOverrides, TooltipDisplayMode.Multi, undefined, sink)),
      { name: 'render', data: { name: 'render', value: 60 } }
    );

    const text = tooltipText(model);
    expect(text).toContain('total');
    expect(text).toContain('100');
    expect(text).toContain('io');
    expect(text).toContain('30');
  });

  // TODO: unskip once `buildHierarchyTooltipModel` implements "All" (Multi) mode (see above).
  it.skip('All: sunburst also lists every top-level node', () => {
    const model = captureTooltip(
      (sink) => getSunburstSeries(data, ctx(noOverrides, TooltipDisplayMode.Multi, undefined, sink)),
      {}
    );

    const text = tooltipText(model);
    expect(text).toContain('total');
    expect(text).toContain('io');
  });
});
