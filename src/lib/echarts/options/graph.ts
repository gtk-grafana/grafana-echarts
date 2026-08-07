import { type GraphSeriesOption } from 'echarts';
import {
  type CallbackDataParams,
  type ECBasicOption,
  type LabelLayoutOptionCallback,
  type LinearGradientObject,
} from 'echarts/types/dist/shared';
import { type RelationsLabelOverflow } from 'editor/types';
import { type RelationsChartContext } from 'lib/echarts/charts/types';
import { type NodeGraphData, type RelationLink } from 'lib/echarts/converters/relationsModel';
import { createBaseOptions } from 'lib/echarts/options/base';
import { formatEChartsValue } from 'lib/echarts/style';
import { seriesTooltip } from 'lib/echarts/tooltip/option';
import { buildRelationsTooltipModel, formatDerivedMarkValue } from 'lib/echarts/tooltip/relations';
import { type RelationsLinkItem, type RelationsMarks, type RelationsNodeItem } from 'lib/echarts/tooltip/types';
import { type PanelOptions } from 'types';

/**
 * Base option shared by every relations render variant (graph, sankey, chord).
 * Series data is merged at render time. The native ECharts legend is omitted: nodes
 * are surfaced through the Grafana DOM legend (see charts/relations.ts
 * `buildLegendItems`).
 */
export const relationsDefaultOptions: ECBasicOption = {
  ...createBaseOptions(),
};

/** Default node diameter in px, used when a node has no `custom.nodeRadius`. */
export const RELATIONS_NODE_SIZE_DEFAULT = 20;
/**
 * Default link colour mode: a gradient from the source node's colour to the target's.
 *
 * An edge joins two marks, so its natural colour is theirs, and a gradient is the one
 * mode that reads the direction off the edge itself without an arrowhead. An edge whose
 * own field carries a real colour choice overrides this per edge — see `edgeColorOf`.
 */
export const RELATIONS_LINK_COLOR_DEFAULT = 'gradient';
/**
 * What the `graph` variant degrades a gradient to when it cannot orient one: the source
 * node's own colour, resolved here rather than by ECharts. Still endpoint-derived and
 * still flips when the edge is reversed — just not a blend. See
 * `makeEdgeGradientResolver` for when that happens and `resolveLinkColor` for why the
 * keyword cannot be handed to ECharts at all.
 */
const GRAPH_LINK_COLOR_FALLBACK = 'source';
/** Default graph layout when the data does not pin positions. */
export const RELATIONS_LAYOUT_DEFAULT = 'force';
/** Node labels on by default — an unlabelled topology is hard to read. */
export const RELATIONS_SHOW_NODE_LABELS_DEFAULT = true;
/** Node values off by default: a second label line on every node is a lot of ink. */
export const RELATIONS_SHOW_NODE_VALUES_DEFAULT = false;
/** Edge values off by default: one number per link buries a graph of any size. */
export const RELATIONS_SHOW_EDGE_VALUES_DEFAULT = false;
/**
 * Arrowheads on by default.
 *
 * An edge is directed by contract (`source`/`target`), and on a force layout the
 * arrowhead is the *only* thing that says which way — the source-to-target gradient
 * cannot be oriented without knowing the node positions. See `makeEdgeGradientResolver`.
 */
export const RELATIONS_EDGE_ARROWS_DEFAULT = true;
/**
 * Adjacency highlighting on by default, and out of the Advanced tier.
 *
 * Reading one node's neighbourhood out of a dense topology is the main thing a
 * relations panel is hovered for, and it is also ECharts' own chord default. Note the
 * chord variant emits the key either way — see `getChordEmphasis`.
 */
export const RELATIONS_FOCUS_ADJACENCY_DEFAULT = true;
/**
 * Overlapping node labels are dropped by default (ECharts `labelLayout.hideOverlap`).
 *
 * The first thing that goes wrong on a graph past a handful of nodes is that the labels
 * pile up into an unreadable smear, and a label that is 40% covered is worse than no
 * label — the node keeps its symbol, its colour and its tooltip either way. This is the
 * chord variant's answer to the pie's `avoidLabelOverlap` as well: `series.chord` has no
 * such option, but its labels go through the same label-layout stage.
 *
 * **Node labels only** — see `getRelationsLabelLayout` for why an edge label may not go
 * through that stage at all.
 * https://echarts.apache.org/en/option.html#series-graph.labelLayout
 */
