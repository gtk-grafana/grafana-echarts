import { type ECElementEvent } from 'echarts/core';
import { type SeriesPoints } from 'lib/echarts/tooltip/proximity';
import { type EChartsTooltipTrigger, type TooltipModel, type TooltipSink } from 'lib/echarts/tooltip/types';

export interface EChartsTooltipState {
  /** The hovered content, or `null` when nothing is hovered. */
  model: TooltipModel | null;
  /** Cursor position in window coordinates. */
  position: { x: number; y: number } | null;
  visible: boolean;
  /** Whether the user has click-to-pinned the tooltip (freezes content, enables interaction). */
  pinned: boolean;
  /**
   * The chart element that was clicked to pin, when the click landed on one. Lets
   * the overlay pick the clicked row's footer source in multi-row ("All")
   * tooltips, mirroring core's hovered-series footer. `null` when pinned from an
   * empty-grid click.
   *
   * Only the indices are kept, not the whole `ECElementEvent` — that would retain
   * the ZRender event and its DOM node for as long as the tooltip stays pinned.
   *
   * `dataType` discriminates the two data tables a graph-like series (graph /
   * sankey / chord) exposes: `'node'` vs `'edge'`. Without it a `dataIndex` is
   * ambiguous, and edge 3 is indistinguishable from node 3.
   */
  pinnedItem: Pick<ECElementEvent, 'seriesIndex' | 'dataIndex' | 'dataType'> | null;
  /**
   * The proximity-focused series, or `null` when none is within the focus band.
   *
   * Drives the bold ("active") row in multi-row "All" tooltips, mirroring core,
   * where the emphasised row is the vertically nearest series — not whichever
   * element ECharts happens to consider hovered. Kept separate from `model` so
   * it survives the two arriving in either order: in axis mode ECharts rebuilds
   * the model from its own mousemove handling, independently of this hook's.
   */
  activeSeriesIndex: number | null;
}

export interface EChartsTooltipOptions {
  /**
   * Per-series values enabling Grafana-parity proximity hover (see
   * `lib/echarts/tooltip/proximity`). Omit — or pass an empty array — to fall
   * back to ECharts' native hit-testing, which is what non-cartesian families
   * (pie, treemap, heatmap) want.
   */
  series?: readonly SeriesPoints[];
  /** Core's "Hover proximity" (px); see `findHoveredPoint`. */
  hoverProximity?: number;
}

export interface EChartsTooltipController {
  state: EChartsTooltipState;
  /** Stable sink passed into `buildPanelChartOption`; receives hovered content each move. */
  sink: TooltipSink;
  /** Report the resolved ECharts tooltip `trigger` after each `setOption` (drives hide behavior). */
  reportTrigger: (trigger: EChartsTooltipTrigger) => void;
  /** Dismiss a pinned tooltip (used by the overlay's close affordances). */
  dismiss: () => void;
}
