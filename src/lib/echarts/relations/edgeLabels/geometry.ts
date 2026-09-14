/**
 * The zrender-internals layer: narrowing an ECharts graph series' render tree down to the
 * label hosts, reading a label's settled bounding box out of one, and hiding it.
 *
 * None of this is public ECharts API — it reads `Line`/`Graph` internals, so this is the
 * module an ECharts upgrade breaks, and the reason it is separated from the two callers
 * above it: what to *do* about edge labels is stable, how to reach them is not.
 */

/**
 * An element with a label attached, narrowed to what is read here. ECharts' public types
 * describe `Element` without the label plumbing zrender puts on it (`updateInnerText`,
 * `innerTransformable`), and these repairs are entirely about that plumbing.
 */
export interface LabelHost {
  textConfig?: { local?: boolean; position?: unknown };
  setTextConfig(config: { local: boolean }): void;
  markRedraw(): void;
  getTextContent(): LabelText | null;
  /** Where a host that positions its own label does so — zrender calls it before drawing. */
  beforeUpdate(): void;
  /** Turns that position into the transform the label is drawn with. */
  updateInnerText(forceUpdate?: boolean): void;
  getComputedTransform(): number[] | null;
  /** zrender's own opt-out from `LabelManager`'s label animation. See {@link registerEdgeLabelFadeIn}. */
  disableLabelAnimation?: boolean;
}

export interface LabelText {
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
export type LabelBox = ReadonlyArray<readonly [number, number]>;

/**
 * The series' graph, or `null` for a series that has none. Checked at runtime rather than
 * asserted: `getGraph` is not on the `SeriesModel` type the lifecycle hook is handed, and
 * "is this a graph" is exactly the question being asked.
 */
export function readGraph(seriesModel: unknown): GraphModel | null {
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
export function isLabelHost(element: unknown): element is LabelHost {
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
export function labelBox(host: LabelHost): LabelBox | null {
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
export function overlaps(a: LabelBox, b: LabelBox): boolean {
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
export function hideLabel(host: LabelHost): LabelText | null {
  const label = host.getTextContent();
  if (label == null || label.ignore === true) {
    return null;
  }
  label.ignore = true;
  label.markRedraw();
  return label;
}