export const RELATIONS_HIDE_OVERLAPPING_LABELS_DEFAULT = true;
/** Long node names are ellipsised rather than allowed to run into a neighbour. */
export const RELATIONS_LABEL_OVERFLOW_DEFAULT: RelationsLabelOverflow = 'truncate';
/** Width in px at which `relationsLabelOverflow` bites. */
export const RELATIONS_LABEL_WIDTH_DEFAULT = 120;
/**
 * Force repulsion, **far** above ECharts' own `[0, 50]`.
 *
 * ECharts' default is tuned for the tens-of-nodes demo graphs in its gallery; on a
 * service topology it packs the nodes into a knot in the middle of the panel with every
 * label on top of every other. 400 spreads them to where the labels have room.
 * https://echarts.apache.org/en/option.html#series-graph.force.repulsion
 */
export const RELATIONS_REPULSION_DEFAULT = 400;
/** Target link length in px; likewise well above ECharts' 30. */
export const RELATIONS_EDGE_LENGTH_DEFAULT = 200;
/**
 * The force simulation's steps are **not** drawn by default, unlike ECharts.
 *
 * `layoutAnimation` renders every iteration, so the graph visibly settles from its seed
 * — which on a dashboard refreshing every 30s reads as the nodes jiggling for no reason,
 * since the topology did not change. Off, the same iterations run in one synchronous
 * pass and only the settled layout is painted.
 * https://echarts.apache.org/en/option.html#series-graph.force.layoutAnimation
 */
export const RELATIONS_LAYOUT_ANIMATION_DEFAULT = false;
/**
 * The force simulation's **seed** layout, pinned so a render is reproducible.
 *
 * With no seed, `forceHelper` places every node at `Math.random()` within the view rect
 * and the simulation walks from there, so the same frames draw a different graph every
 * time — the panel appears to shuffle its nodes on each refresh. `'circular'` seeds them
 * on a ring in data order instead, which is deterministic and, being already spread out,
 * converges to a tidier result.
 *
 * Not exposed as an option: "lay this out differently every time" is not a thing to
 * want. The one residual case is a node whose stat is exactly 0 in a set that sums above
 * it — `circularLayout(…, 'value')` gives it a zero-width slice, so it can land on its
 * neighbour's angle and the coincident-node repulse falls back to `Math.random()`.
 * https://echarts.apache.org/en/option.html#series-graph.force.initLayout
 */
const RELATIONS_FORCE_INIT_LAYOUT = 'circular';

/**
 * Every Advanced-gated relations option at its default. Spread over the stored
 * options in Default editor mode so a panel that was edited in Advanced mode and
 * switched back renders as an untouched Default panel — `showIf` only hides a
 * control, it does not clear the value. Required of any family that gates options
 * behind Advanced; see `docs/options-modes.md` and
 * `applyPartToWholeEditorModeDefaults`.
 *
 * `relationsFocusAdjacency`, `relationsHideOverlappingLabels` and `animation` are
 * deliberately **absent**: all three are Default-tier controls now, so resetting them
 * here would clear a value the user can still see.
 */
export const ADVANCED_RELATIONS_DEFAULTS: Partial<PanelOptions> = {
  relationsRoam: undefined,
  relationsZoom: undefined,
  relationsPan: undefined,
  relationsDraggable: undefined,
  relationsRepulsion: undefined,
  relationsEdgeLength: undefined,
  relationsGravity: undefined,
  relationsLayoutAnimation: undefined,
  relationsEdgeArrows: undefined,
  relationsShowEdgeValues: undefined,
  relationsCurveness: undefined,
  relationsLabelOverflow: undefined,
  relationsLabelWidth: undefined,
  relationsLinkColor: undefined,
  relationsSourceFilterLabel: undefined,
  relationsTargetFilterLabel: undefined,
  // The switch resets, and the state it stored goes with it — `getRelationsViewState`
  // reads nothing without the switch, so a Default-mode panel is never left holding a
  // pan the user cannot see the control for.
  relationsRememberView: undefined,
};

