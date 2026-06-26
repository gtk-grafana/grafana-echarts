import { FieldColorModeId, FieldConfigProperty, PanelPlugin, SelectableValue } from '@grafana/data';
import { initPluginTranslations } from '@grafana/i18n';
import {
  seriesCategoryName,
  seriesTypeDefault,
  seriesTypeName,
  seriesTypeOptions,
  seriesTypePath, supportedSeriesTypes,
} from 'editor/series';
import { SeriesType } from 'editor/types';
import { Panel } from './components/Panel';
import { PanelOptions } from './types';

// import id from json?
initPluginTranslations('grafana-echarts-panel');
export const plugin = new PanelPlugin<PanelOptions>(Panel)
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
  })
  .setPanelOptions((builder) => {
    return (
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
              isDisabled: !supportedSeriesTypes.includes(opt.value as SeriesType),
            })),
          },
          category: [seriesCategoryName],
        })
    );
  });
