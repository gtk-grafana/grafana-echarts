import { FieldColorModeId, FieldConfigProperty, PanelPlugin } from '@grafana/data';
import { initPluginTranslations } from '@grafana/i18n';
import { commonOptionsBuilder } from '@grafana/ui';
import { PIE_CALC_DEFAULT } from 'editor/constants';
import { type EChartsFieldConfig } from 'editor/types';
import { makeLazyPanel } from 'lib/components/LazyPanel';
import { addStandardDataReduceOptions } from 'lib/grafana/editor/common/standardReducer';
import { addPieLabelOptions } from 'lib/grafana/editor/pie/label-select';
import { addPieSortOptions } from 'lib/grafana/editor/pie/sort-select';
import { addPieTypeOptions } from 'lib/grafana/editor/pie/type-select';
import { type PanelOptions } from 'types';
import { partToWholeSuggestionsSupplier } from './suggestions';

// Needs to be called at each top-level module to prevent panels from breaking when calling grafana/i18n methods (like t())
initPluginTranslations('grafana-echarts-app');

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
    // Grafana's standard reduce options (Show / Limit / Calculation / Fields).
    // `resolvePieSlices` feeds these to `getFieldDisplayValues`: `calcs[0]` reduces
    // each slice, `values` switches Calculate vs. All values, `limit` caps
    // All-values rows, and `fields` selects which numeric fields become slices.
    // Multi-frame responses (one frame per series) yield one slice per series.
    // Long-shaped data is reshaped to wide upstream with a Group by / Rows to
    // fields transform (see provisioning/dashboards/part-to-whole). Default
    // reducer is Sum (part-to-whole), not Grafana's stat/gauge `lastNotNull`.
    addStandardDataReduceOptions(builder, true, PIE_CALC_DEFAULT);

    // Pie vs donut chart type — Grafana Pie chart parity. Rendered by `getPieRadius`.
    addPieTypeOptions(builder);

    // Slice sorting (Descending / Ascending / None) — Grafana Pie chart parity.
    // Applied by `resolvePieSlices` to the shared slice model.
    addPieSortOptions(builder);

    // Slice-label content (Name / Value / Percent) — Grafana Pie chart parity.
    // Rendered by `getPieContentLabel`.
    addPieLabelOptions(builder);

    commonOptionsBuilder.addLegendOptions(builder);
    commonOptionsBuilder.addTooltipOptions(builder);

    return builder;
  })
  // Advertise fitness for numeric/instant data
  .setSuggestionsSupplier(partToWholeSuggestionsSupplier);