/** The chart context plus the per-mark lookup the tooltip and node labels read. */
export interface RelationsSeriesContext extends RelationsChartContext {
  /**
   * Each mark's own display processor and data-link source, so a hovered node or
   * edge formats with its own unit and surfaces its own `config.links`. Built once
   * per render by `getRelationsTooltipMarks`; optional so a unit test can build a
   * series without one and fall back to the panel formatter.
   */
  marks?: RelationsMarks;
}

/**
 * Resolve the graph layout. An explicit option wins; otherwise `none` when *every*
 * node pins its position, so server-provided `fixedx`/`fixedy` are honored (the
 * node-graph spec requires all-or-nothing), else the default force simulation.
 * https://echarts.apache.org/en/option.html#series-graph.layout
 */
export function getGraphLayout(data: NodeGraphData, options: PanelOptions): 'force' | 'circular' | 'none' {
  if (options.relationsLayout != null) {
    return options.relationsLayout;
  }
  const allPinned = data.nodes.length > 0 && data.nodes.every((node) => node.fixedX != null && node.fixedY != null);
  return allPinned ? 'none' : RELATIONS_LAYOUT_DEFAULT;
}

/**
 * Whether graph nodes can be dragged: only under `layout: 'none'`, whatever the option says.
 *
 * The option is hidden for the other two layouts (`editor/relations/interaction.ts`), and
 * this is the half that makes a dashboard which saved the pair behave rather than merely stop
 * offering it. Neither excluded layout can *keep* a drag — both re-solve on every render —
 * and both are actively broken while dragging:
 *
 * - **circular** re-solves the ring from the drop point on every pointer move, so the node
 *   under the cursor is not the node that moves;
 * - **force** re-runs the simulation, and `layoutAnimation` is off by default here so ECharts
 *   iterates it to convergence synchronously inside the `drag` handler — every mouse move
 *   rearranges the whole graph. See {@link getGraphForce}.
 *
 * Resolved against the *resolved* layout rather than the option, so data that pins every node
 * (which infers `none`) stays draggable with `Layout` left unset. See {@link getGraphLayout}.
 */
export function resolveGraphDraggable(options: PanelOptions, layout: 'force' | 'circular' | 'none'): boolean {
  return options.relationsDraggable === true && layout === 'none';
}

/** A node's position in the graph's own coordinate space. See {@link resolveFixedPositions}. */
interface GraphPoint {
  x: number;
  y: number;
}

/**
 * Ring radius used to seed nodes when **nothing** is pinned.
 *
 * `createViewCoordSys` takes the bounding box of the emitted `x`/`y` and scales it onto the
 * panel rect, so the *shape* of the point set is all that survives and any radius draws the
 * same graph. The magnitude still matters, and this used to be `1`:
 *
 * **zrender sub-pixel-optimizes axis-aligned edges, in whatever space the coordinates are
 * in.** A graph edge is an `ECLinePath` with `subPixelOptimize: true`, so
 * `subPixelOptimizeLine` nudges a horizontal or vertical line by half a unit to land a 1px
 * stroke on a pixel centre (`round(y1 * 2) === round(y2 * 2)` picks it out, and
 * `strokeNoScale` means the width it compares against is `1`). Those coordinates are the
 * graph's *data* space, which the view scales onto the panel — so on a unit ring the "half
 * pixel" was half a data unit, and the two edges of a four-node ring that happen to be
 * axis-aligned were drawn 159px away from the nodes they joined. That is the reported
 * "edges are not attached to any nodes", and why dragging a node fixed it: the drop is
 * almost never exactly axis-aligned, so the nudge stops applying.
 *
 * A pixel-ish radius makes the nudge sub-pixel again, which is what it was written to be.
 * It is also the space a drag writes back (`useRelationsPersistence`), so the stored
 * coordinates stay well conditioned across reloads.
 */
const FIXED_SEED_RADIUS = 400;

/**
 * How far outside the pinned nodes' bounding box the seeded ones are placed, as a
 * multiple of its half-extent. Just clear of the pinned cluster rather than lost beside
 * it — the box is what the view scales to fit, so a large multiplier would shrink the
 * pinned layout to make room.
 */
