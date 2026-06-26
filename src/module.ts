import { PanelPlugin } from '@grafana/data';
import { initPluginTranslations } from '@grafana/i18n';
import {
  seriesCategoryName,
  seriesTypeDefault,
  seriesTypeName,
  seriesTypeOptions,
  seriesTypePath,
} from 'editor/series';
import { Panel } from './components/Panel';
import { PanelOptions } from './types';

// const standardCategory = 'Standard options';

// import id from json?
initPluginTranslations('grafana-echarts-panel');
export const plugin = new PanelPlugin<PanelOptions>(Panel).setPanelOptions((builder) => {
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
          options: seriesTypeOptions,
        },
        category: [seriesCategoryName],
      })
    // .addSelect({
    //   id: 'color',
    //   path: 'color',
    //   name: t('options-ui.registry.standard-field-configs.name-color-scheme', 'Color scheme'),
    //   editor: standardEditorsRegistry.get('fieldColor').editor,
    //   override: standardEditorsRegistry.get('fieldColor').editor,
    //   process: identityOverrideProcessor,
    //   shouldApply: () => true,
    //   settings: {
    //     // @ts-expect-error
    //     byValueSupport: true,
    //     preferThresholdsMode: true,
    //     options: fieldColorModeRegistry,
    //     // @todo where do I get the values from?
    //   },
    //   standardCategory,
    // })
  );
});
