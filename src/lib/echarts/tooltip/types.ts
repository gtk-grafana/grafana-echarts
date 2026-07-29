import { type Field, type GrafanaTheme2, type ValueFormatter } from '@grafana/data';
import { type VizTooltipOptions } from '@grafana/schema';
import { type TooltipOption } from 'echarts/types/dist/shared';

/**
 * ECharts tooltip trigger: cartesian time series share an x axis; pie/radar hover per item.
 * https://echarts.apache.org/en/option.html#tooltip.trigger
 */
export type EChartsTooltipTrigger = TooltipOption['trigger'];

/**
 * The React-free tooltip content model. Chart formatters convert the hovered
 * ECharts `params` into one of these and hand it to the React overlay
 * (`EChartsTooltip`), which renders it with `@grafana/ui`'s `VizTooltip`. Nothing
 * in the tooltip layer touches the DOM or React — it is pure data derivation, so
 * it stays testable and keeps the ECharts option layer isolated from the React
 * tooltip (see `lib/components/tooltip`).
 *
 * ## Coverage by chart family
 *
 * Every family feeds the React overlay, via one of two routes: the generic
 * `buildTooltipModel` (cartesian, radar) or a per-series `formatter` the family
 * attaches itself (pie, hierarchy, both heatmaps). The remaining differences are
 * in what each family can populate, not in whether it works:
 *
 * | Family                 | swatch | footer (`source`) | notes                                  |
 * |------------------------|--------|-------------------|----------------------------------------|
 * | Cartesian single-value | yes    | yes               | reference implementation               |
 * | Candlestick / boxplot  | yes    | yes (per row)     | one row per packed dimension           |
 * | Pie                    | yes    | yes               | only family setting `emphasis` itself  |
 * | Radar                  | yes    | yes               | one row per hovered polygon            |
 * | Hierarchy              | yes    | yes               | rows are `Value` / `Self`              |
 * | Heatmap (both layouts) | yes    | yes               | rows are `Value` / `Name`              |
 *
 * A footer needs a `Field` + row to read data links and ad-hoc filters from, and
 * every family supplies one: heatmap cells and hierarchy nodes each carry the row
 * they were built from, and a multi-value (candlestick/boxplot) item resolves one
 * field *per packed dimension*, so its rows carry a source each and the overlay
 * unions their links.
 */
export interface TooltipModel {
  /**
   * Header row, composed like core Grafana's panel tooltips (`VizTooltipItem`):
   * time-axis charts put the formatted time in `value` with an empty `label`
   * (matching `TimeSeriesTooltip`), while item charts (pie/hierarchy) put the
   * item name in `label`.
   */
  header: TooltipHeaderItem;
  rows: TooltipRow[];
  /**
   * Source field + row of the single hovered item (present only when one item is
   * focused, i.e. Single mode / a single hovered slice). The React footer reads
   * data links and label-based ad-hoc filters from it. Kept as raw `Field`/row so
   * the ECharts layer stays free of `@grafana/ui` (the footer resolves links
   * there instead). In multi-row ("All") tooltips this is unset; each row carries
   * its own `source` and the overlay picks the clicked row's (see {@link TooltipRow}).
   * Also unset for families with no clean item→field mapping (heatmap cells,
   * hierarchy nodes), which render no footer.
   */
  source?: TooltipSource;
}

/**
 * Header label/value pair. Mirrors the `VizTooltipItem` core panels feed
 * `VizTooltipHeader`; declared locally because that type is `@grafana/ui` and
 * this layer stays free of it.
 */
export interface TooltipHeaderItem {
  label: string;
  value: string;
}

/** The hovered item's source field and its row index within that field's values. */
export interface TooltipSource {
  field: Field;
  rowIndex: number;
}

/**
 * A single series/value line rendered inside the tooltip. The `VizTooltipItem`
 * equivalent lives in `@grafana/ui`; see {@link TooltipHeaderItem} for why this
 * is local.
 */
export interface TooltipRow {
  /** CSS color for the leading swatch; omitted rows render no swatch. */
  color?: string;
  label: string;
  value: string;
  /** Render the row highlighted (e.g. the hovered slice in a pie "All" tooltip). */
  emphasis?: boolean;
  /** ECharts series index of the row's item; lets the overlay match a clicked element to its row. */
  seriesIndex?: number;
  /** The row's source field + row index, for the pinned footer (data links / ad-hoc filters). */
  source?: TooltipSource;
}

/**
 * Resolve the source {@link TooltipSource} for a hovered tooltip item so the
 * footer can surface data links and ad-hoc filters. Chart families key the item
 * by `seriesIndex` and/or `dataIndex`; families with no clean field mapping
 * (multi-value cartesian, heatmap cells, hierarchy nodes) omit the resolver.
 */
export type TooltipFieldResolver = (item: {
  seriesIndex?: number;
  dataIndex?: number;
  /**
   * Which packed dimension of a multi-value item is being resolved (candlestick
   * `[Open, Close, Low, High]`, boxplot `[Min, Q1, Median, Q3, Max]`). Each maps
   * to its own source field, so the resolver needs it to pick the right one.
   */
  dimensionIndex?: number;
}) => TooltipSource | undefined;