const FIXED_SEED_MARGIN = 1.25;

/**
 * Every node's position under `layout: 'none'` — its own pinned pair when it has one,
 * a deterministic seed when it does not.
 *
 * **The seed is what makes "Fixed" a usable choice rather than a blank panel.** ECharts'
 * `simpleLayout` does `node.setLayout([+model.get('x'), +model.get('y')])`, so a node with
 * no `x` lays out at `[NaN, NaN]` and neither it nor any link touching it is drawn. Since
 * `fixedx`/`fixedy` are per-mark overrides nobody has written yet on a fresh panel,
 * selecting Fixed used to blank the visualization outright and give the user nothing to
 * drag or override *from*.
 *
 * Seeded on a ring in data order, matching the force simulation's own `initLayout`
 * (`RELATIONS_FORCE_INIT_LAYOUT`): deterministic, so the panel does not reshuffle on
 * refresh, and already spread out, so the labels have room. Partially-pinned data is the
 * interesting case — the seeds go on a ring *around* the pinned bounding box, so pinned
 * marks keep their relative layout and the rest are visibly "not placed yet".
 */
export function resolveFixedPositions(nodes: NodeGraphData['nodes']): Map<string, GraphPoint> {
  const positions = new Map<string, GraphPoint>();
  const pinned: GraphPoint[] = [];
  for (const node of nodes) {
    if (node.fixedX != null && node.fixedY != null) {
      const point = { x: node.fixedX, y: node.fixedY };
      positions.set(node.id, point);
      pinned.push(point);
    }
  }

  const seeded = nodes.filter((node) => !positions.has(node.id));
  if (seeded.length === 0) {
    return positions;
  }

  const ring = seedRing(pinned);
  seeded.forEach((node, index) => {
    const angle = (2 * Math.PI * index) / seeded.length;
    positions.set(node.id, {
      x: ring.x + ring.radius * Math.cos(angle),
      y: ring.y + ring.radius * Math.sin(angle),
    });
  });
  return positions;
}

/** Centre and radius of the seed ring: around the pinned nodes, or the origin if none. */
function seedRing(pinned: readonly GraphPoint[]): GraphPoint & { radius: number } {
  if (pinned.length === 0) {
    return { x: 0, y: 0, radius: FIXED_SEED_RADIUS };
  }
  const xs = pinned.map((point) => point.x);
  const ys = pinned.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  // A single pinned node, or a row of them, has a zero extent on one axis — fall back to
  // the unit radius rather than stacking every seed on top of it.
  const extent = Math.max(maxX - minX, maxY - minY) / 2 || FIXED_SEED_RADIUS;
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2, radius: extent * FIXED_SEED_MARGIN };
}

/**
 * Force-layout tuning. **Always** emitted, unlike the other option groups here,
 * because three of its four keys disagree with ECharts' own defaults on purpose:
 * the simulation is seeded (`initLayout`) so a render is reproducible, its steps are
 * not drawn (`layoutAnimation`) so a refresh does not jiggle, and it is spread far
 * wider (`repulsion` / `edgeLength`) so the labels have room. `gravity` is the one
 * key left to ECharts when unset.
 * https://echarts.apache.org/en/option.html#series-graph.force
 */
export function getGraphForce(options: PanelOptions): NonNullable<GraphSeriesOption['force']> {
  const force: NonNullable<GraphSeriesOption['force']> = {
    initLayout: RELATIONS_FORCE_INIT_LAYOUT,
    repulsion: options.relationsRepulsion ?? RELATIONS_REPULSION_DEFAULT,
    edgeLength: options.relationsEdgeLength ?? RELATIONS_EDGE_LENGTH_DEFAULT,
    layoutAnimation: options.relationsLayoutAnimation ?? RELATIONS_LAYOUT_ANIMATION_DEFAULT,
  };
  if (options.relationsGravity != null) {
    force.gravity = options.relationsGravity;
  }
  return force;
}

