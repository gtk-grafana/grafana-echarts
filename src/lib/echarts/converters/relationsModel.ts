import { type Field } from '@grafana/data';

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
   * The secondary stat, tooltip only: `calcs[1]` formatted through the mark's own
   * display processor, else a `secondarystat` label carried by the conversion.
   * Already a display string in the first case, hence the union.
   */
  secondary?: number | string;
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
   * The secondary stat, tooltip only: `calcs[1]` reduced over the edge's own field and
   * formatted through its own display processor, else a `secondarystat` label carried
   * by the conversion. The edge counterpart of {@link RelationNode.secondary} — one
   * "Calculation" setting, the same meaning on both kinds of mark.
   */
  secondary?: number | string;
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
}
