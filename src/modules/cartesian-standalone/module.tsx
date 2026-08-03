import { PanelPlugin, type SelectFieldConfigSettings } from '@grafana/data';
import { GraphThresholdsStyleMode } from '@grafana/schema';
import { commonOptionsBuilder, getGraphFieldOptions } from '@grafana/ui';
import {
  cartesianOverrideOptionsWithAuto,
  cartesianSeriesTypeOptionsWithAuto,
  multiValueSeriesTypeOptionsWithAuto,
  stackSeriesName,
  stackSeriesPath,
  thresholdsCategoryName,
  thresholdsStyleModeName,
  thresholdsStyleModePath,
} from 'editor/cartesian';
import { seriesTypePath } from 'editor/constants';
import { type EChartsGraphFieldConfig, type SeriesTypeOption } from 'editor/types';
import { makeExposedPanel } from 'lib/components/ExposedPanel';
import { framesLookMultiValue } from 'lib/echarts/converters/multiValueCartesian';
import { addCartesianBarRadiusOptions } from 'lib/grafana/editor/cartesian/bar-radius';
import { addCartesianBarWidthOptions } from 'lib/grafana/editor/cartesian/bar-width';
import { addCartesianFillOpacityOptions } from 'lib/grafana/editor/cartesian/fill-opacity';
import { addCartesianLineWidthOptions } from 'lib/grafana/editor/cartesian/line-width';
import { addCartesianPointSizeOptions } from 'lib/grafana/editor/cartesian/point-size';
import { addCartesianValueLabelOptions } from 'lib/grafana/editor/cartesian/value-labels';
import { addCartesianXTickRotateOptions } from 'lib/grafana/editor/cartesian/x-tick-rotate';
import { addEditorModeOption } from 'lib/grafana/editor/common/editor-mode';
import { STANDARD_COLOR_OPTIONS } from 'lib/grafana/editor/common/fieldConfig';
import { addCommonLegendAndTooltip } from 'lib/grafana/editor/common/legend-and-tooltip';
import { addPerformanceOptions } from 'lib/grafana/editor/common/performance-options';
import { type PanelOptions } from 'types';
import { cartesianSuggestionsSupplier } from './suggestions';

// PoC variant of ../cartesian/module.tsx: identical field config, panel
// options, and suggestions (this family's editor code has no echarts
// dependency either way). The only change is the panel constructor argument:
// makeExposedPanel resolves the shared Panel from grafana-echarts-app's
// exposed component at runtime (see lib/components/ExposedPanel) instead of
// makeLazyPanel bundling it locally (see lib/components/LazyPanel). This
// plugin is registered standalone (see plugin.json), not nested under the app.
export const plugin = new PanelPlugin<PanelOptions, EChartsGraphFieldConfig>(makeExposedPanel('cartesian'))
  .useFieldConfig({
    standardOptions: STANDARD_COLOR_OPTIONS,
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

      builder.addBooleanSwitch({
        path: stackSeriesPath,
        name: stackSeriesName,
        category: ['Bar chart'],
        description: 'Stack this field with other stacked bar series.',
        defaultValue: false,
        showIf: (config) => config.seriesType === 'bar',
      });

      commonOptionsBuilder.addAxisPlacement(builder);

      builder.addSelect({
        path: thresholdsStyleModePath,
        name: thresholdsStyleModeName,
        category: [thresholdsCategoryName],
        defaultValue: GraphThresholdsStyleMode.Off,
        settings: {
          options: getGraphFieldOptions().thresholdsDisplayModes,
        },
      });

      commonOptionsBuilder.addHideFrom(builder);
    },
  })
  .setPanelOptions((builder) => {
    addEditorModeOption(builder);

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

    addCartesianValueLabelOptions(builder);

    addCartesianBarWidthOptions(builder);
    addCartesianBarRadiusOptions(builder);
    addCartesianLineWidthOptions(builder);
    addCartesianFillOpacityOptions(builder);
    addCartesianPointSizeOptions(builder);
    addCartesianXTickRotateOptions(builder);

    addCommonLegendAndTooltip(builder);

    addPerformanceOptions(builder);

    return builder;
  })
  .setSuggestionsSupplier(cartesianSuggestionsSupplier);
