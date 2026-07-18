import { FieldColorModeId, FieldConfigProperty, PanelPlugin } from '@grafana/data';
import { commonOptionsBuilder } from '@grafana/ui';
import { type EChartsFieldConfig } from 'editor/types';
import { makeLazyPanel } from 'lib/components/LazyPanel';
import { type PanelOptions } from 'types';
import { partToWholeSuggestionsSupplier } from './suggestions';

// Part-to-whole family panel: pie built from the categorical model
// (one value per category). The family is fixed to `pie`; the shared Panel
// resolves the pie chart module. funnel/gauge render types are roadmap.
export const plugin = new PanelPlugin<PanelOptions, EChartsFieldConfig>(makeLazyPanel('part-to-whole'))
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
    // Register `custom.hideFrom` so the legend visibility toggle's `byName`
    // override is applied by Grafana (unregistered override properties are
    // skipped). Pie slices are rows of one field, so the converter reads the
    // hidden set by name (see `lib/grafana/fields/seriesConfig.ts`).
    useCustomConfig: (builder) => {
      commonOptionsBuilder.addHideFrom(builder);
    },
  })
  .setPanelOptions((builder) => {
    commonOptionsBuilder.addLegendOptions(builder);
    commonOptionsBuilder.addTooltipOptions(builder);

    return builder;
  })
  // Advertise fitness for numeric/instant data
  .setSuggestionsSupplier(partToWholeSuggestionsSupplier);
