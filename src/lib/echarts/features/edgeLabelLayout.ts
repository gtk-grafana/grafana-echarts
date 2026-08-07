import { registerUpdateLifecycle } from 'echarts/core';

/**
 * Everything ECharts' shared label-layout stage gets wrong for a **graph edge's label**,
 * which is the one label in the family that its *host* positions.
 *
 * A zrender label is drawn through its host's `textConfig`, and every label ECharts'
 * `LabelManager` manages is rewritten into canvas coordinates with `local: false` on the
 * host to match (`updateLayoutConfig`, commented `// Force to set local false`). That is
 * right for the labels it positions from an anchor keyword, and wrong here:
 * `Line.prototype.beforeUpdate` places an edge's label along the line, in the line's own
 * coordinates, on every redraw — `Line` asks for `local: true` explicitly. The two halves
 * then disagree, and the first two problems below follow from that.
 *
 * ## Keeping them attached
 *
 * With `local: false` the label's coordinates are read as canvas coordinates
 * (`innerTransformable.parent = isLocal ? this : null`), so the host's transform stops
 * carrying it. Invisible while the series group's transform is identity; the moment a
 * graph is panned or zoomed, the edge values stay behind while the links slide out from
 * under them. Measured on a three-node ring panned by (40, 25): every node label moved by
 * exactly that, and both edge values by (0, 0).
 *
 * ## Hiding the ones that overlap
 *
 * "Hide overlapping labels" reached node labels and not edge values, because `hideOverlap`
 * measures each label from the rect `_addLabel` captured — and for an edge label that rect
 * is a frame stale, since `beforeUpdate` has not run for this pass yet. On a first render
 * it is the rect the label had before it was ever positioned, so *every* edge value looks
 * stacked at the same spot and all but one is dropped, then one more survives each
 * subsequent pass: 1, 2, 3, then all 4 over four renders of an unchanged fixture. That is
 * why `getRelationsLabelLayout` holds them back from the stage, and this is the other half
 * of that: the geometry is settled here first, so the decision is made on where each label
 * will actually be drawn and comes out the same on every pass.
 *
 * **Node labels win.** ECharts orders `hideOverlap` by `priority`, which defaults to the
 * area of the label's host, and a link's host spans the whole link — so letting the stage
 * arbitrate both kinds would let a long edge's value erase a node's name. It is the wrong
 * way round: a name identifies the mark, a value is also in its tooltip. So the stage keeps
 * the node labels it already arbitrated and this yields to them, then to earlier edges in
 * data order.
 *
 * ## Giving a hidden one back on hover
 *
 * A value that was dropped should come back when the reader asks for that edge — by hovering
 * or pinning the edge itself, **or either of the nodes it joins**, whose edge values are
 * exactly what hovering a node is asking about.
 *
 * `hideOverlap` gets the first of those for free by hiding a label in the *normal* state and
 * un-hiding it in the *emphasis* one, and it cannot get the second at all: the adjacency
 * ECharts computes for the fade only *un-blurs* the focus set (`blurSeries` →
 * `leaveBlurOfIndices`), which is the same normal state the edge was already in.
 *
 * So both are done here, and the emphasis-state trick is deliberately **not** used for the
 * first — the two do not compose. zrender's state machine copies `ignore` into `_normalState`
 * as soon as a state mentioning it is applied (`_savePrimaryToNormal`; `PRIMARY_STATES_KEYS`
 * includes `ignore`), and from then on every return to normal re-hides the label, undoing a
 * reveal that came from anywhere else. Measured: with the trick in place, a label revealed by
 * hovering its node was put back by the next state change, so pinning the node lost it. With
 * `ignore` written from one place only, nothing else touches it. See
 * {@link revealEdgeLabelsFor}.
 *
 * ## Why this hook
 *
 * Registered on the same lifecycle hook the label-layout feature uses, and after it, so the
 * repairs land inside the update that needs them rather than a frame later. It has to be
 * this hook and not `series:afterupdate`: `updateLabelLayout()`, which a graph zoom calls
 * directly, re-runs `updateLayoutConfig` (and so re-forces `local: false`) without running
 * an update at all. That is also why every series is walked rather than
 * `params.updatedSeries`, which that caller passes empty.
 *
 * Reaching an edge label at all means its series asked for a `labelLayout`, since that is
 * the only thing that sets `local: false`; within this plugin that option is emitted for
 * exactly one reason, so it also means the reader asked for overlapping labels to be
 * hidden. See `getRelationsLabelLayout`.
 *
 * https://echarts.apache.org/en/option.html#series-graph.labelLayout
 */
