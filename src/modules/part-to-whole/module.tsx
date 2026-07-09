import { FieldColorModeId, FieldConfigProperty, PanelPlugin, type SelectableValue } from '@grafana/data';
import { TooltipDisplayMode } from '@grafana/schema';
import { commonOptionsBuilder } from '@grafana/ui';
import { seriesCategoryName, seriesTypeName, seriesTypePath } from 'editor/constants';
import { type EChartsFieldConfig, type SeriesType } from 'editor/types';
import { LazyPanel } from 'lib/components/LazyPanel';
import { partToWholeSuggestionsSupplier } from './suggestions';
import { type PanelOptions } from 'types';

// Part-to-whole family panel: pie built from the categorical model
// (one value per category). The family is fixed to `pie`; the shared Panel
// resolves the pie chart module. funnel/gauge render types are roadmap.
export const plugin = new PanelPlugin<PanelOptions, EChartsFieldConfig>(LazyPanel)
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
      defaultValue: 'pie' as SeriesType,
      settings: {
        options: [{ value: 'pie', label: 'pie' }] as Array<SelectableValue<SeriesType>>,
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
  })
  // Advertise fitness for numeric/instant data
  .setSuggestionsSupplier(partToWholeSuggestionsSupplier);