/**
 * Resolve the value formatter for a single hovered tooltip item. Chart families
 * lay out series differently (one series per field vs. one series with per-field
 * data items), so each supplies its own resolver keyed by `seriesIndex` and/or
 * `dataIndex`. This is what lets tooltips honor per-field unit/decimals overrides
 * instead of formatting every row with one shared formatter.
 */
export type TooltipValueFormatterResolver = (item: { seriesIndex?: number; dataIndex?: number }) => ValueFormatter;

/**
 * Receives the latest tooltip content on each hover. Supplied by the React layer
 * (`useEChartsTooltip`) and threaded into the option builders so the ECharts
 * `formatter` can push content to React instead of rendering DOM itself.
 */
export type TooltipSink = (model: TooltipModel) => void;

/**
 * The "All"-mode tooltip options shared with Grafana's common tooltip: hide rows
 * whose value is exactly zero, and order rows by value. Both only apply in Multi
 * mode, mirroring `commonOptionsBuilder.addTooltipOptions` — which is why they are
 * picked off the panel's own `VizTooltipOptions` rather than restated.
 */
export type TooltipRowOptions = Partial<Pick<VizTooltipOptions, 'sort' | 'hideZeros'>>;

/** Optional behaviors for `buildTooltipModel`, supplied by the panel option layer. */
export interface TooltipModelOptions {
  /** Multi-mode row shaping (hide zeros / sort); see {@link TooltipRowOptions}. */
  rowOptions?: TooltipRowOptions;
  /**
   * Maps an item to its source field for the footer; see
   * {@link TooltipFieldResolver}. Omitted by families with no clean item→field
   * mapping, which render no footer.
   */
  resolveField?: TooltipFieldResolver;
  /**
   * Formats the hovered x value for the header (e.g. Grafana time formatting on
   * time axes, where item-trigger params carry the raw `[time, value]` tuple).
   */
  formatHeaderValue?: (item: { value?: unknown; name?: string }) => string | undefined;
  /**
   * Labels for the dimensions a multi-value series packs into a single item, in
   * the series' own data order — `[Open, Close, Low, High]` for candlestick,
   * `[Min, Q1, Median, Q3, Max]` for boxplot.
   *
   * When set, each hovered item expands into one row per dimension instead of
   * the single value row. Without it only the *last* dimension would surface
   * (`unwrapTooltipValue` takes the final element), which reads as a lone "High"
   * or "Max" with no indication the rest exist.
   */
  multiValueDimensions?: string[];
}

/**
 * ECharts tree data item shared by the treemap and sunburst series (both accept
 * `{ name, value, children, itemStyle }`). `self` and `sourceRowIndex` are
 * carried through as extra fields so the tooltip can surface them; ECharts
 * preserves unknown data props.
 */
export interface HierarchyTreeItem {
  name: string;
  value?: number;
  self?: number;
  itemStyle?: { color: string };
  children?: HierarchyTreeItem[];
  /** Source row (see `HierarchyNode.sourceRowIndex`) for footer data links. */
  sourceRowIndex?: number;
}

/**
 * Formatting context the hierarchy tooltip reads. Narrower than the series
 * context that supplies it (`HierarchySeriesContext`), which keeps the tooltip
 * layer from importing the option layer back.
 */
export interface HierarchyTooltipContext {
  formatValue: ValueFormatter;
  /** The numeric field sizing the nodes; the footer resolves its data links. */
  valueField?: Field;
}

/**
 * A relations (`graph`) node data item. ECharts preserves unknown data props, so
 * the extra fields ride along for the tooltip to read back off `params.data`.
 * https://echarts.apache.org/en/option.html#series-graph.data
 */
export interface RelationsNodeItem {
  id: string;
  name: string;
  value?: number;
  symbolSize?: number;
  itemStyle?: { color?: string; borderColor?: string; borderWidth?: number };
  x?: number;
  y?: number;
  /** `subtitle`, surfaced as a tooltip row. */
  subtitle?: string;
  /** `secondarystat`, tooltip only; may be a string per the frame spec. */
  secondary?: number | string;
  /** Source row in the nodes frame, for footer data links. Unset on derived nodes. */
  sourceRowIndex?: number;
}

/**
 * A relations (`graph`) link data item.
 * https://echarts.apache.org/en/option.html#series-graph.links
 */
export interface RelationsLinkItem {
  source: string;
  target: string;
  value?: number;
  lineStyle?: { color?: string; width?: number; type?: 'solid' | 'dashed' | 'dotted'; curveness?: number };
  /** Source row in the edges frame, for footer data links. */
  sourceRowIndex?: number;
}

/**
 * Formatting context the relations tooltip reads. Mirrors
 * {@link HierarchyTooltipContext}: narrower than the series context that supplies
 * it, so the tooltip layer never imports the option layer back.
 */
export interface RelationsTooltipContext {
  formatValue: ValueFormatter;
  /** The numeric `mainstat` field; the footer resolves its data links. */
  valueField?: Field;
  /** The edges frame's `mainstat`, for a hovered link's footer. */
  linkValueField?: Field;
}

/** Theme + formatting context the binned heatmap tooltip needs to match Grafana. */
export interface BinnedHeatmapTooltipContext {
  theme: GrafanaTheme2;
  timeZone: string;
  formatValue: ValueFormatter;
  /** Receives the hovered cell's content model; rendered by the React overlay. */
  tooltipSink?: TooltipSink;
}