export function registerEdgeLabelLayout(): void {
  registerUpdateLifecycle('series:layoutlabels', (ecModel, api) => {
    const revealed: RevealIndex = new Map();
    ecModel.eachSeries((seriesModel) => {
      // Only a graph has links whose labels their host positions — and asking the series
      // for its graph is also how each edge is matched to the two nodes it joins, which the
      // reveal needs and no element carries.
      const graph = readGraph(seriesModel);
      const group = api.getViewOfSeriesModel(seriesModel)?.group;
      if (graph == null || group == null) {
        return;
      }

      // Walked by index rather than by traversal, so every edge arrives with its endpoints.
      // A host the stage did not rewrite is one the reader did not ask to arbitrate.
      const edges: Array<{ host: LabelHost; nodes: number[]; dataIndex: number }> = [];
      for (let dataIndex = 0; dataIndex < graph.edgeData.count(); dataIndex++) {
        const host = graph.edgeData.getItemGraphicEl(dataIndex);
        const edge = graph.getEdgeByIndex(dataIndex);
        if (!isLabelHost(host) || host.textConfig?.local !== false || edge == null) {
          continue;
        }
        edges.push({ host, nodes: [edge.node1.dataIndex, edge.node2.dataIndex], dataIndex });
      }
      if (edges.length === 0) {
        return;
      }

      // Give each host its anchoring back before anything is measured: the box below is the
      // transform this decides.
      for (const { host } of edges) {
        host.setTextConfig({ local: true });
        // The host is already dirty from the rewrite, but saying so is what makes the repair
        // independent of that: only a dirty host re-runs `updateInnerText`, which reads
        // `local`.
        host.markRedraw();
      }

      // Every other label the stage manages — the node names it has already arbitrated,
      // which these yield to.
      const edgeHosts = new Set(edges.map(({ host }) => host));
      const taken: LabelBox[] = [];
      group.traverse((element) => {
        if (isLabelHost(element) && element.textConfig?.local === false && !edgeHosts.has(element)) {
          const box = labelBox(element);
          if (box != null) {
            taken.push(box);
          }
        }
      });

      for (const { host, nodes, dataIndex } of edges) {
        const box = labelBox(host);
        if (box == null) {
          continue;
        }
        if (!taken.some((other) => overlaps(box, other))) {
          taken.push(box);
          continue;
        }
        const label = hideLabel(host);
        if (label == null) {
          continue;
        }
        // Under the edge itself and under both of its nodes: hovering any of the three is
        // asking about this value.
        const keys = [
          markKey(seriesModel.seriesIndex, 'edge', dataIndex),
          ...nodes.map((node) => markKey(seriesModel.seriesIndex, 'node', node)),
        ];
        for (const key of keys) {
          revealed.set(key, [...(revealed.get(key) ?? []), label]);
        }
      }
    });

    // Replaced wholesale: this render re-decided every label, so whatever was on screen for
    // the last one is gone with it (a render resets `ignore` through `setLabelStyle`).
    setRevealIndex(api.getZr(), revealed);
  });
}

/**
 * Show the hidden edge values that belong to `focus` — an edge's own value, or the values of
 * every edge touching a node — and put back the ones shown for whatever was focused before.
 * A `focus` that is neither, including nothing at all, reveals nothing, which is also the
 * whole of "put them back".
 *
 * Called by the tooltip controller, because it is the only place that knows both halves of
 * "focused": the cursor, and a pin that outranks it.
 */
export function revealEdgeLabelsFor(zr: object, focus: FocusedMark | null): void {
  const state = charts.get(zr);
  if (state == null) {
    return;
  }
  state.shownFor =
    (focus?.dataType === 'node' || focus?.dataType === 'edge') && focus.seriesIndex != null && focus.dataIndex != null
      ? markKey(focus.seriesIndex, focus.dataType, focus.dataIndex)
      : null;
  applyReveal(state);
}

/** Set a label's visibility, repainting only when it is actually changing. */
function show(label: LabelText, visible: boolean): void {
  const ignore = !visible;
  if (label.ignore !== ignore) {
    label.ignore = ignore;
    label.markRedraw();
  }
}

/** The chart item a reveal is resolved against; the shape a hover or a pin reports. */
export interface FocusedMark {
  seriesIndex?: number;
  dataIndex?: number;
  dataType?: string;
}

