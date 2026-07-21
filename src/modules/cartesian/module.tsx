import { FieldColorModeId, FieldConfigProperty, PanelPlugin, type SelectFieldConfigSettings } from '@grafana/data';
import { GraphThresholdsStyleMode } from '@grafana/schema';
import { commonOptionsBuilder, getGraphFieldOptions } from '@grafana/ui';
import {
  cartesianOverrideOptionsWithAuto,
  cartesianSeriesTypeOptionsWithAuto,
  multiValueSeriesTypeOptionsWithAuto,
  seriesTypePath,
  stackSeriesName,
  stackSeriesPath,
  thresholdsCategoryName,
  thresholdsStyleModeName,
  thresholdsStyleModePath,
  TOOLTIP_DEFAULT_OPTIONS,
} from 'editor/constants';
import { type EChartsGraphFieldConfig, type SeriesTypeOption } from 'editor/types';
import { makeLazyPanel } from 'lib/components/LazyPanel';
import { addEditorModeOption } from 'lib/grafana/editor/common/editor-mode';
import { addPerformanceOptions } from 'lib/grafana/editor/common/performance-options';
import { framesLookMultiValue } from 'lib/echarts/converters/multiValueCartesian';
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
export const plugin = new PanelPlugin<PanelOptions, EChartsGraphFieldConfig>(makeLazyPanel('cartesian'))
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
      builder.addSelect<SeriesTypeOption, SelectFieldConfigSettings<SeriesTypeOption>>({
        path: seriesTypePath,
        defaultValue: 'Auto',
        name: 'Series type',
        description: 'Sets series renderer (bar, line, scatter)',
        hideFromDefaults: true,
        settings: {
          options: cartesianOverrideOptionsWithAuto,
          allowCustomValue: false,
          isClearable: true,
        },
      });

      // Per-field stack override. Only meaningful when the field renders as a
      // bar, so it is shown only when this field's Series type override is `bar`.
      // Grafana field-config `showIf` only sees this field's custom config, not
      // the panel-level series type.
      builder.addBooleanSwitch({
        path: stackSeriesPath,
        name: stackSeriesName,
        category: ['Bar chart'],
        description: 'Stack this field with other stacked bar series.',
        defaultValue: false,
        showIf: (config) => config.seriesType === 'bar',
      });

      // Per-field y-axis placement (writes the standard `axisPlacement` field
      // config; read back in `buildCartesianYAxes`). Fields are grouped onto one
      // y-axis per distinct unit; this controls which side that unit's axis draws
      // on, or hides it while still plotting the series. Core already offers
      // exactly Auto/Left/Right/Hidden here, so no options filter is needed.
      // https://grafana.com/developers/plugin-tools/
      commonOptionsBuilder.addAxisPlacement(builder);

      // Threshold display (writes the custom `thresholdsStyle.mode` field
      // config; read back in `cartesianThresholdMarks`). The standard Thresholds
      // section already edits the step values; this chooses how they render as
      // ECharts markLine/markArea overlays. Grouped with the standard Thresholds
      // category so it sits beside the steps editor. The option list is Grafana's
      // own `graphFieldOptions.thresholdsDisplayModes` (used by the core time
      // series panel), which already omits the out-of-scope per-value `Series`
      // mode. `getGraphFieldOptions()` is called (rather than the deprecated
      // `graphFieldOptions` constant) so its translated labels load correctly.
      builder.addSelect({
        path: thresholdsStyleModePath,
        name: thresholdsStyleModeName,
        category: [thresholdsCategoryName],
        defaultValue: GraphThresholdsStyleMode.Off,
        settings: {
          options: getGraphFieldOptions().thresholdsDisplayModes,
        },
      });

      // Register the standard `custom.hideFrom` field config ("Hide in area"
      // switches). Required so the legend visibility toggle's `byName` override
      // is applied by Grafana's field-override engine (unregistered override
      // properties are skipped); the chart then strips fields flagged
      // `hideFrom.viz`. See `lib/grafana/fields/seriesConfig.ts`.
      commonOptionsBuilder.addHideFrom(builder);
    },
  })
  .setPanelOptions((builder) => {
    // Editor mode (Default / Advanced) — tiers the editor surface. Registered
    // first so it renders at the top; the Advanced-gated Performance options
    // below only appear once Advanced is selected. See docs/options-modes.md.
    addEditorModeOption(builder);

    // Panel-level series type: the base render type applied to every field (the
    // per-field override above can still switch individual single-value fields).
    // 'Auto' resolves the best type from the data (see `resolveAutoSeriesType`).
    // Options are data-aware: when the frames are shaped for a multi-value type
    // (candlestick OHLC / boxplot five-number summary) only candlestick/boxplot
    // are offered; otherwise the single-value render types. This is the only
    // control that writes the panel-level `options.seriesType`, so it also lets a
    // provisioned candlestick/boxplot panel switch to another cartesian type.
    builder.addSelect<SeriesTypeOption, SelectFieldConfigSettings<SeriesTypeOption>>({
      path: seriesTypePath,
      name: 'Series type',
      description: 'Base render type for the panel. Auto picks the best fit from the data.',
      defaultValue: 'Auto',

      settings: {
        options: cartesianSeriesTypeOptionsWithAuto,
        getOptions: (context) =>
          Promise.resolve(
            framesLookMultiValue(context.data) ? multiValueSeriesTypeOptionsWithAuto : cartesianOverrideOptionsWithAuto
          ),
        allowCustomValue: false,
      },
    });

    // Standard Core Grafana "Legend" options (Visibility, Mode, Placement,
    // Width, Limit, Values), registered in their own category.
    commonOptionsBuilder.addLegendOptions(builder);
    commonOptionsBuilder.addTooltipOptions(builder, false, false, TOOLTIP_DEFAULT_OPTIONS);

    // Advanced-gated performance overrides (Show points / Downsampling /
    // Animation). ECharts' big-data levers are auto-tuned above density
    // thresholds; these let power users override the auto behavior. Cartesian
    // only — the time-series fast path doesn't apply to the other families.
    addPerformanceOptions(builder);

    return builder;
  })
  // Advertise fitness for the current data shape (opts in via
  // `"suggestions": true` in plugin.json).
  .setSuggestionsSupplier(cartesianSuggestionsSupplier);