/**
 * `series.*.roam`, which is **pan only** here, ever.
 *
 * Zoom is deliberately not routed through it: ECharts' roam zoom is the scroll wheel,
 * and a wheel event over a panel is the dashboard's to scroll — capturing it means a
 * user scrolling past the panel silently rescales it instead. The panel draws its own
 * zoom buttons and dispatches the roam *action* directly, which needs no `roam` value
 * at all (the action resolves the view coordinate system, not the controller). See
 * `getRelationsZoomAction` and `ChartZoomControls`.
 *
 * https://echarts.apache.org/en/option.html#series-graph.roam
 */
export function resolveRelationsRoam(options: PanelOptions): 'move' | false {
  return resolveRelationsPan(options) ? 'move' : false;
}

/**
 * Whether drag-to-pan is on, falling back to the superseded single `relationsRoam`
 * switch so a dashboard saved before the split keeps panning. These two are the only
 * readers of the deprecated option, which is exactly why they may read it.
 */
export function resolveRelationsPan(options: PanelOptions): boolean {
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- reading it is the migration
  return (options.relationsPan ?? options.relationsRoam) === true;
}

/** Whether the panel's zoom buttons are shown. Same back-compat fallback as pan. */
export function resolveRelationsZoom(options: PanelOptions): boolean {
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- reading it is the migration
  return (options.relationsZoom ?? options.relationsRoam) === true;
}

/** The remembered view, as the keys ECharts keeps a `View`'s roam state in. */
export interface RelationsViewState {
  zoom?: number;
  center?: [number, number];
}

/**
 * The saved pan/zoom, for the two variants that have a view to save.
 *
 * `zoom` and `center` are where ECharts itself keeps the roam state — the roam action
 * syncs them back onto the series model (`viewCoordSysSyncBack`), which is what makes
 * them readable and writable rather than an internal transform. Emitting them is
 * therefore the whole of "restore the view".
 *
 * Empty unless the user asked for it: `relationsRememberView` is off by default, and a
 * stale `zoom` left in a dashboard's JSON must not survive switching the switch back
 * off. See `useRelationsPersistence` for the writing half.
 * https://echarts.apache.org/en/option.html#series-graph.zoom
 */
export function getRelationsViewState(options: PanelOptions): RelationsViewState {
  if (options.relationsRememberView !== true) {
    return {};
  }
  return {
    ...(options.relationsViewZoom != null ? { zoom: options.relationsViewZoom } : {}),
    ...(options.relationsViewCenter != null ? { center: options.relationsViewCenter } : {}),
  };
}

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
 * Drop a **node** label that would collide with one already placed, via ECharts' shared
 * label-layout stage — which every one of the three variants routes its labels
 * through, so this is the family's single answer to overlapping labels.
 *
 * **The callback form, and only so `dataType` can be read.** An edge label is excluded,
 * because putting one through `hideOverlap` makes the render depend on how many times the
 * panel has drawn: a graph's edge labels are measured before its link geometry has
 * settled, so the first pass hides nearly all of them and every subsequent pass lets one
 * more through — measured as 1, 2, 3, then all 4 edge values over four renders of an
 * unchanged four-edge fixture, which is exactly the "every refresh draws more edge values"
 * report. Node labels do not drift because a node's own position is settled by the time it
 * is measured. Excluding edges costs their overlap avoidance and buys a render that is the
 * same on the first pass as on the tenth; "Show edge values" is off by default precisely
 * because one number per link is a lot of ink either way.
 *
 * Returns `undefined` when off: `LabelManager.addLabelsOfSeries` skips a series whose
 * `labelLayout` has no keys, so an empty object would be the same as omitting it, and
 * omitting it is clearer.
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

/**
 * Arrowhead at the target end, making edge direction readable. On by default — see
 * `RELATIONS_EDGE_ARROWS_DEFAULT`.
 * https://echarts.apache.org/en/option.html#series-graph.edgeSymbol
 */
export function getGraphEdgeSymbol(options: PanelOptions): GraphSeriesOption['edgeSymbol'] | undefined {
  return (options.relationsEdgeArrows ?? RELATIONS_EDGE_ARROWS_DEFAULT) === true ? ['none', 'arrow'] : undefined;
}

