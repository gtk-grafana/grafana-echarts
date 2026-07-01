import { FieldColorModeId, FieldConfigProperty, PanelPlugin, SelectableValue } from '@grafana/data';
import { TooltipDisplayMode } from '@grafana/schema';
import { commonOptionsBuilder } from '@grafana/ui';
import { seriesCategoryName, seriesTypeName, seriesTypePath } from 'editor/series';
import { EChartsFieldConfig, SeriesType } from 'editor/types';
import { Panel } from 'components/Panel';
import { PanelOptions } from 'types';

// Multivariate family panel (Group 6): radar built from the categorical model
// (categories -> indicators, series -> polygons). The family is fixed to
// `radar`; the shared Panel resolves the radar chart module. parallel is
// roadmap.
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
    builder.addSelect({
      path: seriesTypePath,
      name: seriesTypeName,
      defaultValue: 'radar' as SeriesType,
      settings: {
        options: [{ value: 'radar', label: 'radar' }] as Array<SelectableValue<SeriesType>>,
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
