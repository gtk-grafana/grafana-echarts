import { FieldColorModeId, FieldConfigProperty, PanelPlugin, SelectableValue } from '@grafana/data';
import { TooltipDisplayMode } from '@grafana/schema';
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
import { Panel } from 'components/Panel';
import { PanelOptions } from 'types';

const heatmapColorSchemeOptions: Array<SelectableValue<HeatmapColorScheme>> = [
  { value: 'spectral', label: 'Spectral' },
  { value: 'turbo', label: 'Turbo' },
  { value: 'blues', label: 'Blues' },
  { value: 'magma', label: 'Magma' },
];

// Cartesian family panel (Groups 1-3): line/bar/scatter on a time/value grid.
// This carries over the original single-panel option builder unchanged so the
// existing behavior (including the per-field cartesian override) is preserved
// under the nested plugin id. Family-fixing (retiring the flat series-type
// dropdown, data-driven routing) is deferred to later meta-plan steps.
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
  });
