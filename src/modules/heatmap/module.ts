import { FieldColorModeId, FieldConfigProperty, PanelPlugin, SelectableValue } from '@grafana/data';
import { TooltipDisplayMode } from '@grafana/schema';
import { commonOptionsBuilder } from '@grafana/ui';
import { seriesCategoryName, seriesTypeName, seriesTypePath } from 'editor/series';
import { EChartsFieldConfig, SeriesType } from 'editor/types';
import { heatmapColorSchemeDefault, HeatmapColorScheme } from 'lib/echarts/options/heatmap';
import { Panel } from 'lib/components/Panel';
import { PanelOptions } from 'types';

const heatmapColorSchemeOptions: Array<SelectableValue<HeatmapColorScheme>> = [
  { value: 'spectral', label: 'Spectral' },
  { value: 'turbo', label: 'Turbo' },
  { value: 'blues', label: 'Blues' },
  { value: 'magma', label: 'Magma' },
];

// Heatmap family panel (Group 4): renders Grafana heatmap frames as ECharts
// cells. The family is fixed to `heatmap`; the shared Panel resolves the
// composite heatmap chart module. Data-driven overlay/suggestions wiring is
// deferred to later meta-plan steps.
export const plugin = new PanelPlugin<PanelOptions, EChartsFieldConfig>(Panel)
  .useFieldConfig({
    standardOptions: {
      [FieldConfigProperty.Color]: {
        settings: {
          byValueSupport: true,
          bySeriesSupport: true,
          preferThresholdsMode: false,
        },
        defaultValue: {
          mode: FieldColorModeId.PaletteClassic,
        },
      },
    },
  })
  .setPanelOptions((builder) => {
    // Family is fixed to `heatmap`; a single-option select keeps the shared
    // Panel routing to the heatmap chart module. Broader render-type choices
    // and data-driven routing are deferred to later meta-plan steps.
    builder.addSelect({
      path: seriesTypePath,
      name: seriesTypeName,
      defaultValue: 'heatmap' as SeriesType,
      settings: {
        options: [{ value: 'heatmap', label: 'heatmap' }] as Array<SelectableValue<SeriesType>>,
      },
      category: [seriesCategoryName],
    });

    builder.addSelect({
      path: 'heatmapColorScheme',
      name: 'Heatmap color scheme',
      defaultValue: heatmapColorSchemeDefault,
      settings: {
        options: heatmapColorSchemeOptions,
      },
      category: [seriesCategoryName],
    });

    commonOptionsBuilder.addLegendOptions(builder);

    builder.addRadio({
      path: 'tooltip.mode',
      name: 'Tooltip mode',
      category: ['Tooltip'],
      defaultValue: TooltipDisplayMode.Single,
      settings: {
        options: [
          { value: TooltipDisplayMode.Single, label: 'Single' },
          { value: TooltipDisplayMode.Multi, label: 'All' },
          { value: TooltipDisplayMode.None, label: 'Hidden' },
        ],
      },
    });

    return builder;
  });
