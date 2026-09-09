import { type Field } from '@grafana/data';
import { type GraphEndpointKeys } from 'lib/echarts/converters/graphWide';

/**
 * Chart-agnostic node/link model shared by the relations family's render variants
 * (`graph`, `sankey` and `chord` all read `option.data || option.nodes` plus
 * `option.edges || option.links`, so one model feeds all three).
 *
 * Built **only** from the field-based graph contract — one node is one field, one
 * edge is one field. See ../../../../data-plane/graph-wide.md for the contract and
 * `graphWide.ts` for the reader.
 *
 * Grafana's row-based `node-graph` frames are not read directly any more: they are
 * converted to the wide form *above* the panel by the transformation this plugin
 * registers (`legacyToWide.ts`, `modules/relations/dataTransformations.ts`), so that
 * every mark exists as a field before field overrides are applied. The row format
 * itself is still documented in ../../../../data-plane/graph-long.md, because it is
 * what the conversion reads.
 */

/**
 * One **extra** stat a mark reports, beyond the main one — a tooltip row and nothing else.
 *
 * `reduceOptions.calcs[0]` is the main stat and is structurally singular: it is the number
 * that sizes a node, colours it, and weighs an edge or a sankey ribbon, and a chart has one
 * geometry. Every reducer *after* the first has nowhere to go but the tooltip, so there is no
 * reason to cap how many there are — one row each. See `normalizeRelationsCalcs`.
 *
 * Carried as a `{calc, value}` pair rather than a bare list of strings so a row cannot be
 * labelled with the wrong reducer: a calc that reduces to nothing on one mark and to a number
 * on the next would otherwise shift every label after it by one.
 */
export interface MarkStat {
  /**
   * The reducer that produced it, so the tooltip can label the row with the reducer's own
   * display name. Unset for the legacy `secondarystat` column, which is a value the response
   * carried with no calculation behind it — see `secondaryStatsOf`.
   */
  calc?: string;
  /** Already a display string: formatted through the mark's **own** display processor. */
  value: string;
}

/** A single node. `value` is the main stat, which drives sizing/colour and the tooltip. */
export interface RelationNode {
  /** `field.name` — the node's identity, and therefore its override target. */
  id: string;
  /** Display name: `config.displayName` when present, else the `id`. */
  name: string;
  /** `config.custom.subtitle`. */
  subtitle?: string;
  /**
   * The field's values reduced by `reduceOptions.calcs[0]`, and `null` for a node with no
   * field — one the response only implied, which has no stat of its own to report. See
   * `deriveNodesFromLinks` and `converters/deriveNodes.ts`.
   */
  value: number | null;
  /**
   * The stats past the first, tooltip only: one per `calcs[1..]`, each formatted through the
   * mark's own display processor — else the single `secondarystat` label the row-form
   * conversion carries. See {@link MarkStat}.
   */
  secondaries?: MarkStat[];
  /** `config.custom.nodeRadius` — ECharts `symbolSize`. */
  radius?: number;
  /**
   * Always set. Resolved through the mark's own display processor (`colorOf`), which
   * is where `applyFieldOverrides` left the answer, so all eight colour modes arrive
   * done. A node with no field of its own takes the classic palette by position —
   * see `fillPaletteColors`. Optional only so a fixture can omit it.
   */
  color?: string;
  fixedX?: number;
  fixedY?: number;
  /**
   * `config.custom.hideFrom.viz` — the mark's own field says it is hidden.
   *
   * Carried rather than filtered out by the reader, because the legend has to keep
   * listing a hidden mark (greyed) for it to be restorable. `withoutHiddenMarks`
   * (`charts/relations.ts`) is what drops it from the render, along with every link
   * touching a hidden node.
   */
  hidden?: boolean;
  /**
   * Row index within the owning frame, for the tooltip footer's data links. Always
   * `0` for a mark that has a field — a wide frame reduces to a single row — and
   * unset for a node *derived* from an edge's endpoints, which has no field at all.
   */
  sourceRowIndex?: number;
  /**
   * The field this node *is*. Carries the node's own `config` (unit, links,
   * thresholds) and its `display` processor, so per-mark formatting and colour
   * resolve without a second lookup. Unset only on a derived node.
   */
  field?: Field;
}

