import { PanelPlugin } from '@grafana/data';
import { initPluginTranslations } from '@grafana/i18n';
import { commonOptionsBuilder } from '@grafana/ui';
import { PIE_CALC_DEFAULT } from 'editor/pie';
import { type EChartsFieldConfig } from 'editor/types';
import { makeLazyPanel } from 'lib/components/LazyPanel';
import { addEditorModeOption } from 'lib/grafana/editor/common/editor-mode';
import { STANDARD_COLOR_OPTIONS } from 'lib/grafana/editor/common/fieldConfig';
import { addCommonLegendAndTooltip } from 'lib/grafana/editor/common/legend-and-tooltip';
import { removeOption } from 'lib/grafana/editor/common/removeOption';
import { addStandardDataReduceOptions } from 'lib/grafana/editor/common/standardReducer';
import { addPieAngleOptions } from 'lib/grafana/editor/pie/angle-inputs';
import { addPieAnimationTextStyleOptions } from 'lib/grafana/editor/pie/animation-text-style';
import { addPieBorderRadiusOptions } from 'lib/grafana/editor/pie/border-radius-input';
import { addPieCenterValueReducerOptions } from 'lib/grafana/editor/pie/center-value-reducer-select';
import { addPieClockwiseOverlapOptions } from 'lib/grafana/editor/pie/clockwise-overlap';
import { addPieEmphasisOptions } from 'lib/grafana/editor/pie/emphasis';
import { addPieLabelColorOptions } from 'lib/grafana/editor/pie/label-color';
import { addPieLabelFontSizeOptions } from 'lib/grafana/editor/pie/label-font-size-input';
import { addPieLabelOverflowOptions } from 'lib/grafana/editor/pie/label-overflow';
import { addPieLabelPositionOptions } from 'lib/grafana/editor/pie/label-position-select';
import { addPieLabelOptions } from 'lib/grafana/editor/pie/label-select';
import { addPieLegendValueOptions } from 'lib/grafana/editor/pie/legend-values-select';
import { addPieMinAngleOptions } from 'lib/grafana/editor/pie/min-angle-input';
import { addPieMinShowLabelAngleOptions } from 'lib/grafana/editor/pie/min-show-label-angle-input';
import { addPieRadiusCenterOptions } from 'lib/grafana/editor/pie/radius-center-inputs';
import { addPieRoseTypeOptions } from 'lib/grafana/editor/pie/rose-type-select';
import { addPieSelectionOptions } from 'lib/grafana/editor/pie/selection';
import { addPieSliceBorderOptions } from 'lib/grafana/editor/pie/slice-border';
import { addPieSortOptions } from 'lib/grafana/editor/pie/sort-select';
import { addPieTypeOptions } from 'lib/grafana/editor/pie/type-select';
import { addPieZeroSumOptions } from 'lib/grafana/editor/pie/zero-sum';
import { type PanelOptions } from 'types';
import { partToWholeSuggestionsSupplier } from './suggestions';

// Needs to be called at each top-level module to prevent panels from breaking when calling grafana/i18n methods (like t())
initPluginTranslations('grafana-echarts-app');

