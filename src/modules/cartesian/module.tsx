import { FieldColorModeId, FieldConfigProperty, FieldType, PanelPlugin } from '@grafana/data';
import { TooltipDisplayMode } from '@grafana/schema';
import { commonOptionsBuilder } from '@grafana/ui';
import {
  barBorderTypeOptions,
  barOverrideCategory,
  barSizeCategory,
  barSpacingCategory,
  barStyleCategory,
  cartesianOverrideOptions,
  cartesianSeriesTypeOptions,
  seriesCategoryName,
  seriesTypeDefault,
  seriesTypeName,
  seriesTypePath,
  stackSeriesName,
  stackSeriesPath,
} from 'editor/constants';
import { type EChartsFieldConfig } from 'editor/types';
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
export const plugin = new PanelPlugin<PanelOptions, EChartsFieldConfig>(LazyPanel)
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

      // Per-field stack override. Only meaningful when the field renders as a
      // bar, so it is shown only when this field's Series type override is `bar`.
      // Grafana field-config `showIf` only sees this field's custom config, not
      // the panel-level series type.
      builder.addBooleanSwitch({
        path: stackSeriesPath,
        name: stackSeriesName,
        description: 'Stack this field with other stacked bar series.',
        defaultValue: false,
        showIf: (config) => config.seriesType === 'bar',
      });

      // Per-field bar rendering overrides. `showIf` can only see this field's
      // own custom config (not the panel-level series type), so these are shown
      // unless the field is explicitly overridden to a non-bar type; they only
      // affect series that actually render as `bar`. `gap`/`categoryGap` are
      // omitted because they are coordinate-system-global (panel-level only).
      const showBarOverride = (config: EChartsFieldConfig) =>
        config.seriesType == null || config.seriesType === 'bar';
      builder
        .addNumberInput({
          path: 'bar.width',
          name: 'Bar width',
          description: 'Bar width in pixels.',
          category: [barOverrideCategory],
          settings: { placeholder: 'Auto', min: 0 },
          shouldApply: (field) => field.type === FieldType.number,
          showIf: showBarOverride,
        })
        .addNumberInput({
          path: 'bar.maxWidth',
          name: 'Bar max width',
          description: 'Maximum bar width in pixels.',
          category: [barOverrideCategory],
          settings: { placeholder: 'Auto', min: 0 },
          shouldApply: (field) => field.type === FieldType.number,
          showIf: showBarOverride,
        })
        .addNumberInput({
          path: 'bar.minHeight',
          name: 'Bar min height',
          description: 'Minimum bar height in pixels.',
          category: [barOverrideCategory],
          settings: { placeholder: '0', min: 0 },
          shouldApply: (field) => field.type === FieldType.number,
          showIf: showBarOverride,
        })
        .addNumberInput({
          path: 'bar.borderWidth',
          name: 'Border width',
          description: 'Bar border width in pixels.',
          category: [barOverrideCategory],
          settings: { placeholder: '0', min: 0 },
          shouldApply: (field) => field.type === FieldType.number,
          showIf: showBarOverride,
        })
        .addRadio({
          path: 'bar.borderType',
          name: 'Border type',
          category: [barOverrideCategory],
          settings: { options: barBorderTypeOptions },
          shouldApply: (field) => field.type === FieldType.number,
          showIf: showBarOverride,
        })
        .addNumberInput({
          path: 'bar.borderRadius',
          name: 'Border radius',
          description: 'Bar corner radius in pixels.',
          category: [barOverrideCategory],
          settings: { placeholder: '0', min: 0 },
          shouldApply: (field) => field.type === FieldType.number,
          showIf: showBarOverride,
        })
        .addSliderInput({
          path: 'bar.opacity',
          name: 'Fill opacity',
          category: [barOverrideCategory],
          settings: { min: 0, max: 1, step: 0.05 },
          shouldApply: (field) => field.type === FieldType.number,
          showIf: showBarOverride,
        })
        .addBooleanSwitch({
          path: 'bar.showBackground',
          name: 'Show background',
          description: 'Draw a track behind each bar.',
          defaultValue: false,
          category: [barOverrideCategory],
          shouldApply: (field) => field.type === FieldType.number,
          showIf: showBarOverride,
        })
        .addColorPicker({
          path: 'bar.backgroundColor',
          name: 'Background color',
          category: [barOverrideCategory],
          shouldApply: (field) => field.type === FieldType.number,
          showIf: (config) => showBarOverride(config) && Boolean(config.bar?.showBackground),
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
      })
      // Panel-level default for stacking bar series. Only relevant for `bar`, so
      // it is hidden for other series types. Fields can override via the
      // per-field switch above.
      .addBooleanSwitch({
        path: stackSeriesPath,
        name: stackSeriesName,
        defaultValue: false,
        category: [seriesCategoryName],
        showIf: (opts) => opts[seriesTypePath] === 'bar',
      });

    // Bar-specific rendering options. These live in flat sibling sections
    // (Grafana flattens nested `category` arrays) that each appear only when the
    // panel series type is `bar` (a category with no visible options is not
    // rendered). Per-field overrides for the per-series properties live in the
    // field config above.
    const isBar = (opts: PanelOptions) => opts[seriesTypePath] === 'bar';
    builder
      // Column spacing (coordinate-system-global; panel-level only).
      .addTextInput({
        path: 'bar.gap',
        name: 'Bar gap',
        description: 'Gap between bars of different series in a category, e.g. "30%" (negative overlaps).',
        category: [barSpacingCategory],
        settings: { placeholder: 'Auto' },
        // Bars overlap when stacked, so the inter-series gap is meaningless.
        showIf: (opts) => isBar(opts) && !opts.stackSeries,
      })
      .addTextInput({
        path: 'bar.categoryGap',
        name: 'Bar category gap',
        description: 'Gap between categories, e.g. "20%".',
        category: [barSpacingCategory],
        settings: { placeholder: 'Auto' },
        showIf: isBar,
      })
      // Bar height & width (per-series; override-capable).
      .addNumberInput({
        path: 'bar.width',
        name: 'Bar width',
        description: 'Bar width in pixels.',
        category: [barSizeCategory],
        settings: { placeholder: 'Auto', min: 0 },
        showIf: isBar,
      })
      .addNumberInput({
        path: 'bar.maxWidth',
        name: 'Bar max width',
        description: 'Maximum bar width in pixels.',
        category: [barSizeCategory],
        settings: { placeholder: 'Auto', min: 0 },
        showIf: isBar,
      })
      .addNumberInput({
        path: 'bar.minHeight',
        name: 'Bar min height',
        description: 'Minimum bar height in pixels.',
        category: [barSizeCategory],
        settings: { placeholder: '0', min: 0 },
        showIf: isBar,
      })
      // Bar styles (per-series; override-capable).
      .addNumberInput({
        path: 'bar.borderWidth',
        name: 'Border width',
        description: 'Bar border width in pixels.',
        category: [barStyleCategory],
        settings: { placeholder: '0', min: 0 },
        showIf: isBar,
      })
      .addRadio({
        path: 'bar.borderType',
        name: 'Border type',
        category: [barStyleCategory],
        settings: { options: barBorderTypeOptions },
        showIf: isBar,
      })
      .addNumberInput({
        path: 'bar.borderRadius',
        name: 'Border radius',
        description: 'Bar corner radius in pixels.',
        category: [barStyleCategory],
        settings: { placeholder: '0', min: 0 },
        showIf: isBar,
      })
      .addSliderInput({
        path: 'bar.opacity',
        name: 'Fill opacity',
        category: [barStyleCategory],
        settings: { min: 0, max: 1, step: 0.05 },
        showIf: isBar,
      })
      .addBooleanSwitch({
        path: 'bar.showBackground',
        name: 'Show background',
        description: 'Draw a track behind each bar.',
        defaultValue: false,
        category: [barStyleCategory],
        showIf: isBar,
      })
      .addColorPicker({
        path: 'bar.backgroundColor',
        name: 'Background color',
        category: [barStyleCategory],
        showIf: (opts) => isBar(opts) && Boolean(opts.bar?.showBackground),
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
