import { FieldColorModeId, FieldConfigProperty, PanelPlugin } from '@grafana/data';
import { TooltipDisplayMode } from '@grafana/schema';
import { commonOptionsBuilder } from '@grafana/ui';
import {
  cartesianOverrideOptions,
  cartesianSeriesTypeOptions,
  seriesCategoryName,
  seriesTypeDefault,
  seriesTypeName,
  seriesTypePath,
} from 'editor/constants';
import { type EChartsGraphFieldConfig } from 'editor/types';
import { LazyPanel } from 'lib/components/LazyPanel';
import { type PanelOptions } from 'types';
import { cartesianSuggestionsSupplier } from './suggestions';

// Cartesian family panel: line/bar/scatter on a time/value grid.
// The family is fixed by this nested plugin's identity, so the panel-level
// picker only offers cartesian render types. Which family fits the data is advertised via the Suggestions
// supplier below.
//
// This panel is cartesian-only: mixing stays within the family via the
// per-field override below (e.g. one field as `bar`, others as `line`).
// Cross-family mixing (e.g. heatmap + line) is reserved for the composite
// heatmap panel, so heatmap frames never route here.
export const plugin = new PanelPlugin<PanelOptions, EChartsGraphFieldConfig>(LazyPanel)
  // Standard field config options (Color scheme, Unit, Decimals, Min, Max,
  // Display name, No value, Thresholds, Value mappings, Data links). Grafana
  // includes the full set by default and applies them to every field in
  // `data.series` before the panel renders; here we only customize Color.
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
    // Per-field series type override. Combined with Grafana field overrides
    // (by name, regex, type, or query), this lets a single panel mix cartesian
    // types, e.g. drawing one field as `bar` and another as `line`. Unset
    // fields fall back to the panel-level series type.
    useCustomConfig: (builder) => {
      builder.addSelect({
        path: 'seriesType',
        name: 'Series type',
        description: 'Override the panel series type for matching fields (cartesian types only).',
        settings: {
          options: cartesianOverrideOptions,
          allowCustomValue: false,
          isClearable: true,
        },
      });
    },
  })
  .setPanelOptions((builder) => {
    builder
      // Panel-level render type, scoped to the cartesian family. Fields can
      // override this individually via the per-field override above.
      .addSelect({
        path: seriesTypePath,
        name: seriesTypeName,
        defaultValue: seriesTypeDefault,
        settings: {
          options: cartesianSeriesTypeOptions,
        },
        category: [seriesCategoryName],
      });

    // Standard Core Grafana "Legend" options (Visibility, Mode, Placement,
    // Width, Limit, Values), registered in their own category.
    commonOptionsBuilder.addLegendOptions(builder);

    // Tooltip mode maps to the ECharts native tooltip trigger (see
    // `tooltipTriggerForMode`): Single hovers a single item, All shares the x
    // axis, Hidden disables the tooltip. The richer Core Grafana tooltip options
    // (sort, hide zeros, size) are omitted because ECharts renders its own box.
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
  // Advertise fitness for the current data shape (opts in via
  // `"suggestions": true` in plugin.json).
  .setSuggestionsSupplier(cartesianSuggestionsSupplier);
