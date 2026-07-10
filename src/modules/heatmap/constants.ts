import { type SelectableValue } from '@grafana/data';

import { type HeatmapColorScheme, type HeatmapLayout } from 'lib/echarts/options/types';

export const heatmapColorSchemeOptions: Array<SelectableValue<HeatmapColorScheme>> = [
  { value: 'spectral', label: 'Spectral' },
  { value: 'turbo', label: 'Turbo' },
  { value: 'blues', label: 'Blues' },
  { value: 'magma', label: 'Magma' },
];

export const heatmapLayoutOptions: Array<SelectableValue<HeatmapLayout>> = [
  { value: 'binned', label: 'Binned' },
  { value: 'matrix', label: 'Matrix' },
];
