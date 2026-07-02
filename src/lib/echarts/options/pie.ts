import { createBaseOptions } from 'lib/echarts/options/base';
import { type ECBasicOption } from 'echarts/types/dist/shared';

/** Base option for pie charts. Series data is merged at render time. */
export const pieDefaultOptions: ECBasicOption = {
  ...createBaseOptions({ includeLegend: true }),
};
