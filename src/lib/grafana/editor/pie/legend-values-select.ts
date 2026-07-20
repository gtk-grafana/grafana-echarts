import { type PanelOptionsEditorBuilder, type SelectFieldConfigSettings } from '@grafana/data';
import { pieLegendCategoryName, pieLegendValueOptions, pieLegendValuesPath } from 'editor/constants';
import { type PieLegendValue } from 'editor/types';
import { type PanelOptions } from 'types';

/**
 * Register the pie "Legend values" multi-select (Percent / Value) — Grafana Pie
 * chart parity for the legend value columns. Replaces the standard reducer
 * "Values" stats-picker (dropped by passing `includeLegendCalcs: false` to
 * `commonOptionsBuilder.addLegendOptions`), which is meaningless for a pie: each
 * slice is already a single value. The selected set drives `buildPieLegendItems`;
 * the default is none (slice names only, `PIE_LEGEND_VALUES_DEFAULT`).
 *
 * Placed in the standard "Legend" category so it sits with the other legend
 * options. The generic is pinned to the single-option type `PieLegendValue`
 * (`addMultiSelect` types `defaultValue`/`settings.options` with that same,
 * non-array type), and `defaultValue` is omitted — the natural default is no
 * selection (slice names only), and passing an array default would mis-infer the
 * option type (see the "Labels" control and `PIE_LEGEND_VALUES_DEFAULT`, which the
 * render path uses as the fallback).
 */
export function addPieLegendValueOptions(builder: PanelOptionsEditorBuilder<PanelOptions>) {
  builder.addMultiSelect<PieLegendValue, SelectFieldConfigSettings<PieLegendValue>>({
    path: pieLegendValuesPath,
    name: 'Legend values',
    category: [pieLegendCategoryName],
    description: 'Values to show in the legend for each slice',
    settings: {
      options: pieLegendValueOptions,
    },
    showIf: (options) => options.legend?.showLegend !== false,
  });
}