/** Hidden edge labels, keyed by every mark that should bring them back — see {@link markKey}. */
type RevealIndex = Map<string, LabelText[]>;

interface ChartState {
  revealed: RevealIndex;
  /** The labels on screen because their mark is focused, so they can be put back. */
  shown: LabelText[];
  /** Which mark asked for them, so a re-render can ask the new labels the same question. */
  shownFor: string | null;
}

/**
 * Per chart, keyed by its ZRender instance — the one object the render pass (`api.getZr()`)
 * and the hover handling (`chart.getZr()`) both hold, and weakly, so a disposed chart's
 * labels are not kept alive by this.
 */
const charts = new WeakMap<object, ChartState>();

const markKey = (seriesIndex: number, dataType: 'node' | 'edge', dataIndex: number) =>
  `${seriesIndex}:${dataType}:${dataIndex}`;

/**
 * Adopt this render's hidden labels, and put back on screen whatever the focused mark was
 * already asking for.
 *
 * The re-assert is not housekeeping: a render re-decides every label from scratch (it resets
 * `ignore` through `setLabelStyle`, and the elements themselves may be new), while a hover or
 * a pin outlives it. Without this, a dashboard refreshing under a pinned node would drop the
 * value it was pinned to read, with no cursor event left to bring it back.
 */
function setRevealIndex(zr: object, revealed: RevealIndex): void {
  const state: ChartState = { revealed, shown: [], shownFor: charts.get(zr)?.shownFor ?? null };
  charts.set(zr, state);
  applyReveal(state);
}

/** Bring `state.shownFor`'s labels on screen and take the previous ones off. */
function applyReveal(state: ChartState): void {
  const next = state.shownFor == null ? [] : (state.revealed.get(state.shownFor) ?? []);
  for (const label of state.shown) {
    if (!next.includes(label)) {
      show(label, false);
    }
  }
  state.shown = next;
  for (const label of next) {
    show(label, true);
  }
}

/**
 * An element with a label attached, narrowed to what is read here. ECharts' public types
 * describe `Element` without the label plumbing zrender puts on it (`updateInnerText`,
 * `innerTransformable`), and these repairs are entirely about that plumbing.
 */
interface LabelHost {
  textConfig?: { local?: boolean; position?: unknown };
  setTextConfig(config: { local: boolean }): void;
  markRedraw(): void;
  getTextContent(): LabelText | null;
  /** Where a host that positions its own label does so — zrender calls it before drawing. */
  beforeUpdate(): void;
  /** Turns that position into the transform the label is drawn with. */
  updateInnerText(forceUpdate?: boolean): void;
  getComputedTransform(): number[] | null;
}

interface LabelText {
  ignore?: boolean;
  markRedraw(): void;
  getBoundingRect(): { x: number; y: number; width: number; height: number };
  getComputedTransform(): number[] | null;
}

/** The graph model's two answers this needs: the link elements, and what they join. */
interface GraphModel {
  edgeData: { count(): number; getItemGraphicEl(dataIndex: number): unknown };
  getEdgeByIndex(dataIndex: number): { node1: { dataIndex: number }; node2: { dataIndex: number } } | undefined;
}

/** A label's box as its four corners in canvas coordinates — rotated, so not a rect. */
type LabelBox = ReadonlyArray<readonly [number, number]>;

/**
 * The series' graph, or `null` for a series that has none. Checked at runtime rather than
 * asserted: `getGraph` is not on the `SeriesModel` type the lifecycle hook is handed, and
 * "is this a graph" is exactly the question being asked.
 */
function readGraph(seriesModel: unknown): GraphModel | null {
  if (typeof seriesModel !== 'object' || seriesModel === null || !('getGraph' in seriesModel)) {
    return null;
  }
  const { getGraph } = seriesModel;
  if (typeof getGraph !== 'function') {
    return null;
  }
  const graph: unknown = getGraph.call(seriesModel);
  if (typeof graph !== 'object' || graph === null || !('edgeData' in graph) || !('getEdgeByIndex' in graph)) {
    return null;
  }
  const { edgeData, getEdgeByIndex } = graph;
  if (typeof getEdgeByIndex !== 'function' || typeof edgeData !== 'object' || edgeData === null) {
    return null;
  }
  if (!('count' in edgeData) || !('getItemGraphicEl' in edgeData)) {
    return null;
  }
  const { count, getItemGraphicEl } = edgeData;
  if (typeof count !== 'function' || typeof getItemGraphicEl !== 'function') {
    return null;
  }
  return {
    edgeData: {
      count: () => Number(count.call(edgeData)),
      getItemGraphicEl: (dataIndex: number): unknown => getItemGraphicEl.call(edgeData, dataIndex),
    },
    getEdgeByIndex: (dataIndex: number) => {
      const edge: unknown = getEdgeByIndex.call(graph, dataIndex);
      return isGraphEdge(edge) ? edge : undefined;
    },
  };
}