// Part-to-whole family panel: pie built from the categorical model
// (one value per category). The family is fixed to `pie`; the shared Panel
// resolves the pie chart module. funnel/gauge render types are roadmap.
export const plugin = new PanelPlugin<PanelOptions, EChartsFieldConfig>(makeLazyPanel('part-to-whole'))
  .useFieldConfig({
    standardOptions: STANDARD_COLOR_OPTIONS,
    // Register `custom.hideFrom` so the legend visibility toggle's `byName`
    // override is applied by Grafana (unregistered override properties are
    // skipped). Pie slices are rows of one field, so the converter reads the
    // hidden set by name (see `lib/grafana/fields/seriesConfig.ts`).
    useCustomConfig: (builder) => {
      commonOptionsBuilder.addHideFrom(builder);
    },
  })
  .setPanelOptions((builder) => {
    // Editor mode (Default / Advanced) — tiers the editor surface. Registered
    // first so it renders at the top. The core-parity pie options below are always
    // shown; ECharts-only options (e.g. label position) gate on Advanced via
    // `showIf: isAdvancedEditorMode`. See docs/options-modes.md.
    addEditorModeOption(builder);

    // Grafana's standard reduce options (Show / Limit / Calculation / Fields).
    // `resolvePieSlices` feeds these to `getFieldDisplayValues`: `calcs[0]` reduces
    // each slice, `values` switches Calculate vs. All values, `limit` caps
    // All-values rows, and `fields` selects which numeric fields become slices.
    // Multi-frame responses (one frame per series) yield one slice per series.
    // Long-shaped data is reshaped to wide upstream with a Group by / Rows to
    // fields transform (see provisioning/dashboards/part-to-whole). Default
    // reducer is Sum (part-to-whole), not Grafana's stat/gauge `lastNotNull`.
    addStandardDataReduceOptions(builder, true, PIE_CALC_DEFAULT);

    // Pie vs donut chart type — Grafana Pie chart parity. Rendered by `getPieRadius`.
    addPieTypeOptions(builder);

    // Slice sorting (Descending / Ascending / None) — Grafana Pie chart parity.
    // Applied by `resolvePieSlices` to the shared slice model.
    addPieSortOptions(builder);

    // Slice-label content (Name / Value / Percent) — Grafana Pie chart parity.
    // Rendered by `getPieContentLabel`.
    addPieLabelOptions(builder);

    // Rose (Nightingale) type (None / Radius / Area) — ECharts-only, gated behind
    // Advanced editor mode. Rendered by `getPieRoseType`.
    addPieRoseTypeOptions(builder);
    // Min slice angle (degrees) — Advanced-only ECharts extra. Enlarges tiny
    // long-tail slices so they stay visible/clickable. Rendered by `getPieMinAngle`.
    addPieMinAngleOptions(builder);
    // Arc range (Start / End angle) — Advanced-only ECharts extra. Reshapes the arc
    // into half-pie / semicircle-donut layouts; applied by `getPieAngles`.
    addPieAngleOptions(builder);
    // Slice-label placement (Outside / Inside / Center) — ECharts-only, Advanced.
    // Threaded into `getPieContentLabel` as `label.position`.
    addPieLabelPositionOptions(builder);
    // Center-readout reducer — shown only with center labels; drives the persistent
    // donut-center `title` (see `getPieCenterTitle`).
    addPieCenterValueReducerOptions(builder);

    // Advanced pie legibility options. Each builder gates its own controls behind
    // Advanced editor mode and omits its key at the default.
    // Labels category:
    addPieLabelFontSizeOptions(builder);
    addPieLabelOverflowOptions(builder);
    addPieMinShowLabelAngleOptions(builder);
    // Pie category:
    addPieSliceBorderOptions(builder);
    addPieRadiusCenterOptions(builder);

    // Advanced interactivity & polish options. Each builder gates its controls
    // behind Advanced editor mode and omits its ECharts key at the default.
    addPieSelectionOptions(builder); // Select / explode (selectedMode/selectedOffset)
    addPieBorderRadiusOptions(builder); // Rounded corners (itemStyle.borderRadius)
    addPieEmphasisOptions(builder); // Emphasis (emphasis.focus/scale)
    addPieZeroSumOptions(builder); // Zero-sum / empty (stillShowZeroSum/showEmptyCircle)
    addPieClockwiseOverlapOptions(builder); // Clockwise / avoidLabelOverlap
    addPieLabelColorOptions(builder); // Label color (label.color)
    addPieAnimationTextStyleOptions(builder); // Animation + label text shadow/stroke

    // Shared Legend + Tooltip pair, but without the legend's reducer "Values"
    // stats-picker (`includeLegendCalcs: false`): an arbitrary reducer over a
    // single-value slice is meaningless. The pie's own Percent / Value control
    // replaces it.
    addCommonLegendAndTooltip(builder, { includeLegendCalcs: false });
    // Legend values (Percent / Value) — Grafana Pie chart parity. Registered in
    // the same "Legend" category (after the standard legend options). Rendered by
    // `buildPieLegendItems`.
    addPieLegendValueOptions(builder);
    // The pie's own slice `sort` already governs tooltip row order (see
    // `buildPieTooltip`), so the common tooltip's "Values sort order" control
    // would be a no-op here. Drop it, keeping mode / hide-zeros / max size.
    removeOption(builder, 'tooltip.sort');

    return builder;
  })
  // Advertise fitness for numeric/instant data
  .setSuggestionsSupplier(partToWholeSuggestionsSupplier);
