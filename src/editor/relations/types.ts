import { type EChartsFieldConfig, type SeriesType } from 'editor/types';

/**
 * The relations family's editor types: its render-variant union, the keywords its
 * option unions take, and its per-mark custom field config.
 *
 * Beside the family's constants rather than in the shared `editor/types.ts`, which is
 * where the cross-family unions live. The dependency is one-way — `SeriesType` lists
 * every family's series and `RelationsSeriesType` narrows it, so the shared module never
 * needs to know about this one.
 */

/**
 * Relations (graph / flow) render types: a set of nodes plus the links between
 * them. `graph` ships today; `sankey` and `chord` are planned variants of the same
 * family, since all three ECharts series read the identical node/link input. Built
 * from the field-based graph contract — see echarts/relations/converters/graphWide.ts and
 * `data-plane/graph-wide.md`. `lines` is deliberately excluded: it needs
 * coordinate-pair polylines, not node references (see `todo/node-graph.md`).
 */
export type RelationsSeriesType = Extract<SeriesType, 'graph' | 'sankey' | 'chord'>;

/**
 * Relations graph layout (ECharts `series.graph.layout`): `force` (physics
 * simulation), `circular` (nodes on a ring), or `none` (honor server-provided
 * `fixedx`/`fixedy`). Default-tier. See `getGraphLayout`.
 */
export type RelationsGraphLayout = 'force' | 'circular' | 'none';

/**
 * How a relations link is colored — ECharts `series.graph.lineStyle.color` accepts
 * these keywords: inherit the `source` node's color, the `target`'s, or blend both
 * as a `gradient`. An explicit per-edge `color` field always wins. Advanced-only.
 * See `getGraphLinkColor`.
 */
export type RelationsLinkColor = 'source' | 'target' | 'gradient';

/**
 * How a long relations node label is handled at `relationsLabelWidth` — the same
 * shape as `lib/echarts/options/labels.LabelOverflow`, spelled out per family the way
 * `PieLabelOverflow` is so this module stays free of `lib` imports. Advanced;
 * defaults to `truncate`, since a topology's node names are frequently long enough to
 * reach a neighbour. See `getRelationsLabelStyle`.
 */
export type RelationsLabelOverflow = 'none' | 'truncate' | 'break' | 'breakAll';

/**
 * Sankey flow direction (ECharts `series.sankey.orient`, typed `LayoutOrient`
 * there): `horizontal` lays the node columns left-to-right, `vertical` top-to-bottom.
 * Default-tier. See `getSankeyOrient`.
 */
export type RelationsSankeyOrient = 'horizontal' | 'vertical';

/**
 * Where a sankey places nodes that could sit in more than one column — ECharts
 * `series.sankey.nodeAlign`: `justify` pushes sinks to the far edge, `left`/`right`
 * pin every node to the earliest/latest column it can occupy. Default-tier.
 * See `getSankeyNodeAlign`.
 */
export type RelationsSankeyNodeAlign = 'justify' | 'left' | 'right';

/** ECharts line types, the three `lineStyle.type` keywords a stroked edge can take. */
export type RelationsLineType = 'solid' | 'dashed' | 'dotted';

/**
 * Per-mark custom field config for the relations family.
 *
 * Under the field-based graph contract one node is one **field** and one edge is one
 * **field** (see `data-plane/graph-wide.md`), so everything the row form carried as a
 * per-row column — `noderadius`, `subtitle`, `thickness`, `strokedasharray` — is
 * ordinary per-field config here, editable through a Grafana override that names the
 * mark. `converters/legacyToWide.ts` writes exactly these keys when it converts a row
 * response, so a legacy dashboard and a hand-configured override end up in the same
 * place. Read back in `converters/graphWide.ts`.
 *
 * Node keys and edge keys share one interface because a field override cannot know
 * which frame its field came from; the editors are grouped by category instead, and
 * each key is simply ignored on the wrong kind of mark.
 */
export interface EChartsRelationsFieldConfig extends EChartsFieldConfig {
  /** Node diameter in px (ECharts `symbolSize`), overriding the panel-level node size. */
  nodeRadius?: number;
  /** Second tooltip line for a node. The row form's `subtitle` column. */
  subtitle?: string;
  /** Pinned node position. All-or-nothing: the layout only honours it when every node pins both. */
  fixedX?: number;
  fixedY?: number;
  /**
   * Grafana icon name for a node, carried by the conversion but **not rendered**:
   * ECharts takes a `symbol`, and resolving Grafana's icon set to one is unbuilt.
   * Typed so the conversion's output is described; deliberately given no editor, so
   * the pane offers no control that silently does nothing. See
   * `todo/graph-wide-migration.md`.
   */
  icon?: string;
  /** Edge stroke width (ECharts `lineStyle.width`). The row form's `thickness`. */
  lineWidth?: number;
  /** Edge stroke pattern. The row form's `strokedasharray`, as a choice rather than an approximation. */
  lineType?: RelationsLineType;
  /** Edge curvature 0–1, overriding the panel-level "Link curveness" for this edge. */
  curveness?: number;
  /**
   * Label key this mark's **source** endpoint is filtered on, when a pinned tooltip's
   * "Filter on" / "Filter out" buttons write an ad-hoc filter into the dashboard.
   *
   * @deprecated Kept for demonstration and slated for removal — see
   * `addRelationsFilterConfig` for the routes that replaced it and the two cases left.
   * Override-only, and set by nothing in this repo. **Keep the original label in the
   * query instead**: the panel recovers it per edge, which is also the only thing that can
   * be right on a multi-level flow.
   *
   * Unset reads the pair off the response — the field's own labels, the frame's
   * declaration, or the pair recovered by matching the endpoint values back against the
   * labels for a query that kept its originals (`aliasEndpointKeys`) — and falls back to the
   * contract's own. A **node** takes its keys from the edges touching it, so it never needed
   * setting per node. See `relationsFilterLabels`.
   */
  sourceFilterLabel?: string;
  /**
   * As {@link sourceFilterLabel}, for the **target** endpoint.
   *
   * @deprecated See {@link sourceFilterLabel}.
   */
  targetFilterLabel?: string;
}
