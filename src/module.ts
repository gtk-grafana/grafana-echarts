import { PanelPlugin } from '@grafana/data';
import { seriesCategoryName, seriesTypeDefault, seriesTypeName, seriesTypeOptions, seriesTypePath } from 'editor/series';
import { SimplePanel } from './components/SimplePanel';
import { PanelOptions } from './types';

export const plugin = new PanelPlugin<PanelOptions>(SimplePanel).setPanelOptions((builder) => {
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
  );
});
