import { type SelectableValue } from '@grafana/data';
import { type HeatmapColorScheme } from 'lib/echarts/options/heatmap';

export const heatmapColorSchemeOptions: Array<SelectableValue<HeatmapColorScheme>> = [
  { value: 'spectral', label: 'Spectral' },
  { value: 'turbo', label: 'Turbo' },
  { value: 'blues', label: 'Blues' },
  { value: 'magma', label: 'Magma' },
];
