import { type PanelProps } from '@grafana/data';
import { type VizLegendOptions } from '@grafana/schema';
import { type SeriesType } from 'editor/types';
import { type ChartFamily } from 'lib/echarts/charts/autoSeriesType';
import { type ChartContext, type ChartModule } from 'lib/echarts/charts/types';
import { type PanelOptions } from 'types';

export interface PanelComponentProps extends PanelProps<PanelOptions> {
  /** The nested plugin's chart family resolves an automatic series type. */
  family: ChartFamily;
}

export interface ChartContentProps {
  chartModule: ChartModule;
  chartContext: ChartContext;
  resolvedLegend: VizLegendOptions;
  isVizLegend: boolean;
  seriesType: SeriesType;
  timeline: number[] | null;
  selectedTime: number | null;
  onSelectTime: (time: number) => void;
  width: number;
  height: number;
  fieldConfig: PanelComponentProps['fieldConfig'];
  timeZone: PanelComponentProps['timeZone'];
  eventBus: PanelComponentProps['eventBus'];
  onChangeTimeRange: PanelComponentProps['onChangeTimeRange'];
  onFieldConfigChange: PanelComponentProps['onFieldConfigChange'];
  onOptionsChange: PanelComponentProps['onOptionsChange'];
}