/** A single directed edge. `value` is the numeric weight sankey/chord need. */
export interface RelationLink {
  /**
   * `field.name` — always, even when two collected marks share it.
   *
   * That is the contract's invariant and the reason the reader never synthesises one: an
   * id is the **override target**, and `byName`/`byNames` compare against `field.name` or
   * the display name, so a minted `a-->b` would be an id that looks addressable and is
   * not. Duplicates happen when the edges arrive as N raw frames whose value field is
   * called `Value`; the fix is at the source — a legend format, or letting the
   * `graph-edges-wide` pivot run above the panel — not in the reader. See {@link markKey}
   * for the one consumer that cannot live with the duplication.
   */
  id: string;
  /**
   * An **item key**, not an id: unique among the links of one render, set by the reader
   * only when {@link id} is not.
   *
   * Its only job is the item-to-field lookup the tooltip does (`getRelationsTooltipMarks`
   * keys its link map by `markKey ?? id`, and the three render variants emit the same
   * expression as the item's `markId`). It is never rendered — an edge's tooltip header is
   * `source → target` — and never matched against, so its stability bar is far lower than
   * an id's. Minted from the endpoints, then the label set that tells parallel edges
   * apart, then `#n` — `toGraphWide.uniqueId`, the ladder the pivot names fields with.
   */
  markKey?: string;
  source: string;
  target: string;
  value: number | null;
  /**
   * The stats past the first, tooltip only — the edge counterpart of
   * {@link RelationNode.secondaries}, so one "Calculation" setting means the same thing on
   * both kinds of mark.
   */
  secondaries?: MarkStat[];
  /**
   * Set **only** when the edge's field carries a real colour choice, so that an
   * unconfigured edge falls through to the series-level endpoint colouring
   * (`relationsLinkColor`). See `colorOf` and `getGraphLinkStyle`.
   */
  color?: string;
  /** `config.custom.lineWidth` — ECharts `lineStyle.width`. */
  width?: number;
  /** `config.custom.lineType`, already an ECharts line type. */
  lineType?: 'solid' | 'dashed' | 'dotted';
  /**
   * `config.custom.curveness` (0–1), overriding the panel-level `relationsCurveness`
   * for this edge alone. Graph variant only: a sankey or chord ribbon is a filled
   * area whose shape comes from the layout, not a curved stroke.
   */
  curveness?: number;
  /** `config.custom.hideFrom.viz`. See {@link RelationNode.hidden}. */
  hidden?: boolean;
  /**
   * Always `0` — the mark's first sample, which is the reduced row only for a
   * single-row frame. See {@link RelationNode.sourceRowIndex} and `readLinks`.
   */
  sourceRowIndex?: number;
  /** The field this edge *is*. See {@link RelationNode.field}. */
  field?: Field;
}

/** Chart-agnostic graph, ready for a graph / sankey / chord series. */
export interface NodeGraphData {
  nodes: RelationNode[];
  links: RelationLink[];
  /**
   * The label keys the **datasource** carried this response's endpoints under, when they are
   * not the contract's own `source`/`target`.
   *
   * Topology never reads this — every link above already resolved its endpoints — and no mark
   * renders differently because of it. Its one consumer is the tooltip footer's ad-hoc
   * filters, which have to write a key the datasource will recognise: a response grouped by
   * `client`/`server` filters on nothing at all under `source="web-api"`. Unset means the
   * canonical pair, which is both the contract's answer and the right one for a response that
   * really did group by it. See `resolveEndpointLabelKeys` and `relationsFilterLabels`.
   */
  endpointLabels?: GraphEndpointKeys;
}