/**
 * Hover emphasis. `'adjacency'` fades everything but the hovered node and its
 * neighbours. On by default; the key is omitted when switched off, which is ECharts'
 * own no-focus behaviour for `graph` and `sankey` (chord differs — see
 * `getChordEmphasis`).
 * https://echarts.apache.org/en/option.html#series-graph.emphasis
 */
export function getGraphEmphasis(options: PanelOptions): GraphSeriesOption['emphasis'] | undefined {
  return (options.relationsFocusAdjacency ?? RELATIONS_FOCUS_ADJACENCY_DEFAULT) === true
    ? { focus: 'adjacency' }
    : undefined;
}

/**
 * Series-level link style. **Carries no colour**, deliberately: every edge is coloured
 * on its own item by `resolveLinkColor`, and the ECharts keywords this used to emit do
 * not work on a `graph` series at all — see there. What is left is `curveness`, omitted
 * at 0 so straight links stay ECharts-default, and ECharts' own neutral grey as the
 * last resort for an edge whose endpoint somehow has no colour.
 * https://echarts.apache.org/en/option.html#series-graph.lineStyle
 */
export function getGraphLinkStyle(options: PanelOptions): NonNullable<GraphSeriesOption['lineStyle']> {
  const lineStyle: NonNullable<GraphSeriesOption['lineStyle']> = {};
  if (options.relationsCurveness != null && options.relationsCurveness !== 0) {
    lineStyle.curveness = options.relationsCurveness;
  }
  return lineStyle;
}

/**
 * Each node's rendered colour, by node id, so the edge gradients can look one up by
 * endpoint. There is no resolution left to do: the mark's own display processor
 * decided the colour in `converters/graphWide.ts`, which is what makes a `byName`
 * override, a fixed colour and a by-value scheme all work with no code here.
 */
function nodeColorsById(data: NodeGraphData): Map<string, string> {
  const colors = new Map<string, string>();
  for (const node of data.nodes) {
    if (node.color != null) {
      colors.set(node.id, node.color);
    }
  }
  return colors;
}

/** Builds one edge's source->target gradient, or `undefined` when it cannot be oriented. */
type EdgeGradientResolver = (link: RelationLink) => LinearGradientObject | undefined;

/**
 * One edge's colour, resolved **here rather than by ECharts** — which is the whole
 * point of this function, because on a `graph` series ECharts gets it wrong.
 *
 * `edgeVisual.ts` swaps a `lineStyle.color` of `'source'` / `'target'` for the endpoint
 * node's `style.fill`, and it is registered at `PRIORITY.VISUAL.CHART` (3000) while the
 * per-item style task that reads each node's `itemStyle.color` runs at
 * `CHART_DATA_CUSTOM` (4500). So at the moment the swap happens the nodes still carry
 * only the *series-level* fill, and every edge in the panel comes out the same ECharts
 * palette colour — the keywords look supported and are inert. (ECharts' own graph demos
 * hide this: they colour nodes by `categories`, and `categoryVisual` does run first.)
 *
 * The node colours here are the rendered ones, overrides included, so an edge meets its
 * endpoints exactly. Order of precedence, highest first:
 *
 * 1. the edge's **own** field colour (`link.color`, set only when that field carries a
 *    real colour choice — see `edgeColorOf`);
 * 2. the source-to-target gradient, when it can be oriented (`resolveGradient`);
 * 3. the endpoint colour the mode names, degrading `'gradient'` to the source's.
 */
function resolveLinkColor(
  link: RelationLink,
  nodeColors: ReadonlyMap<string, string>,
  mode: string,
  resolveGradient?: EdgeGradientResolver
): string | LinearGradientObject | undefined {
  if (link.color != null) {
    return link.color;
  }
  const gradient = resolveGradient?.(link);
  if (gradient != null) {
    return gradient;
  }
  const endpoint = mode === 'gradient' ? GRAPH_LINK_COLOR_FALLBACK : mode;
  return nodeColors.get(endpoint === 'target' ? link.target : link.source);
}

