import { type LabelText } from 'lib/echarts/relations/edgeLabels/geometry';

/**
 * Which edge labels are revealed regardless of overlap, because the mark they belong to is
 * the focused one.
 *
 * Per-chart state in a `WeakMap`, so a disposed chart's index is collected with it. The
 * tooltip controller is the only writer — it is the only thing that knows what is focused.
 */

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
export type RevealIndex = Map<string, LabelText[]>;

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

export const markKey = (seriesIndex: number, dataType: 'node' | 'edge', dataIndex: number) =>
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
export function setRevealIndex(zr: object, revealed: RevealIndex): void {
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
