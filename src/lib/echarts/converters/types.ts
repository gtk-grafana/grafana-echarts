import { type CategoryAxisBaseOption } from 'echarts/types/src/coord/axisCommonTypes';
import { type CartesianOption } from 'lib/echarts/charts/types';

/**
 * The two data-dependent pieces a category-axis cartesian chart needs: the
 * shared `categories` (x-axis labels) and one `series` per numeric field. The
 * caller merges these into a base cartesian option with `xAxis.type: 'category'`.
 */
export interface CategoryCartesianData {
  categories: CategoryAxisBaseOption['data'];
  series: CartesianOption['series'];
}