/**
 * Per-edge `source -> target` gradients for the `graph` variant, which ECharts cannot
 * express itself.
 *
 * **Only when the node positions are known**, and that restriction is the whole
 * subtlety. zrender resolves a non-global gradient against the shape's *bounding box*,
 * so `x: 0 -> x2: 1` runs left-to-right across the edge — which is source-to-target only
 * if the source happens to sit on the left. Under a force or circular layout the
 * positions do not exist until after ECharts has laid the graph out, so the orientation
 * would be a coin flip and half the edges would report their direction backwards. That
 * is worse than not blending, so this returns `undefined` and the series keyword
 * (`'source'`) takes over.
 *
 * Under `layout: 'none'` the sign of `dx`/`dy` picks the correct box corner and the
 * gradient runs exactly along the edge. A degenerate axis is harmless: a horizontal edge
 * has zero box height, so the vertical component of the gradient spans nothing.
 *
 * `positions` is therefore supplied only for that layout, and is the *rendered* position
 * of every node — pinned or seeded (`resolveFixedPositions`). Reading `fixedX`/`fixedY`
 * directly instead would be wrong in both directions now: a seeded node has neither, and
 * a force-layout graph whose data happens to pin every node would orient its gradients by
 * coordinates ECharts never uses.
 */
function makeEdgeGradientResolver(
  positions: ReadonlyMap<string, GraphPoint> | undefined,
  nodeColors: ReadonlyMap<string, string>,
  options: PanelOptions
): EdgeGradientResolver | undefined {
  if (positions == null || (options.relationsLinkColor ?? RELATIONS_LINK_COLOR_DEFAULT) !== 'gradient') {
    return undefined;
  }

  return (link) => {
    const from = positions.get(link.source);
    const to = positions.get(link.target);
    const sourceColor = nodeColors.get(link.source);
    const targetColor = nodeColors.get(link.target);
    // A self-loop has no direction to express, and two identical colours are not a
    // gradient — leave both to the keyword.
    if (!from || !to || sourceColor == null || targetColor == null || sourceColor === targetColor) {
      return undefined;
    }
    const x = to.x >= from.x ? 0 : 1;
    const y = to.y >= from.y ? 0 : 1;
    return {
      type: 'linear',
      x,
      y,
      x2: 1 - x,
      y2: 1 - y,
      colorStops: [
        { offset: 0, color: sourceColor },
        { offset: 1, color: targetColor },
      ],
    };
  };
}

/**
 * Map the model's nodes to ECharts graph data items. `positions` is supplied only under
 * `layout: 'none'`, where it holds *every* node — see {@link resolveFixedPositions}.
 */
function toNodeItems(
  data: NodeGraphData,
  ctx: RelationsSeriesContext,
  positions: ReadonlyMap<string, GraphPoint> | undefined
): RelationsNodeItem[] {
  const defaultSize = ctx.options.relationsNodeSize ?? RELATIONS_NODE_SIZE_DEFAULT;

  return data.nodes.map((node) => {
    const item: RelationsNodeItem = {
      // ECharts keys nodes by `retrieve(id, name, dataIndex)` and resolves each
      // link's source/target against that key (`createGraphFromNodeEdge`). Setting
      // `id` therefore pins link resolution to the mark's field name, which frees
      // `name` to carry the human-readable `displayName` for the label.
      id: node.id,
      name: node.name,
      // `custom.nodeRadius` always wins over the panel-level size.
      symbolSize: node.radius ?? defaultSize,
    };
    if (node.value != null) {
      item.value = node.value;
    }
    if (node.color != null) {
      item.itemStyle = { color: node.color };
    }
    // Only meaningful under `layout: 'none'`, which is the only layout `positions` is
    // built for — and there it answers for every node, pinned or seeded.
    const position = positions?.get(node.id);
    if (position != null) {
      item.x = position.x;
      item.y = position.y;
    }
    if (node.subtitle != null) {
      item.subtitle = node.subtitle;
    }
    if (node.secondaries != null) {
      item.secondaries = node.secondaries;
    }
    return item;
  });
}

