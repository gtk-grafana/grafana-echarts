import { FieldColorModeId, FieldConfigProperty, PanelPlugin } from '@grafana/data';
import { TooltipDisplayMode } from '@grafana/schema';
import { commonOptionsBuilder } from '@grafana/ui';
import { seriesCategoryName, seriesTypeName, seriesTypePath } from 'editor/constants';
import { type EChartsFieldConfig } from 'editor/types';
import { LazyPanel } from 'lib/components/LazyPanel';
import { type PanelOptions } from 'types';
import { multivariateSuggestionsSupplier } from './suggestions';

// Multivariate family panel: radar built from the categorical model
// (categories -> indicators, series -> polygons). The family is fixed to
// `radar`; the shared Panel resolves the radar chart module. parallel is
// roadmap.
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
      defaultValue: 'radar',
      settings: {
        options: [{ value: 'radar', label: 'radar' }],
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
  // Advertise fitness for multi-metric numeric data (opts in via `"suggestions": true`).
  .setSuggestionsSupplier(multivariateSuggestionsSupplier);
