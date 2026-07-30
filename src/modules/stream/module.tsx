import { PanelPlugin } from '@grafana/data';
import { commonOptionsBuilder } from '@grafana/ui';
import { type EChartsFieldConfig } from 'editor/types';
import { makeLazyPanel } from 'lib/components/LazyPanel';
import { addAnimationOption } from 'lib/grafana/editor/common/animation';
import { addEditorModeOption } from 'lib/grafana/editor/common/editor-mode';
import { STANDARD_COLOR_OPTIONS } from 'lib/grafana/editor/common/fieldConfig';
import { addCommonLegendAndTooltip } from 'lib/grafana/editor/common/legend-and-tooltip';
import { addStreamBoundaryGapOptions } from 'lib/grafana/editor/stream/boundary-gap';
import { addStreamEmphasisOptions } from 'lib/grafana/editor/stream/emphasis';
import { addStreamLabelOptions } from 'lib/grafana/editor/stream/labels';
import { addStreamLayerSourceOptions } from 'lib/grafana/editor/stream/layer-source';
import { addStreamRibbonStyleOptions } from 'lib/grafana/editor/stream/ribbon-style';
import { type PanelOptions } from 'types';
import { streamSuggestionsSupplier } from './suggestions';

// Stream family panel: a theme river — stacked ribbons on the ECharts `singleAxis`
// coordinate system — showing how a composition changes over time. One layer per
// numeric field, or per label-column value for long-shaped frames (see
// `lib/echarts/converters/stream.ts` and `data-plane/stream.md`).
//
// `themeRiver` is the family's only render type, so there is no "Chart type"
// picker: the shared Panel's `'Auto'` resolver returns it for this family.
export const plugin = new PanelPlugin<PanelOptions, EChartsFieldConfig>(makeLazyPanel('stream'))
  .useFieldConfig({
    standardOptions: STANDARD_COLOR_OPTIONS,
    // Register `custom.hideFrom` so the legend visibility toggle's `byName`
    // override is applied by Grafana. A fields-path layer is a numeric field, so
    // the chart strips fields flagged `hideFrom.viz`; label-path layers are rows
    // rather than columns, so the converter reads the same override by layer name
    // (see `frameToStream`).
    useCustomConfig: (builder) => {
      commonOptionsBuilder.addHideFrom(builder);
    },
  })
  .setPanelOptions((builder) => {
    // Editor mode (Default / Advanced) — registered first so it renders at the
    // top. "Layers from" and the layer-label switch are Default-tier; the label
    // placement, boundary gap, ribbon style and hover emphasis gate on Advanced.
    // See docs/options-modes.md.
    addEditorModeOption(builder);

    // Default-tier "Stream" category: which column becomes a ribbon, and whether
    // the ribbons carry their names. Both are parity-critical rather than
    // decorative — the first decides whether the panel is a stream at all, and the
    // second undoes an ECharts default (labels on, unthemed) the plugin turns off.
    addStreamLayerSourceOptions(builder);
    addStreamLabelOptions(builder);

    // Advanced "Advanced" category: ECharts-only ribbon geometry and styling. Each
    // helper omits its ECharts key at the default (see options/stream.ts), and
    // `applyStreamEditorModeDefaults` resets them all in Default mode.
    addStreamBoundaryGapOptions(builder);
    addStreamRibbonStyleOptions(builder);
    addStreamEmphasisOptions(builder);

    // The family has no per-point fast path (one series carries every ribbon), so
    // it registers the shared animation switch directly rather than the cartesian
    // `addPerformanceOptions` bundle, whose Show points / Downsampling levers would
    // be inert here.
    addAnimationOption(builder);

    // Single/Hidden only: an axis-triggered tooltip is built from the global
    // tooltip model, not the per-series formatter this family attaches, so "All"
    // would print each ribbon's layer name where its value belongs. Matches
    // `singleTooltipOnly` on `streamChartModule`, which clamps a persisted `multi`
    // at render time.
    addCommonLegendAndTooltip(builder, { singleTooltipOnly: true });
    return builder;
  })
  // Advertise fitness for multi-layer time-series data (opts in via `"suggestions": true`).
  .setSuggestionsSupplier(streamSuggestionsSupplier);