/** Map the model's links to ECharts graph link items. */
function toLinkItems(
  links: RelationLink[],
  nodeColors: ReadonlyMap<string, string>,
  mode: string,
  resolveGradient?: EdgeGradientResolver
): RelationsLinkItem[] {
  return links.map((link) => {
    // `markId` is how a hovered edge finds its own field for formatting and data
    // links; the endpoints cannot identify it, since parallel edges share them.
    // `markKey` first, for the one case where the ids are not unique either — N raw
    // frames whose value field is called `Value`. See `RelationLink.markKey`.
    const item: RelationsLinkItem = { source: link.source, target: link.target, markId: link.markKey ?? link.id };
    if (link.value != null) {
      item.value = link.value;
    }
    if (link.secondaries != null) {
      item.secondaries = link.secondaries;
    }
    const lineStyle: NonNullable<RelationsLinkItem['lineStyle']> = {};
    // Every edge carries its own colour: the series-level ECharts keywords do not
    // work on a `graph` series. See `resolveLinkColor`.
    const color = resolveLinkColor(link, nodeColors, mode, resolveGradient);
    if (color != null) {
      lineStyle.color = color;
    }
    if (link.width != null) {
      lineStyle.width = link.width;
    }
    if (link.lineType != null) {
      lineStyle.type = link.lineType;
    }
    // Overrides the series-level `relationsCurveness` for this edge alone —
    // `GraphSeries` reads `curveness` off the item's own `lineStyle` first.
    if (link.curveness != null) {
      lineStyle.curveness = link.curveness;
    }
    if (Object.keys(lineStyle).length > 0) {
      item.lineStyle = lineStyle;
    }
    return item;
  });
}

/**
 * Graph series: nodes plus the links between them. `zlevel` places the series on
 * its own canvas layer (see the panel's `zLevel.series`) so layered canvas capture
 * can isolate it, matching the other families.
 * https://echarts.apache.org/en/option.html#series-graph
 */
export function getGraphSeries(data: NodeGraphData, ctx: RelationsSeriesContext): GraphSeriesOption {
  const layout = getGraphLayout(data, ctx.options);
  const edgeSymbol = getGraphEdgeSymbol(ctx.options);
  const emphasis = getGraphEmphasis(ctx.options);
  const edgeLabel = getRelationsEdgeLabel(ctx);
  const labelLayout = getRelationsLabelLayout(ctx.options);
  // Indexed by endpoint: the edge colours and gradients must use the very colours the
  // nodes were painted with, overrides included, or a blend would not meet its
  // endpoints and a `source` edge would not match its source.
  const nodeColors = nodeColorsById(data);
  const mode = ctx.options.relationsLinkColor ?? RELATIONS_LINK_COLOR_DEFAULT;
  // Every node's rendered position, but only for the layout that reads one: the other
  // two lay out for themselves, and emitting `x`/`y` there would just move the view's
  // bounding box around. See `resolveFixedPositions`.
  const positions = layout === 'none' ? resolveFixedPositions(data.nodes) : undefined;
  const resolveGradient = makeEdgeGradientResolver(positions, nodeColors, ctx.options);

  return {
    type: 'graph',
    layout,
    // Pan only, and off by default; zoom is driven by the panel's buttons rather than
    // by the scroll wheel. See `resolveRelationsRoam`.
    roam: resolveRelationsRoam(ctx.options),
    // The remembered pan/zoom, when the user asked for one to be remembered.
    ...getRelationsViewState(ctx.options),
    // Only under the layout that keeps a position. See `resolveGraphDraggable`.
    draggable: resolveGraphDraggable(ctx.options, layout),
    // Always emitted: three of its keys deliberately disagree with ECharts'.
    force: getGraphForce(ctx.options),
    ...(edgeSymbol ? { edgeSymbol } : {}),
    ...(emphasis ? { emphasis } : {}),
    ...(edgeLabel ? { edgeLabel } : {}),
    ...(labelLayout ? { labelLayout } : {}),
    label: getGraphLabel(ctx),
    lineStyle: getGraphLinkStyle(ctx.options),
    zlevel: ctx.options.zLevel?.series,
    data: toNodeItems(data, ctx, positions),
    links: toLinkItems(data.links, nodeColors, mode, resolveGradient),
    tooltip: seriesTooltip(buildRelationsTooltipModel(ctx.marks, ctx.options), ctx.tooltipSink),
  };
}
