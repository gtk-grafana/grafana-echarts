import { type ChordSeriesOption } from 'echarts';
import {
  CHORD_CLOCKWISE_DEFAULT,
  CHORD_LINK_OPACITY_DEFAULT,
  CHORD_MIN_ANGLE_DEFAULT,
  CHORD_PAD_ANGLE_DEFAULT,
  CHORD_START_ANGLE_DEFAULT,
} from 'editor/chord';
import { type NodeGraphData, type RelationLink, type RelationNode } from 'lib/echarts/converters/relationsModel';
import {
  getRelationsNodeLabelFormatter,
  RELATIONS_LINK_COLOR_DEFAULT,
  RELATIONS_SHOW_NODE_LABELS_DEFAULT,
  type RelationsSeriesContext,
} from 'lib/echarts/options/graph';
import { seriesTooltip } from 'lib/echarts/tooltip/option';
import { buildRelationsTooltipModel } from 'lib/echarts/tooltip/relations';
import { type RelationsLinkItem, type RelationsNodeItem } from 'lib/echarts/tooltip/types';
import { type PanelOptions } from 'types';

/**
 * Chord render variant of the relations family: the same `{ nodes, links }` model,
 * laid out as a ring of node arcs joined by weighted ribbons.
 *
 * The **simplest** of the three variants to feed — it pins `coordinateSystem: 'none'`,
 * self-layouts, and has no DAG restriction, so a cyclic service graph goes straight
 * through with no converter work at all (contrast the sankey path, which must break
 * cycles first). What it does need is care with defaults: `series.chord` is new in
 * ECharts 6.0.0 and several of its defaults disagree with the other two variants.
 *
 * https://echarts.apache.org/en/option.html#series-chord
 */

/**
 * Chord-specific Advanced-gated options at their defaults, merged into the relations
 * family's reset in `applyEditorModeDefaults` so Default editor mode clears them.
 * See `docs/options-modes.md`.
 */
export const ADVANCED_CHORD_DEFAULTS: Partial<PanelOptions> = {
  relationsChordStartAngle: undefined,
  relationsChordClockwise: undefined,
  relationsChordPadAngle: undefined,
  relationsChordMinAngle: undefined,
  relationsChordLinkOpacity: undefined,
};

/**
 * Node label config. On by default.
 *
 * **`formatter` is a correction, not an option** — and a more necessary one than the
 * sankey's. `ChordPiece` passes `defaultText: node.dataIndex + ''`, so an unformatted
 * chord labels its nodes with their raw numeric index ("0", "1", "2"). It does fall
 * back to `itemModel.get('name')` as a *formatter string*, which happens to render the
 * name — but only because a plain name contains no `{...}` placeholders, so a node
 * legitimately named `{svc}` would be interpreted as a template. `'{b}'` is the data
 * name (`getDataParams` sets `params.name = nodeData.getName(dataIndex)`), which is
 * both correct and robust.
 *
 * `position: 'outside'` is ECharts' own chord default and is left alone.
 * https://echarts.apache.org/en/option.html#series-chord.label
 */
export function getChordLabel(ctx: RelationsSeriesContext): ChordSeriesOption['label'] {
  const show = ctx.options.relationsShowNodeLabels ?? RELATIONS_SHOW_NODE_LABELS_DEFAULT;
  if (!show) {
    return { show: false };
  }
  return {
    show: true,
    // With "Show node values" on, the shared formatter emits the name *and* the
    // stat, replacing the `'{b}'` correction below (it reads `params.name`, which
    // is what `'{b}'` resolves to — so the index-labelling bug stays fixed).
    formatter: getRelationsNodeLabelFormatter(ctx) ?? '{b}',
    color: ctx.theme.colors.text.primary,
    fontFamily: ctx.theme.typography.fontFamily,
  };
}

/**
 * Ribbon styling. `ChordEdge` implements all three colour keywords itself, so the mode
 * passes straight through; the key is omitted only when it already matches ECharts'
 * own chord default (`'source'`), which keeps the emitted option minimal. `opacity` is
 * omitted at ECharts' 0.2.
 * https://echarts.apache.org/en/option.html#series-chord.lineStyle
 */
/** ECharts' own `series-chord.lineStyle.color` default (`ChordSeries.ts`). */
const CHORD_LINK_COLOR_ECHARTS_DEFAULT = 'source';

export function getChordLinkStyle(options: PanelOptions): ChordSeriesOption['lineStyle'] | undefined {
  const lineStyle: NonNullable<ChordSeriesOption['lineStyle']> = {};
  const color = options.relationsLinkColor ?? RELATIONS_LINK_COLOR_DEFAULT;
  if (color !== CHORD_LINK_COLOR_ECHARTS_DEFAULT) {
    lineStyle.color = color;
  }
  if (options.relationsChordLinkOpacity != null && options.relationsChordLinkOpacity !== CHORD_LINK_OPACITY_DEFAULT) {
    lineStyle.opacity = options.relationsChordLinkOpacity;
  }
  return Object.keys(lineStyle).length > 0 ? lineStyle : undefined;
}

