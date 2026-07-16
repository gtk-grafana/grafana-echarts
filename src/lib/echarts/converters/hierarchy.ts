import { type DataFrame, type Field, FieldType, getDisplayProcessor, type GrafanaTheme2 } from '@grafana/data';
import { frameToCategorical } from 'lib/echarts/converters/categorical';

/**
 * A single node in the chart-agnostic hierarchy model. `value` is the cumulative
 * (flame-graph) or categorical value that sizes the node; `self` is retained for
 * the tooltip only (treemap/sunburst encode `value`, not `self`).
 */
export interface HierarchyNode {
  name: string;
  value: number | null;
  self?: number;
  children?: HierarchyNode[];
}

/** Chart-agnostic tree, ready for a treemap or sunburst series. */
export interface HierarchyData {
  roots: HierarchyNode[];
}

const LEVEL_FIELD = 'level';
const VALUE_FIELD = 'value';
const SELF_FIELD = 'self';
const LABEL_FIELD = 'label';

/**
 * True when a frame carries flame-graph nested-set data.
 *
 * Grafana routes flame graphs via `meta.preferredVisualisationType` (there is no
 * data plane `frame.meta.type`), so that is the canonical signal. As a fallback
 * we also accept the nested-set field shape (`level` + `value` + `label`), which
 * lets provisioned TestData CSV — which cannot set the meta signal — render.
 * See ../../../../data-plane/flame-graph.md.
 */
export function isFlameGraphFrame(frame: DataFrame): boolean {
  if (frame.meta?.preferredVisualisationType === 'flamegraph') {
    return true;
  }
  const hasLevel = frame.fields.some((field) => field.name === LEVEL_FIELD && field.type === FieldType.number);
  const hasValue = frame.fields.some((field) => field.name === VALUE_FIELD && field.type === FieldType.number);
  const hasLabel = frame.fields.some((field) => field.name === LABEL_FIELD);
  return hasLevel && hasValue && hasLabel;
}

/**
 * Reconstruct the call tree from a flame-graph nested-set frame.
 *
 * Rows are a depth-first traversal: `level` is the stack depth, so a deeper row
 * is a child of the previous row and an equal/shallower row is a sibling. We
 * walk rows in order, tracking the current ancestor at each depth in `stack`.
 * See ../../../../data-plane/flame-graph.md.
 */
function flameGraphToRoots(frame: DataFrame, theme: GrafanaTheme2): HierarchyNode[] {
  const levelField = frame.fields.find(
    (field): field is Field<number> => field.name === LEVEL_FIELD && field.type === FieldType.number
  );
  const valueField = frame.fields.find(
    (field): field is Field<number> => field.name === VALUE_FIELD && field.type === FieldType.number
  );
  const selfField = frame.fields.find(
    (field): field is Field<number> => field.name === SELF_FIELD && field.type === FieldType.number
  );
  const labelField = frame.fields.find((field) => field.name === LABEL_FIELD);

  if (!levelField || !valueField || !labelField) {
    return [];
  }

  // `label` may be an enum field (numeric indices); resolve through its display
  // processor so we read the text rather than the raw value.
  const resolveLabel = labelField.display ?? getDisplayProcessor({ field: labelField, theme });

  const roots: HierarchyNode[] = [];
  // stack[depth] holds the current node at that depth along the active path.
  const stack: HierarchyNode[] = [];

  for (let row = 0; row < frame.length; row++) {
    const level = levelField.values[row] ?? 0;
    const node: HierarchyNode = {
      name: resolveLabel(labelField.values[row]).text,
      value: valueField.values[row] ?? null,
    };
    if (selfField) {
      node.self = selfField.values[row] ?? undefined;
    }

    // Parent sits one level up; a missing parent (root or malformed jump) makes
    // this a new root.
    const parent = level > 0 ? stack[level - 1] : undefined;
    if (parent) {
      (parent.children ??= []).push(node);
    } else {
      roots.push(node);
    }

    stack[level] = node;
    // Drop any deeper stale ancestors from a previous, longer branch.
    stack.length = level + 1;
  }

  return roots;
}

/**
 * Convert Grafana data frames into the hierarchy tree model.
 *
 * Two input shapes are supported:
 * - Flame-graph nested-set frame: rebuilt into a multi-level tree (see
 *   `flameGraphToRoots`).
 * - Flat categorical frame: each category becomes a single top-level node valued
 *   by the first numeric field, reusing the shared categorical model (see
 *   echarts/converters/categorical.ts).
 *
 * Returns `null` when no usable data can be derived, so callers can render a
 * no-data view.
 */
export function frameToHierarchy(frames: DataFrame[], theme: GrafanaTheme2): HierarchyData | null {
  const flameFrame = frames.find(isFlameGraphFrame);
  if (flameFrame) {
    const roots = flameGraphToRoots(flameFrame, theme);
    return roots.length > 0 ? { roots } : null;
  }

  const categorical = frameToCategorical(frames, theme);
  if (!categorical) {
    return null;
  }

  const [firstSeries] = categorical.series;
  const roots = categorical.categories.map<HierarchyNode>((name, row) => ({
    name,
    value: firstSeries?.values[row] ?? null,
  }));
  return { roots };
}
