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
