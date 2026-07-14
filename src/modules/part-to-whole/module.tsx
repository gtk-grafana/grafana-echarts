import { FieldColorModeId, FieldConfigProperty, PanelPlugin } from '@grafana/data';
import { TooltipDisplayMode } from '@grafana/schema';
import { commonOptionsBuilder } from '@grafana/ui';
import { type EChartsFieldConfig } from 'editor/types';
import { LazyPanel } from 'lib/components/LazyPanel';
import { type PanelOptions } from 'types';
import { partToWholeSuggestionsSupplier } from './suggestions';

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
