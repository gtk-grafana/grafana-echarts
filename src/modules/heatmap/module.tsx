import { FieldColorModeId, FieldConfigProperty, PanelPlugin } from '@grafana/data';
import { TooltipDisplayMode } from '@grafana/schema';
import { commonOptionsBuilder } from '@grafana/ui';
import { cartesianOverrideOptions, heatmapLegendCategoryName, seriesCategoryName } from 'editor/constants';
import { type EChartsFieldConfig } from 'editor/types';
import { makeLazyPanel } from 'lib/components/LazyPanel';
import { heatmapColorSchemeDefault, heatmapLayoutDefault } from 'lib/echarts/options/constants';
import { heatmapColorSchemeOptions, heatmapLayoutOptions } from 'modules/heatmap/constants';
import { type PanelOptions } from 'types';
import { heatmapSuggestionsSupplier } from './suggestions';

// Heatmap family panel: renders Grafana heatmap frames as ECharts
// cells. The family is fixed to `heatmap`; the shared Panel resolves the
// composite heatmap chart module.
//
// This is the one composite panel, so it is the only place cross-family mixing
// is allowed: a numeric frame whose field is overridden to a cartesian type
// (line/bar/scatter) via the per-field override below is drawn as a cartesian
// overlay on top of the heatmap cells (see `frameHasCartesianOverride`).
export const plugin = new PanelPlugin<PanelOptions, EChartsFieldConfig>(makeLazyPanel('heatmap'))
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
        hideFromDefaults: true,
        settings: {
          options: cartesianOverrideOptions,
          allowCustomValue: false,
          isClearable: true,
        },
      });

      // Register `custom.hideFrom` so the legend visibility toggle's `byName`
      // override is applied by Grafana. Only the cartesian overlay series carry
      // legend items; the chart strips overlay fields flagged `hideFrom.viz`
      // (see `lib/grafana/fields/seriesConfig.ts`).
      commonOptionsBuilder.addHideFrom(builder);
    },
  })
  .setPanelOptions((builder) => {
    // Heatmap coordinate model: `binned` (continuous interval cells, the
    // dataplane default) vs `matrix` (categorical grid via native ECharts heatmap).
    builder.addRadio({
      path: 'heatmapLayout',
      name: 'Layout',
      description:
        'Binned draws dataplane heatmap frames as interval cells on continuous axes; Matrix draws a category × category grid.',
      defaultValue: heatmapLayoutDefault,
      settings: {
        options: heatmapLayoutOptions,
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

    // Placement of the ECharts visualMap (the heatmap cell color scale). Grouped
    // separately from the Grafana DOM "Legend" (which governs overlay series).
    builder.addRadio({
      path: 'heatmapColorScale.placement',
      name: 'Placement',
      description: 'Where to render the heatmap color scale (the ECharts visualMap legend).',
      defaultValue: 'right',
      settings: {
        options: [
          { value: 'right', label: 'Right' },
          { value: 'bottom', label: 'Bottom' },
          { value: 'none', label: 'None' },
        ],
      },
      category: [heatmapLegendCategoryName],
    });

    // @todo We only need this in a somewhat edge-case situation, so it really sucks that we always have to display the
    // legend in the editor UI because the field config is applied to the data frame after the panel options are already
    // built. So we don't have the field config override that we want to know if a field has been selected to render as a cartesian series.
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
  // Best fit whenever the data is tagged as a Grafana heatmap frame (opts in
  // via `"suggestions": true` in plugin.json).
  .setSuggestionsSupplier(heatmapSuggestionsSupplier);
