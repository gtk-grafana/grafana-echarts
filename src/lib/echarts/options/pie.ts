import { type GrafanaTheme2 } from '@grafana/data';
import { type PieSeriesOption } from 'echarts';
import { type ECBasicOption } from 'echarts/types/dist/shared';
import { createBaseOptions, getThemeTextStyle } from 'lib/echarts/options/base';

/** Base option for pie charts. Series data is merged at render time. */
export const pieDefaultOptions: ECBasicOption = {
  ...createBaseOptions({ includeLegend: true }),
};

/**
 * Themed pie slice label: Grafana's font family and primary text color, with the
 * default text shadow/stroke zeroed out. ECharts' default label draws a blurred
 * shadow and a contrast stroke ("awful text shadow") in its own font; clearing
 * them and applying the theme makes labels match the rest of Grafana.
 * https://echarts.apache.org/en/option.html#series-pie.label
 */
export function getPieLabelStyle(theme: GrafanaTheme2): PieSeriesOption['label'] {
  return {
    ...getThemeTextStyle(theme),
    textShadowBlur: 0,
    textShadowColor: 'transparent',
    textBorderWidth: 0,
  };
}
