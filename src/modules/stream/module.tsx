import { PanelPlugin } from '@grafana/data';
import { commonOptionsBuilder } from '@grafana/ui';
import { type EChartsFieldConfig } from 'editor/types';
import { makeLazyPanel } from 'lib/components/LazyPanel';
import { STANDARD_COLOR_OPTIONS } from 'lib/grafana/editor/common/fieldConfig';
import { addCommonLegendAndTooltip } from 'lib/grafana/editor/common/legend-and-tooltip';
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
