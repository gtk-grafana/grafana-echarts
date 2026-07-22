import { PanelPlugin } from '@grafana/data';
import { commonOptionsBuilder } from '@grafana/ui';
import { seriesTypePath } from 'editor/constants';
import { MULTIVARIATE_SERIES_TYPE_OPTIONS } from 'editor/radar';
import { type EChartsFieldConfig } from 'editor/types';
import { makeLazyPanel } from 'lib/components/LazyPanel';
import { addAnimationOption } from 'lib/grafana/editor/common/animation';
import { addEditorModeOption } from 'lib/grafana/editor/common/editor-mode';
import { STANDARD_COLOR_OPTIONS } from 'lib/grafana/editor/common/fieldConfig';
import { addCommonLegendAndTooltip } from 'lib/grafana/editor/common/legend-and-tooltip';
import { addParallelLayoutOptions } from 'lib/grafana/editor/parallel/layout';
import { addParallelLineOpacityOptions } from 'lib/grafana/editor/parallel/line-opacity';
import { addParallelLineWidthOptions } from 'lib/grafana/editor/parallel/line-width';
import { addParallelSmoothOptions } from 'lib/grafana/editor/parallel/smooth';
import { addRadarFillAreaOptions } from 'lib/grafana/editor/radar/fill-area';
import { addRadarLineWidthOptions } from 'lib/grafana/editor/radar/line-width';
import { addRadarShapeOptions } from 'lib/grafana/editor/radar/shape-select';
import { addRadarSplitNumberOptions } from 'lib/grafana/editor/radar/split-number';
import { addRadarSymbolSizeOptions } from 'lib/grafana/editor/radar/symbol-size';
import { type PanelOptions } from 'types';
import { multivariateSuggestionsSupplier } from './suggestions';

// Multivariate family panel: radar and parallel coordinates, both built from the
// shared categorical model (categories -> axes, each numeric field -> one series).
// The "Chart type" picker toggles between them over the same frames; the shared
// Panel resolves the multivariate chart module, which dispatches on the selected
// seriesType.
export const plugin = new PanelPlugin<PanelOptions, EChartsFieldConfig>(makeLazyPanel('multivariate'))
  .useFieldConfig({
    standardOptions: STANDARD_COLOR_OPTIONS,
    // Register `custom.hideFrom` so the legend visibility toggle's `byName`
    // override is applied by Grafana. Each radar polygon is a numeric field, so
    // the chart strips fields flagged `hideFrom.viz` (see
    // `lib/grafana/fields/seriesConfig.ts`).
    useCustomConfig: (builder) => {
      commonOptionsBuilder.addHideFrom(builder);
    },
  })
  .setPanelOptions((builder) => {
    // Editor mode (Default / Advanced) — registered first so it renders at the
    // top. The radar shape/style options gate on Advanced; "Fill area" is
    // Default-tier. See docs/options-modes.md.
    addEditorModeOption(builder);

    // "Chart type" picker: registered because the family now hosts more than one
    // render type (radar + parallel coordinates). It toggles the panel-level
    // `seriesType` over the same frames; the radar and parallel option groups gate
    // on the selection (`isRadarSelected` / `isParallelSelected`) so only the
    // active type's options are shown. See parity.md.
    if (MULTIVARIATE_SERIES_TYPE_OPTIONS.length > 1) {
      builder.addRadio({
        path: seriesTypePath,
        name: 'Chart type',
        category: ['Multivariate'],
        defaultValue: 'radar',
        settings: { options: MULTIVARIATE_SERIES_TYPE_OPTIONS },
      });
    }

    // Radar options (Fill area = Default tier; shape / line width / symbol size /
    // rings = Advanced), gated on `isRadarSelected`. Each render helper omits its
    // ECharts key at the default (see options/radar.ts).
    addRadarFillAreaOptions(builder);
    addRadarShapeOptions(builder);
    addRadarLineWidthOptions(builder);
    addRadarSymbolSizeOptions(builder);
    addRadarSplitNumberOptions(builder);

    // Parallel options (Smooth = Default tier; layout / line width / line opacity
    // = Advanced), gated on `isParallelSelected`. Each helper omits its ECharts key
    // at the default (see options/parallel.ts).
    addParallelSmoothOptions(builder);
    addParallelLayoutOptions(builder);
    addParallelLineWidthOptions(builder);
    addParallelLineOpacityOptions(builder);

    addAnimationOption(builder);

    addCommonLegendAndTooltip(builder);
    return builder;
  })
  // Advertise fitness for multi-metric numeric data (opts in via `"suggestions": true`).
  .setSuggestionsSupplier(multivariateSuggestionsSupplier);
