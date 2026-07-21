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
import { addRadarFillAreaOptions } from 'lib/grafana/editor/radar/fill-area';
import { addRadarLineWidthOptions } from 'lib/grafana/editor/radar/line-width';
import { addRadarShapeOptions } from 'lib/grafana/editor/radar/shape-select';
import { addRadarSplitNumberOptions } from 'lib/grafana/editor/radar/split-number';
import { addRadarSymbolSizeOptions } from 'lib/grafana/editor/radar/symbol-size';
import { type PanelOptions } from 'types';
import { multivariateSuggestionsSupplier } from './suggestions';

// Multivariate family panel: radar built from the categorical model
// (categories -> indicators, series -> polygons). The family is fixed to
// `radar`; the shared Panel resolves the radar chart module. parallel is
// roadmap.
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

    // "Chart type" picker seam: registered only once the family hosts more than
    // one render type (parallel coordinates is the roadmap second type). A no-op
    // today (radar only), so the control is absent — but the seam is exercised as
    // soon as `MULTIVARIATE_SERIES_TYPE_OPTIONS` grows. See parity.md.
    if (MULTIVARIATE_SERIES_TYPE_OPTIONS.length > 1) {
      builder.addRadio({
        path: seriesTypePath,
        name: 'Chart type',
        category: ['Multivariate'],
        defaultValue: 'radar',
        settings: { options: MULTIVARIATE_SERIES_TYPE_OPTIONS },
      });
    }

    // Fill area (Default) + Advanced shape / line / symbol / rings + animation.
    // Each render helper omits its ECharts key at the default (see options/radar.ts).
    addRadarFillAreaOptions(builder);
    addRadarShapeOptions(builder);
    addRadarLineWidthOptions(builder);
    addRadarSymbolSizeOptions(builder);
    addRadarSplitNumberOptions(builder);
    addAnimationOption(builder);

    addCommonLegendAndTooltip(builder);
    return builder;
  })
  // Advertise fitness for multi-metric numeric data (opts in via `"suggestions": true`).
  .setSuggestionsSupplier(multivariateSuggestionsSupplier);
