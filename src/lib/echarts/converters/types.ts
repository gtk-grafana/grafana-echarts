import type { Field } from '@grafana/data';
import { type CategoryAxisBaseOption } from 'echarts/types/src/coord/axisCommonTypes';
import { type CartesianOption } from 'lib/echarts/charts/types';

/**
 * The two data-dependent pieces a category-axis cartesian chart needs: the
 * shared `categories` (x-axis labels) and the `series`. The caller merges these
 * into a base cartesian option with `xAxis.type: 'category'`.
 *
 * Generic over the series option so it is shared by both the single-value
 * category converter (default: one line/bar/scatter series per numeric field)
 * and the multi-value converter (a single candlestick/boxplot series).
 */
export interface CategoryCartesianData<S = CartesianOption['series']> {
  categories: CategoryAxisBaseOption['data'];
  series: S;
}
/**
 * One resolved pie slice, shared by the chart, DOM legend, and tooltip so all
 * three agree on the same slice set, values, colors, and hidden state (rather
 * than each re-deriving the selection and drifting).
 */
export interface PieSliceModel {
  /** Slice label: the reduced field's display name (Calculate) or a row name (All values). */
  name: string;
  /** Reduced slice value; `undefined` when the reduction is non-finite (empty/all-null). */
  value: number | undefined;
  /** Resolved slice/swatch color (a fixed-color override always wins). */
  color: string;
  /** Hidden via the legend visibility toggle; kept in the model so the legend can grey it. */
  hidden: boolean;
  /**
   * A single-value numeric field carrying this slice's value plus the source
   * field's unit/decimals config, for the legend's calc columns
   * (`getCalcDisplayValues`) — a slice is one value, so any reducer resolves to it.
   */
  field: Field;
}
