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
 * itself is still documented in ../../../../data-plane/node-graph.md, because it is
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
  /** The field's values reduced by `reduceOptions.calcs[0]`. */
  value: number | null;
  /**
   * The secondary stat, tooltip only: `calcs[1]` formatted through the mark's own
   * display processor, else a `secondarystat` label carried by the conversion.
   * Already a display string in the first case, hence the union.
   */
  secondary?: number | string;
  /** `config.custom.nodeRadius` — ECharts `symbolSize`. */
  radius?: number;
  /** Resolved through the mark's own display processor. See `colorOf`. */
  color?: string;
  fixedX?: number;
  fixedY?: number;
  /**
   * Row index within the owning frame, for the tooltip footer's data links. Always
   * `0` for a mark that has a field — a wide frame reduces to a single row — and
   * unset for a node *derived* from an edge's endpoints, which has no field at all.
   */
  sourceRowIndex?: number;
  /**
   * Position in the *unfiltered* node list. Set only once the legend has hidden
   * something (see `withoutHiddenNodes`), so palette colours stay attached to their
   * node instead of shifting up as nodes above them are toggled off.
   */
  paletteIndex?: number;
  /**
   * The field this node *is*. Carries the node's own `config` (unit, links,
   * thresholds) and its `display` processor, so per-mark formatting and colour
   * resolve without a second lookup. Unset only on a derived node.
   */
  field?: Field;
}

/** A single directed edge. `value` is the numeric weight sankey/chord need. */
export interface RelationLink {
  /** `field.name`. */
  id: string;
  source: string;
  target: string;
  value: number | null;
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
  /** Always `0`: a wide frame reduces to a single row. See {@link RelationNode.sourceRowIndex}. */
  sourceRowIndex?: number;
  /** The field this edge *is*. See {@link RelationNode.field}. */
  field?: Field;
}

/** Chart-agnostic graph, ready for a graph / sankey / chord series. */
export interface NodeGraphData {
  nodes: RelationNode[];
  links: RelationLink[];
}
