import { type GraphSeriesOption } from 'echarts';
import { type CallbackDataParams, type LabelLayoutOptionCallback } from 'echarts/types/dist/shared';
import {
  RELATIONS_HIDE_OVERLAPPING_LABELS_DEFAULT,
  RELATIONS_LABEL_OVERFLOW_DEFAULT,
  RELATIONS_LABEL_WIDTH_DEFAULT,
  RELATIONS_SHOW_EDGE_VALUES_DEFAULT,
  RELATIONS_SHOW_NODE_LABELS_DEFAULT,
  RELATIONS_SHOW_NODE_VALUES_DEFAULT,
} from 'editor/relations/constants';
import { type RelationsSeriesContext } from 'lib/echarts/relations/context';
import { formatDerivedMarkValue } from 'lib/echarts/relations/tooltip/tooltip';
import { formatEChartsValue } from 'lib/echarts/style';
import { type PanelOptions } from 'types';

/**
 * Every label the graph draws — node names, node values, edge values — and the
 * label-layout arbitration that decides which of them survive an overlap.
 *
 * The formatters read a mark's own display processor out of {@link RelationsSeriesContext}
 * so a node formats with its own unit and decimals rather than the panel's.
 */

/**
 * The node label's `formatter`, shared by all three render variants so a node
 * labels identically however it is drawn.
 *
 * Returns `undefined` when "Show node values" is off, letting each variant keep
 * the formatter it needs for the *name* alone (`'{b}'` for sankey and chord,
 * nothing for graph — see `getSankeyLabel` / `getChordLabel`).
 *
 * When on, the stat goes on a second line, formatted through the **node's own**
 * field — the same lookup the tooltip uses, so a label and the tooltip it belongs
 * to cannot print the same number in two different units. It is read off the item
 * rather than from `params.value` because the three variants carry it differently:
 * `graph` sets `value`, while `sankey` and `chord` leave `value` to ECharts' own
 * flow computation and ride the stat as `stat`. That is the same `stat ?? value`
 * precedence the tooltip uses. A node with no stat keeps a one-line label rather
 * than gaining a blank one.
 * https://echarts.apache.org/en/option.html#series-graph.label.formatter
 */
export function getRelationsNodeLabelFormatter(
  ctx: RelationsSeriesContext
): ((params: CallbackDataParams) => string) | undefined {
  if ((ctx.options.relationsShowNodeValues ?? RELATIONS_SHOW_NODE_VALUES_DEFAULT) !== true) {
    return undefined;
  }
  return (params) => {
    const name = String(params.name ?? '');
    const stat = readNodeStat(params.data);
    if (stat == null) {
      return name;
    }
    const id = readNodeId(params.data);
    // A derived node has no field, so it formats as a plain count — the same fallback
    // the tooltip uses, for the same reason. See `formatDerivedMarkValue`.
    const formatValue = (id != null ? ctx.marks?.nodes.get(id)?.formatValue : undefined) ?? formatDerivedMarkValue;
    return `${name}\n${formatEChartsValue(stat, formatValue)}`;
  };
}

/**
 * The stat carried on a relations node item, whichever key the variant used.
 * `params.data` is typed as the loose `OptionDataItem`, so this narrows structurally
 * rather than asserting the item shape back.
 */
function readNodeStat(data: CallbackDataParams['data']): number | string | undefined {
  if (typeof data !== 'object' || data === null) {
    return undefined;
  }
  const stat: unknown = 'stat' in data ? data.stat : undefined;
  const value: unknown = 'value' in data ? data.value : undefined;
  const raw = stat ?? value;
  return typeof raw === 'number' || typeof raw === 'string' ? raw : undefined;
}

/** The node's mark key (its field name); narrowed structurally, as above. */
function readNodeId(data: CallbackDataParams['data']): string | undefined {
  if (typeof data !== 'object' || data === null || !('id' in data)) {
    return undefined;
  }
  const id: unknown = data.id;
  return typeof id === 'string' ? id : undefined;
}

/**
 * The theme font/colour every relations label carries, plus the two legibility keys
 * that keep a long name from running into its neighbour.
 *
 * Typed as a plain shape rather than as one variant's label option because all three
 * variants and the edge label share it, and ECharts types those four differently — a
 * sankey `edgeLabel` allows only `position: 'inside'`, a graph one takes the line
 * positions. Everything here is common to all four.
 */
export interface RelationsLabelStyle {
  color: string;
  fontFamily: string;
  /** Never `'none'`: that is ECharts' own default, so it is written as no key at all. */
  overflow?: 'truncate' | 'break' | 'breakAll';
  width?: number;
}

/**
 * Theme font/colour plus overflow handling, shared by all three variants so one node
 * reads the same however it is drawn. Each variant adds its own `position` and
 * `formatter` around it.
 * https://echarts.apache.org/en/option.html#series-graph.label
 */
export function getRelationsLabelStyle(ctx: RelationsSeriesContext): RelationsLabelStyle {
  const overflow = ctx.options.relationsLabelOverflow ?? RELATIONS_LABEL_OVERFLOW_DEFAULT;
  return {
    color: ctx.theme.colors.text.primary,
    fontFamily: ctx.theme.typography.fontFamily,
    // `'none'` is ECharts' own default, so it is treated as "write no key" — the same
    // reading `getThemedLabelStyle` gives it. `width` rides along with it, since
    // ECharts ignores `overflow` without one.
    ...(overflow !== 'none'
      ? { overflow, width: ctx.options.relationsLabelWidth ?? RELATIONS_LABEL_WIDTH_DEFAULT }
      : {}),
  };
}