/**
 * Hover emphasis — the one chord option that is **always emitted**.
 *
 * ECharts defaults a chord to `emphasis.focus: 'adjacency'`, where `graph` and
 * `sankey` default to no focus. Omitting the key would leave adjacency highlighting
 * active while the shared "Highlight adjacency" switch reads off, so the control would
 * be lying about what the chart does. It is pinned to `'none'` when the switch is off
 * instead, which keeps the family consistent and the control honest — at the cost of
 * an out-of-box chord that differs from ECharts' own examples.
 * https://echarts.apache.org/en/option.html#series-chord.emphasis
 */
export function getChordEmphasis(options: PanelOptions): NonNullable<ChordSeriesOption['emphasis']> {
  return { focus: options.relationsFocusAdjacency === true ? 'adjacency' : 'none' };
}

/**
 * Map the model's nodes to ECharts chord data items.
 *
 * As narrow as the sankey mapping, and for the same reasons: a chord node is an arc
 * sized by its flow, so `noderadius` and `fixedx`/`fixedy` have nothing to apply to,
 * and **`value` is omitted** — `chordLayout` takes
 * `Math.max(declaredValue, edgeSum)`, so a `mainstat` unrelated to the flow would
 * widen the arc out of step with its own ribbons. The stat rides as `stat` for the
 * tooltip. See `RelationsNodeItem`.
 */
function toChordNodeItems(nodes: RelationNode[]): RelationsNodeItem[] {
  return nodes.map((node) => {
    const item: RelationsNodeItem = { id: node.id, name: node.name };
    if (node.value != null) {
      item.stat = node.value;
    }
    if (node.color != null) {
      item.itemStyle = { color: node.color };
    }
    if (node.subtitle != null) {
      item.subtitle = node.subtitle;
    }
    if (node.secondary != null) {
      item.secondary = node.secondary;
    }
    if (node.sourceRowIndex != null) {
      item.sourceRowIndex = node.sourceRowIndex;
    }
    return item;
  });
}

/**
 * Map the model's links to ECharts chord link items.
 *
 * `value` drives ribbon width, as it does for sankey. Per-edge `thickness` and
 * `custom.lineType` are dropped for the same reasons: ribbon size comes from the
 * weight, and a filled ribbon has no stroke to dash. A per-edge `color` is kept.
 *
 * Self-loops are **not** dropped and cycles are **not** broken — a chord renders both
 * happily, which is the main reason to reach for it over a sankey on service-graph
 * data.
 */
function toChordLinkItems(links: RelationLink[]): RelationsLinkItem[] {
  return links.map((link) => {
    const item: RelationsLinkItem = { source: link.source, target: link.target };
    if (link.value != null) {
      item.value = link.value;
    }
    if (link.color != null) {
      item.lineStyle = { color: link.color };
    }
    if (link.sourceRowIndex != null) {
      item.sourceRowIndex = link.sourceRowIndex;
    }
    return item;
  });
}

/**
 * Chord series: a ring of node arcs joined by weighted ribbons. Takes the node/link
 * model unchanged — no cycle policy, no reshaping. `zlevel` places the series on its
 * own canvas layer (see the panel's `zLevel.series`), matching the other families.
 * https://echarts.apache.org/en/option.html#series-chord
 */
export function getChordSeries(data: NodeGraphData, ctx: RelationsSeriesContext): ChordSeriesOption {
  const { relationsChordStartAngle, relationsChordClockwise, relationsChordPadAngle, relationsChordMinAngle } =
    ctx.options;
  const lineStyle = getChordLinkStyle(ctx.options);

  // @todo clean this up
  return {
    type: 'chord',
    ...(relationsChordStartAngle != null && relationsChordStartAngle !== CHORD_START_ANGLE_DEFAULT
      ? { startAngle: relationsChordStartAngle }
      : {}),
    ...(relationsChordClockwise != null && relationsChordClockwise !== CHORD_CLOCKWISE_DEFAULT
      ? { clockwise: relationsChordClockwise }
      : {}),
    ...(relationsChordPadAngle != null && relationsChordPadAngle !== CHORD_PAD_ANGLE_DEFAULT
      ? { padAngle: relationsChordPadAngle }
      : {}),
    ...(relationsChordMinAngle != null && relationsChordMinAngle !== CHORD_MIN_ANGLE_DEFAULT
      ? { minAngle: relationsChordMinAngle }
      : {}),
    ...(lineStyle ? { lineStyle } : {}),
    // Always emitted — ECharts' chord default is `'adjacency'`, so omitting would
    // contradict the switch. See `getChordEmphasis`.
    emphasis: getChordEmphasis(ctx.options),
    // Chord has no `draggable`; `roam` comes from `RoamOptionMixin` and is emitted for
    // consistency with the other two variants.
    roam: ctx.options.relationsRoam === true,
    label: getChordLabel(ctx),
    zlevel: ctx.options.zLevel?.series,
    data: toChordNodeItems(data.nodes),
    links: toChordLinkItems(data.links),
    tooltip: seriesTooltip(
      buildRelationsTooltipModel({
        formatValue: ctx.formatValue,
        valueField: ctx.valueField,
        linkValueField: ctx.linkValueField,
      }),
      ctx.tooltipSink
    ),
  };
}
