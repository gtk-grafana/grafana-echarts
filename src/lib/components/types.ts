import { type PanelProps } from '@grafana/data';
import { type ChartFamily } from 'lib/echarts/charts/autoSeriesType';
import { type PanelOptions } from 'types';

export interface PanelComponentProps extends PanelProps<PanelOptions> {
  /** The nested plugin's chart family resolves an automatic series type. */
  family: ChartFamily;
}
