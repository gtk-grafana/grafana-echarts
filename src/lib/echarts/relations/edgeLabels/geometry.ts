/** An element with a label attached, narrowed to what is read here. */
export interface LabelHost {
  textConfig?: { local?: boolean; position?: unknown };
  setTextConfig(config: { local: boolean }): void;
  markRedraw(): void;
  getTextContent(): LabelText | null;
  /** Update the label position before zrender draws it. */
  beforeUpdate(): void;
  /** Turns that position into the transform the label is drawn with. */
  updateInnerText(forceUpdate?: boolean): void;
  getComputedTransform(): number[] | null;
  /** Disable zrender label animation. */
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

/** A label's box as its four corners in canvas coordinates. rotated, so not a rect. */
export type LabelBox = ReadonlyArray<readonly [number, number]>;

/** The series' graph, or `null` for a series that has none. */
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

/** Check whether an element hosts a label. */
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

/** Return the box that a label occupies. */
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

/** Check whether two label boxes overlap. */
export function overlaps(a: LabelBox, b: LabelBox): boolean {
  for (const [first, second] of [
    [a, b],
    [b, a],
  ] as const) {
    for (let i = 0; i < first.length; i++) {
      const [x1, y1] = first[i];
      const [x2, y2] = first[(i + 1) % first.length];
      // Compare projections on the edge normal.
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

/** Drop a label from the render. */
export function hideLabel(host: LabelHost): LabelText | null {
  const label = host.getTextContent();
  if (label == null || label.ignore === true) {
    return null;
  }
  label.ignore = true;
  label.markRedraw();
  return label;
}