/**
 * Drop a label that would collide with one already placed, via ECharts' shared
 * label-layout stage — which every one of the three variants routes its labels
 * through, so this is the family's single answer to overlapping labels.
 *
 * **The callback form, and only so `dataType` can be read.** A graph edge's label is held
 * back from `hideOverlap` here and arbitrated by `registerEdgeLabelLayout` instead, on two
 * counts the stage gets wrong for a label whose *host* positions it:
 *
 * - it is measured before the link geometry has settled, which makes the render depend on
 *   how many times the panel has drawn — the first pass hides nearly all of them and each
 *   later pass lets one more through, measured as 1, 2, 3, then all 4 edge values over four
 *   renders of an unchanged four-edge fixture ("every refresh draws more edge values"). A
 *   node's own position is settled by the time it is measured, so node labels do not drift;
 * - it would outrank the node labels rather than yield to them, since the stage orders by
 *   the area of the label's host and a link's host spans the whole link.
 *
 * So this returns "no layout for this label" for an edge — an empty option, which is how a
 * callback says that, since `LabelManager.layout` filters on the resolved `hideOverlap` per
 * label. What replaces it is not "nothing": see `registerEdgeLabelLayout`.
 *
 * Returns `undefined` when off: `LabelManager.addLabelsOfSeries` skips a series whose
 * `labelLayout` has no keys, so an empty object would be the same as omitting it, and
 * omitting it is clearer. That is also the switch the edge arbitration reads, since a
 * series with no `labelLayout` never reaches the stage at all.
 * https://echarts.apache.org/en/option.html#series-graph.labelLayout
 */
export function getRelationsLabelLayout(options: PanelOptions): LabelLayoutOptionCallback | undefined {
  const hide = options.relationsHideOverlappingLabels ?? RELATIONS_HIDE_OVERLAPPING_LABELS_DEFAULT;
  if (!hide) {
    return undefined;
  }
  // An empty option for an edge is how a callback says "no layout for this label";
  // `LabelManager.layout` filters on the resolved `hideOverlap` per label.
  return (params) => (params.dataType === 'edge' ? {} : { hideOverlap: true });
}

/**
 * Node label config. On by default; the label sits below the node.
 * https://echarts.apache.org/en/option.html#series-graph.label
 */
export function getGraphLabel(ctx: RelationsSeriesContext): GraphSeriesOption['label'] {
  const show = ctx.options.relationsShowNodeLabels ?? RELATIONS_SHOW_NODE_LABELS_DEFAULT;
  if (!show) {
    return { show: false };
  }
  const formatter = getRelationsNodeLabelFormatter(ctx);
  return {
    show: true,
    position: 'bottom',
    // Omitted unless values are shown: `Symbol.js` labels a graph node from
    // `data.getName(idx)`, which is already the name.
    ...(formatter ? { formatter } : {}),
    ...getRelationsLabelStyle(ctx),
  };
}

/**
 * The edge-label shape both variants that can draw one accept — deliberately without a
 * `position`, since the graph and sankey types disagree on what may go there.
 */
export interface RelationsEdgeLabel extends RelationsLabelStyle {
  show: true;
  formatter: (params: CallbackDataParams) => string;
}

/**
 * Each edge's own weight, drawn on the link. Off by default, so the key is omitted
 * and ECharts' `show: false` stands.
 *
 * Formatted through the **edge's own** field, for the same reason the node label is:
 * two edges can carry different units, and the number drawn on a link must agree with
 * the one its tooltip reports. A `graph` edge label reads `params.value`; the
 * `markId` on the item is what finds the field (see `toLinkItems`).
 *
 * Chord is excluded at the editor rather than here: `ChordEdge` creates no text
 * element at all, so the key would be inert there.
 * https://echarts.apache.org/en/option.html#series-graph.edgeLabel
 */
export function getRelationsEdgeLabel(ctx: RelationsSeriesContext): RelationsEdgeLabel | undefined {
  if ((ctx.options.relationsShowEdgeValues ?? RELATIONS_SHOW_EDGE_VALUES_DEFAULT) !== true) {
    return undefined;
  }
  return {
    show: true,
    formatter: (params: CallbackDataParams) => {
      const value = readEdgeValue(params.data);
      if (value == null) {
        return '';
      }
      const markId = readEdgeMarkId(params.data);
      const formatValue = (markId != null ? ctx.marks?.links.get(markId)?.formatValue : undefined) ?? undefined;
      return formatEChartsValue(value, formatValue ?? ctx.formatValue);
    },
    ...getRelationsLabelStyle(ctx),
  };
}

/** The weight carried on a relations link item; narrowed structurally, as above. */
function readEdgeValue(data: CallbackDataParams['data']): number | string | undefined {
  if (typeof data !== 'object' || data === null || !('value' in data)) {
    return undefined;
  }
  const value: unknown = data.value;
  return typeof value === 'number' || typeof value === 'string' ? value : undefined;
}

/** The edge's tooltip lookup key (`markKey ?? id`); narrowed structurally, as above. */
function readEdgeMarkId(data: CallbackDataParams['data']): string | undefined {
  if (typeof data !== 'object' || data === null || !('markId' in data)) {
    return undefined;
  }
  const markId: unknown = data.markId;
  return typeof markId === 'string' ? markId : undefined;
}
