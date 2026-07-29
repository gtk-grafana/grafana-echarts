import { FieldColorModeId, FieldConfigProperty, PanelPlugin } from '@grafana/data';
import { commonOptionsBuilder } from '@grafana/ui';
import { hierarchySeriesTypeOptions, seriesTypePath } from 'editor/constants';
import { type EChartsFieldConfig } from 'editor/types';
import { makeLazyPanel } from 'lib/components/LazyPanel';
import { type PanelOptions } from 'types';
import { hierarchySuggestionsSupplier } from './suggestions';

// Hierarchy family panel: a value-weighted tree rendered as a treemap (nested
// rectangles) or sunburst (radial rings). Both variants share the same tree
// model, reconstructed from a flame-graph nested-set frame or a flat categorical
// frame (see echarts/converters/hierarchy.ts). The panel-level `seriesType`
// picks the render variant.
export const plugin = new PanelPlugin<PanelOptions, EChartsFieldConfig>(makeLazyPanel('hierarchy'))
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
    // Panel-level render variant: treemap vs sunburst.
    builder.addRadio({
      path: seriesTypePath,
      name: 'Chart type',
      category: ['Hierarchy'],
      defaultValue: 'treemap',
      settings: {
        options: hierarchySeriesTypeOptions,
      },
    });

    commonOptionsBuilder.addLegendOptions(builder);
    // `singleOnly`: a hierarchy hover is always one node, so "All" has nothing to
    // list. Note `hierarchyChartModule` does *not* set `singleTooltipOnly`, so a
    // dashboard saved with `multi` before this still builds an axis trigger; see
    // `ChartModule.singleTooltipOnly`.
    commonOptionsBuilder.addTooltipOptions(builder, true);

    return builder;
  })
  // Advertise fitness for numeric/instant data (flat categorical path).
  .setSuggestionsSupplier(hierarchySuggestionsSupplier);
