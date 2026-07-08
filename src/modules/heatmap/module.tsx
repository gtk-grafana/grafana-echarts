import { FieldColorModeId, FieldConfigProperty, PanelPlugin, type SelectableValue } from '@grafana/data';
import { TooltipDisplayMode } from '@grafana/schema';
import { addLegendOptions } from 'editor/legend';
import { cartesianOverrideOptions, seriesCategoryName, seriesTypeName, seriesTypePath } from 'editor/constants';
import { type EChartsFieldConfig, type SeriesType } from 'editor/types';
import { heatmapColorSchemeDefault } from 'lib/echarts/options/constants';
import { LazyPanel } from 'lib/components/LazyPanel';
import { heatmapColorSchemeOptions } from 'modules/heatmap/constants';
import { heatmapSuggestionsSupplier } from './suggestions';
import { type PanelOptions } from 'types';

// Heatmap family panel: renders Grafana heatmap frames as ECharts
// cells. The family is fixed to `heatmap`; the shared Panel resolves the
// composite heatmap chart module.
//
// This is the one composite panel, so it is the only place cross-family mixing
// is allowed: a numeric frame whose field is overridden to a cartesian type
// (line/bar/scatter) via the per-field override below is drawn as a cartesian
// overlay on top of the heatmap cells (see `frameHasCartesianOverride`).
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
    // Per-field series type override, scoped to cartesian types. Overriding a
    // numeric frame's field to line/bar/scatter promotes it from a heatmap
    // bucket row to a cartesian overlay drawn over the cells — the sanctioned
    // cross-family (heatmap + line) mix that only this composite panel owns.
    useCustomConfig: (builder) => {
      builder.addSelect({
        path: 'seriesType',
        name: 'Series type',
        description: 'Draw matching fields as a cartesian overlay on the heatmap (cartesian types only).',
        settings: {
          options: cartesianOverrideOptions,
          allowCustomValue: false,
          isClearable: true,
        },
      });
    },
  })
  .setPanelOptions((builder) => {
    // Family is fixed to `heatmap`; a single-option select keeps the shared
    // Panel routing to the heatmap chart module. Broader render-type choices
    // and data-driven routing are deferred to later meta-plan steps.
    builder.addSelect({
      path: seriesTypePath,
      name: seriesTypeName,
      defaultValue: 'heatmap' as SeriesType,
      settings: {
        options: [{ value: 'heatmap', label: 'heatmap' }] as Array<SelectableValue<SeriesType>>,
      },
      category: [seriesCategoryName],
    });

    builder.addSelect({
      path: 'heatmapColorScheme',
      name: 'Heatmap color scheme',
      defaultValue: heatmapColorSchemeDefault,
      settings: {
        options: heatmapColorSchemeOptions,
      },
      category: [seriesCategoryName],
    });

    addLegendOptions(builder);

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
  // Best fit whenever the data is tagged as a Grafana heatmap frame (opts in
  // via `"suggestions": true` in plugin.json).
  .setSuggestionsSupplier(heatmapSuggestionsSupplier);
