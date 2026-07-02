import { createBaseOptions } from 'lib/echarts/options/base';
import { ECBasicOption } from 'echarts/types/dist/shared';

/** Base option for radar charts. Indicator and series data are merged at render time. */
export const radarDefaultOptions: ECBasicOption = {
  ...createBaseOptions({ includeLegend: true }),
};
