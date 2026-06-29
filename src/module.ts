import { FieldColorModeId, FieldConfigProperty, PanelPlugin, SelectableValue } from '@grafana/data';
import { initPluginTranslations } from '@grafana/i18n';
import { SortOrder, TooltipDisplayMode } from '@grafana/schema';
import { commonOptionsBuilder } from '@grafana/ui';
import {
  cartesianOverrideOptions,
  seriesCategoryName,
  seriesTypeDefault,
  seriesTypeName,
  seriesTypeOptions,
  seriesTypePath,
} from 'editor/series';
import { supportedChartSeriesTypes } from 'echarts/charts/registry';
import { EChartsFieldConfig, SeriesType } from 'editor/types';
import { heatmapColorSchemeDefault, HeatmapColorScheme } from 'echarts/options/heatmap';
import { Panel } from './components/Panel';
import { PanelOptions } from './types';

const heatmapColorSchemeOptions: Array<SelectableValue<HeatmapColorScheme>> = [
  { value: 'spectral', label: 'Spectral' },
  { value: 'turbo', label: 'Turbo' },
  { value: 'blues', label: 'Blues' },
  { value: 'magma', label: 'Magma' },
];

// import id from json?
initPluginTranslations('grafana-echarts-panel');
export const plugin = new PanelPlugin<PanelOptions, EChartsFieldConfig>(Panel)
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
      .addTextInput({
        path: 'text',
        name: 'Simple text option',
        description: 'Description of panel option',
        defaultValue: 'Default value of text input option',
      })

      // Series options
      .addSelect({
        path: seriesTypePath,
        name: seriesTypeName,
        defaultValue: seriesTypeDefault,
        settings: {
          options: seriesTypeOptions.map((opt: SelectableValue<SeriesType>) => ({
            ...opt,
            // Temporary
            isDisabled: !supportedChartSeriesTypes.includes(opt.value as SeriesType),
          })),
        },
        category: [seriesCategoryName],
      })

      // Heatmap color scheme (only applies when a Grafana heatmap frame is
      // present; the cell layer is colored by this gradient via visualMap).
      .addSelect({
        path: 'heatmapColorScheme',
        name: 'Heatmap color scheme',
        defaultValue: heatmapColorSchemeDefault,
        settings: {
          options: heatmapColorSchemeOptions,
        },
        category: [seriesCategoryName],
      });

    // Standard Core Grafana "Legend" options (Visibility, Mode, Placement,
    // Width, Limit, Values), registered in their own category.
    commonOptionsBuilder.addLegendOptions(builder);

    // Standard Core Grafana "Tooltip" options (Tooltip mode, Values sort order,
    // Hide zeros, Max width, Max height), registered in their own category.
    // `setProximity = false`: "Hover proximity" is omitted because ECharts owns
    // hit-testing and has no clean equivalent. Passing `hideZeros` in the
    // defaults surfaces the "Hide zeros" switch (it is gated on being defined).
    commonOptionsBuilder.addTooltipOptions(builder, false, false, {
      tooltip: { mode: TooltipDisplayMode.Single, sort: SortOrder.None, hideZeros: false },
    });

    return builder;
  });
