import { type Field, type GrafanaTheme2, type ValueFormatter } from '@grafana/data';
import { type VizTooltipOptions } from '@grafana/schema';
import { type LinearGradientObject, type TooltipOption } from 'echarts/types/dist/shared';

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
  /**
   * The node's field name, which is both ECharts' graph key (links resolve against
   * it) and the mark key the tooltip looks the node's own field up by — see
   * {@link RelationsMarks}. A node *derived* from an edge's endpoints has no field,
   * so its id matches nothing and the tooltip falls back to the panel formatter.
   */
  id: string;
  name: string;
  value?: number;
  /**
   * The node's `mainstat`, when it is carried *outside* `value`.
   *
   * The sankey variant does not set `value`: ECharts derives a sankey node's height
   * from its flow, but `computeNodeValues` takes
   * `Math.max(inSum, outSum, nodeRawValue)` — so a declared `value` acts as a floor
   * and a `mainstat` unrelated to the flow (a latency, an error rate) would inflate
   * the node out of step with its own ribbons. The stat rides here instead, for the
   * tooltip only. `graph` keeps using `value`, which it reads for tooltips and
   * `visualMap` but never for geometry.
   */
  stat?: number | null;
  symbolSize?: number;
  itemStyle?: { color?: string; borderColor?: string; borderWidth?: number };
  x?: number;
  y?: number;
  /** `custom.subtitle`, surfaced as a tooltip row. */
  subtitle?: string;
  /** The secondary stat, tooltip only; already a display string when reduced. */
  secondary?: number | string;
}

/**
 * A relations (`graph`) link data item.
 * https://echarts.apache.org/en/option.html#series-graph.links
 */
export interface RelationsLinkItem {
  source: string;
  target: string;
  /**
   * The edge's field name, so the tooltip can find the edge's own field — the
   * endpoints cannot, since two parallel edges share them.
   *
   * Deliberately **not** `id`, which ECharts already reads on a link:
   * `createGraphFromNodeEdge` uses `retrieve(link.id, source + ' > ' + target)` as
   * the edge's *name*, so setting it would rename every edge as a side effect of
   * carrying a lookup key. ECharts preserves unknown data props, so this rides
   * along untouched instead.
   */
  markId?: string;
  value?: number;
  lineStyle?: {
    /**
     * A colour, or a gradient between the two endpoints' colours. The gradient form
     * exists because ECharts' `graph` series implements only the `'source'` and
     * `'target'` keywords — see `makeEdgeGradientResolver`.
     */
    color?: string | LinearGradientObject;
    width?: number;
    type?: 'solid' | 'dashed' | 'dotted';
    curveness?: number;
  };
}

/**
 * One mark's own field, resolved once per render so a hover is a map lookup.
 *
 * A mark **is** a field under the graph contract, which is what makes this
 * possible: the hovered node or edge formats with its own unit and decimals and
 * surfaces its own `config.links`, rather than borrowing whichever field happened
 * to be first in the frame.
 */
export interface RelationsMark {
  /** This mark's own display processor (unit, decimals, "No value"). */
  formatValue: ValueFormatter;
  /** This mark's field + row, for the footer's data links and ad-hoc filters. */
  source: TooltipSource;
}

/**
 * Every mark that has a field, keyed by the mark key the ECharts item carries —
 * `id` for a node ({@link RelationsNodeItem}), `markId` for an edge
 * ({@link RelationsLinkItem}).
 *
 * Keyed rather than indexed on purpose. ECharts renumbers a graph's edges when it
 * drops one whose endpoint is missing (`createGraphFromNodeEdge` keeps only
 * `validEdges`), and the sankey variant removes links to break cycles, so a
 * `dataIndex` into the model would silently point at the wrong mark. A missing key
 * simply means "no field" — a node derived from an edge's endpoints — which renders
 * no footer and formats through `formatDerivedMarkValue`.
 *
 * Nodes and edges are separate maps because their names live in different frames
 * and can collide (a node `e1` and an edge `e1` are both legal).
 */
export interface RelationsMarks {
  nodes: ReadonlyMap<string, RelationsMark>;
  links: ReadonlyMap<string, RelationsMark>;
}

/**
 * The relations tooltip needs no context beyond {@link RelationsMarks} — no panel
 * formatter, unlike every other family. A mark either has a field, and formats
 * through it, or is a derived node whose value is a link count (see
 * `formatDerivedMarkValue`). That is why there is no `RelationsTooltipContext` here
 * to mirror {@link HierarchyTooltipContext}.
 */

/**
 * Formatting context the stream (single-axis) tooltip reads: the time zone for its
 * header, the panel formatter, and the theme it needs to build a per-layer
 * formatter from that layer's field. Narrower than the chart context that
 * supplies it, which keeps the tooltip layer from importing the option layer back.
 */
export interface StreamTooltipContext {
  theme: GrafanaTheme2;
  timeZone: string;
  formatValue: ValueFormatter;
}

/** Theme + formatting context the binned heatmap tooltip needs to match Grafana. */
export interface BinnedHeatmapTooltipContext {
  theme: GrafanaTheme2;
  timeZone: string;
  formatValue: ValueFormatter;
  /** Receives the hovered cell's content model; rendered by the React overlay. */
  tooltipSink?: TooltipSink;
}
