import { defaultVizLegendOptions, type VizLegendOptions } from '@grafana/schema';
import { PREVIEW_MAX_SERIES } from 'lib/echarts/charts/suggestionLimits';
import { type PanelOptions } from 'types';

/**
 * The `cardOptions` every suggestion card carries: how much data the preview is
 * allowed to see, and which options are degraded for it.
 *
 * Grafana renders each suggestion card as a real panel at 350x219
 * (`VisualizationSuggestionCard`), so a card is a full converter run plus an
 * ECharts canvas paint. Ten cards over a 500-series response is ten full panel
 * renders on the main thread. This module is the whole mitigation, and it uses
 * Grafana's own mechanism rather than anything bespoke:
 *
 * - `maxSeries` -> `data.series.slice(0, n)`
 * - `maxRows` -> every field's `values` truncated to the first `n`
 * - `previewModifier` -> run against a `cloneDeep` of the suggestion
 *
 * The `cloneDeep` is what makes the degradations safe: they apply to the card
 * only, and the panel the user creates from it keeps the full options and the
 * full data. Nothing here is a behaviour change to the plugin.
 *
 * Numbers live in `./suggestionLimits.ts` so tests can mock them.
 */

/**
 * The part of a suggestion `previewModifier` touches.
 *
 * Deliberately structural rather than `VisualizationSuggestion<PanelOptions, T>`:
 * the suppliers are typed with two different field configs (cartesian uses
 * `EChartsGraphFieldConfig`, the rest `EChartsFieldConfig`), and a parameter typed
 * as their common supertype is assignable to both `previewModifier` positions
 * under `strictFunctionTypes`. The modifier only reads and writes `options`, so
 * nothing is lost.
 */
interface PreviewModifiableSuggestion {
  options?: Partial<PanelOptions>;
}

/** Per-family additions to {@link previewCardOptions}. */
export interface PreviewCardOverrides {
  /**
   * Preview-only panel options, merged over the shared degradations below (and so
   * able to override them). For per-family label suppression — text layout is the
   * dominant cost in the pie/funnel, stream and relations families, and none of it
   * is readable at card scale.
   */
  options?: Partial<PanelOptions>;
  /** Frames the preview may see. Defaults to `PREVIEW_MAX_SERIES`. */
  maxSeries?: number;
  /** Rows per frame the preview may see. Omitted means "every row". */
  maxRows?: number;
}

/** {@link previewCardOptions}'s return shape, assignable to a card's `cardOptions`. */
export interface PreviewCardOptions {
  previewModifier: (suggestion: PreviewModifiableSuggestion) => void;
  maxSeries: number;
  maxRows?: number;
}

/**
 * Preview-only option degradations applied to every card, in order of payoff.
 *
 * `legend`: the Grafana `VizLegend` is React DOM, one row per series, and is
 * illegible at 350x219 regardless — the same trade core Grafana makes via its
 * `SUGGESTIONS_LEGEND_OPTIONS`. `performance`: kills per-point symbols and arms
 * LTTB, the two levers that scale with point count.
 *
 * Both are safe from `applyEditorModeDefaults`, which spreads each family's
 * `ADVANCED_*_DEFAULTS` over the stored options in Default editor mode: neither
 * `legend` nor `performance` appears in any of those sets, so neither is reset
 * before the chart is built. **Anything added here must be re-checked against
 * `options/editorMode.ts`** — an option that is in an Advanced default set would
 * make the modifier silently useless.
 *
 * `animation` is deliberately absent: it already defaults off for every family
 * (`ANIMATION_ENABLED_DEFAULT`) *and* is in `ADVANCED_CARTESIAN_DEFAULTS`, so
 * setting it here would be a no-op twice over.
 */
const PREVIEW_OPTIONS: Partial<PanelOptions> = {
  performance: { showPoints: 'never', downsampling: true },
};

/**
 * Legend base for a card that configured none of its own. `defaultVizLegendOptions`
 * is a `Partial`, so the two fields `VizLegendOptions` requires beyond
 * `showLegend` are pinned here.
 */
const PREVIEW_LEGEND: VizLegendOptions = {
  ...defaultVizLegendOptions,
  calcs: [],
  placement: 'bottom',
  showLegend: false,
};

/**
 * Build the `cardOptions` for a suggestion card: the shared preview degradations
 * plus any per-family `overrides`.
 *
 * The modifier tolerates `suggestion.options === undefined` — a bare card carries
 * no options object at all. Core Grafana's own modifiers assign into
 * `s.options!.legend` directly and only get away with it because they always run
 * after a `defaultsDeep`; these run on cards built by hand.
 */
export function previewCardOptions(overrides: PreviewCardOverrides = {}): PreviewCardOptions {
  const { options: optionOverrides, maxSeries = PREVIEW_MAX_SERIES, maxRows } = overrides;
  return {
    maxSeries,
    ...(maxRows == null ? {} : { maxRows }),
    previewModifier: (suggestion) => {
      const previous = suggestion.options;
      suggestion.options = {
        ...previous,
        ...PREVIEW_OPTIONS,
        ...optionOverrides,
        // Merged rather than replaced so a card that set its own legend options
        // keeps them; only visibility is forced.
        legend: { ...PREVIEW_LEGEND, ...previous?.legend, showLegend: false },
      };
    },
  };
}
