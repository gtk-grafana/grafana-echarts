import { type LabelText } from 'lib/echarts/relations/edgeLabels/geometry';

/** Show the hidden edge values that belong to `focus`. */
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

/** A chart item that can reveal labels. */
export interface FocusedMark {
  seriesIndex?: number;
  dataIndex?: number;
  dataType?: string;
}

/** Hidden edge labels keyed by the marks that reveal them. */
export type RevealIndex = Map<string, LabelText[]>;

interface ChartState {
  revealed: RevealIndex;
  /** The labels on screen because their mark is focused, so they can be put back. */
  shown: LabelText[];
  /** Mark that requested the visible labels. */
  shownFor: string | null;
}

/** Per chart, keyed by its ZRender instance. */
const charts = new WeakMap<object, ChartState>();

export const markKey = (seriesIndex: number, dataType: 'node' | 'edge', dataIndex: number) =>
  `${seriesIndex}:${dataType}:${dataIndex}`;

/** Replace hidden labels and preserve the current focus. */
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
