import { ECBasicOption } from 'echarts/types/dist/shared';

export const lineDefaultOptions: ECBasicOption = {
  animationDuration: 300,

  // https://echarts.apache.org/en/option.html#grid
  grid: {
    top: 'top',
    left: 'left',
    bottom: '5%',
  },

  // https://echarts.apache.org/en/option.html#tooltip
  tooltip: {
    show: true,
    trigger: 'axis',
  },

  // https://echarts.apache.org/en/option.html#xAxis
  xAxis: {
    type: 'time',
    tooltip: {
      show: true,
    },
    alignTicks: true,
  },

  // https://echarts.apache.org/en/option.html#yAxis
  yAxis: {
    type: 'value',
  },
};
