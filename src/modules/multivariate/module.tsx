import { FieldColorModeId, FieldConfigProperty, PanelPlugin } from '@grafana/data';
import { commonOptionsBuilder } from '@grafana/ui';
import { TOOLTIP_DEFAULT_OPTIONS } from 'editor/constants';
import { type EChartsFieldConfig } from 'editor/types';
import { makeLazyPanel } from 'lib/components/LazyPanel';
import { type PanelOptions } from 'types';
import { multivariateSuggestionsSupplier } from './suggestions';

// Multivariate family panel: radar built from the categorical model
// (categories -> indicators, series -> polygons). The family is fixed to
// `radar`; the shared Panel resolves the radar chart module. parallel is
// roadmap.
export const plugin = new PanelPlugin<PanelOptions, EChartsFieldConfig>(makeLazyPanel('multivariate'))
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
    // override is applied by Grafana. Each radar polygon is a numeric field, so
    // the chart strips fields flagged `hideFrom.viz` (see
    // `lib/grafana/fields/seriesConfig.ts`).
    useCustomConfig: (builder) => {
      commonOptionsBuilder.addHideFrom(builder);
    },
  })
  .setPanelOptions((builder) => {
    commonOptionsBuilder.addLegendOptions(builder);
    commonOptionsBuilder.addTooltipOptions(builder, false, false, TOOLTIP_DEFAULT_OPTIONS);
    return builder;
  })
  // Advertise fitness for multi-metric numeric data (opts in via `"suggestions": true`).
  .setSuggestionsSupplier(multivariateSuggestionsSupplier);
