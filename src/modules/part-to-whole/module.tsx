import { FieldColorModeId, FieldConfigProperty, PanelPlugin } from '@grafana/data';
import { commonOptionsBuilder } from '@grafana/ui';
import {
  PIE_CALC_DEFAULT,
  PIE_FORMAT_DEFAULT,
  pieCalcOptions,
  pieCalcPath,
  pieCategoryName,
  pieFormatOptions,
  pieFormatPath,
} from 'editor/constants';
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
    // Frame shape: `wide` (each numeric field is a slice, matching Grafana's core
    // pie default) vs `long` (first string field is the category, rows aggregated
    // per category). See `resolvePieSlices`.
    builder.addRadio({
      path: pieFormatPath,
      name: 'Format',
      description:
        'Wide draws one slice per numeric field (Grafana default); Long uses the first string field as the category and aggregates rows per category.',
      defaultValue: PIE_FORMAT_DEFAULT,
      settings: {
        options: pieFormatOptions,
      },
      category: [pieCategoryName],
    });

    // Reducer collapsing each slice to a single value: every numeric field in
    // wide mode, each category group in long mode.
    builder.addSelect({
      path: pieCalcPath,
      name: 'Calculation',
      description: 'How each slice is reduced to a single value (wide: per field; long: per category group).',
      defaultValue: PIE_CALC_DEFAULT,
      settings: {
        options: pieCalcOptions,
      },
      category: [pieCategoryName],
    });

    commonOptionsBuilder.addLegendOptions(builder);
    commonOptionsBuilder.addTooltipOptions(builder);

    return builder;
  })
  // Advertise fitness for numeric/instant data
  .setSuggestionsSupplier(partToWholeSuggestionsSupplier);