function isGraphEdge(edge: unknown): edge is { node1: { dataIndex: number }; node2: { dataIndex: number } } {
  return (
    typeof edge === 'object' &&
    edge !== null &&
    'node1' in edge &&
    'node2' in edge &&
    hasDataIndex(edge.node1) &&
    hasDataIndex(edge.node2)
  );
}

function hasDataIndex(node: unknown): node is { dataIndex: number } {
  return typeof node === 'object' && node !== null && 'dataIndex' in node && typeof node.dataIndex === 'number';
}

/**
 * Whether an element carries the label plumbing read here. Checked at runtime rather than
 * asserted, because that plumbing is exactly the part ECharts' public `Element` type does
 * not describe — so there is nothing to narrow *from*.
 */
function isLabelHost(element: unknown): element is LabelHost {
  return (
    typeof element === 'object' &&
    element !== null &&
    'getTextContent' in element &&
    typeof element.getTextContent === 'function' &&
    'updateInnerText' in element &&
    typeof element.updateInnerText === 'function'
  );
}

/**
 * Where a label will be painted, as the box it will occupy.
 *
 * Settled first, because that is the whole point: `beforeUpdate` is where a host places its
 * own label (for a link, along the line), and `updateInnerText` is what turns that
 * placement into the transform the label is drawn with. Both run again during zrender's own
 * traversal, so calling them early only moves work forward. `getComputedTransform` on the
 * host is what makes its own transform current first, since the label's is composed from it.
 *
 * Returns `null` for a label that is not being drawn — including one the stage has already
 * dropped, which must not be un-dropped or counted as occupying space.
 */
function labelBox(host: LabelHost): LabelBox | null {
  const label = host.getTextContent();
  if (label == null || label.ignore === true) {
    return null;
  }
  host.getComputedTransform();
  host.beforeUpdate();
  host.updateInnerText(true);

  const rect = label.getBoundingRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return null;
  }
  const corners: Array<readonly [number, number]> = [
    [rect.x, rect.y],
    [rect.x + rect.width, rect.y],
    [rect.x + rect.width, rect.y + rect.height],
    [rect.x, rect.y + rect.height],
  ];
  const m = label.getComputedTransform();
  if (m == null) {
    return corners;
  }
  return corners.map(([x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]] as const);
}

/**
 * Whether two label boxes overlap, by the separating-axis test: two convex shapes miss each
 * other exactly when some axis perpendicular to one of their edges separates their
 * projections.
 *
 * Exact for rotated rectangles, which is the reason for it — an edge label is rotated to lie
 * along its link, and the axis-aligned box around a 45° one is nearly three times too tall,
 * which would drop values that are plainly readable side by side.
 */
function overlaps(a: LabelBox, b: LabelBox): boolean {
  for (const [first, second] of [
    [a, b],
    [b, a],
  ] as const) {
    for (let i = 0; i < first.length; i++) {
      const [x1, y1] = first[i];
      const [x2, y2] = first[(i + 1) % first.length];
      // The edge's normal; projections onto it are compared unnormalised, since only the
      // ordering of the two intervals matters.
      const axis = [y1 - y2, x2 - x1] as const;
      const project = (box: LabelBox) => {
        const values = box.map(([x, y]) => x * axis[0] + y * axis[1]);
        return { min: Math.min(...values), max: Math.max(...values) };
      };
      const one = project(first);
      const other = project(second);
      if (one.max <= other.min || other.max <= one.min) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Drop a label from the render. `ignore` rather than `invisible`, so it leaves the display
 * list rather than staying in it as an unpainted hover target — and written from here alone,
 * never through a state, so the state machine has no saved value to put back (see
 * {@link revealEdgeLabelsFor}). Returns the label, which the reveal index keeps.
 */
function hideLabel(host: LabelHost): LabelText | null {
  const label = host.getTextContent();
  if (label == null || label.ignore === true) {
    return null;
  }
  label.ignore = true;
  label.markRedraw();
  return label;
}
