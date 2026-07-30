import { partToWholeSeriesTypes } from 'editor/pie';
import { type SeriesType } from 'editor/types';
import {
  isCartesianSingleValueSeriesType,
  isMultiValueSeriesType,
  isMultivariateSeriesType,
  isRelationsSeriesType,
  isStreamSeriesType,
} from 'lib/echarts/charts/narrowing';
import { ADVANCED_CARTESIAN_DEFAULTS } from 'lib/echarts/options/cartesian';
import { ADVANCED_CHORD_DEFAULTS } from 'lib/echarts/options/chord';
import { ADVANCED_RELATIONS_DEFAULTS } from 'lib/echarts/options/graph';
import { ADVANCED_PARALLEL_DEFAULTS } from 'lib/echarts/options/parallel';
import { ADVANCED_PIE_DEFAULTS } from 'lib/echarts/options/pie';
import { ADVANCED_RADAR_DEFAULTS } from 'lib/echarts/options/radar';
import { ADVANCED_SANKEY_DEFAULTS } from 'lib/echarts/options/sankey';
import { ADVANCED_STREAM_DEFAULTS } from 'lib/echarts/options/stream';
import { isAdvancedEditorMode, isApiEditorMode } from 'lib/grafana/editor/common/editor-mode';
import { type PanelOptions } from 'types';

/**
 * Shared editor-mode render normalization. The render path never reads
 * `editorMode`; instead, in Default mode we spread each family's
 * `ADVANCED_*_DEFAULTS` over the stored options so any Advanced values a user
 * configured and then hid (by switching back to Default) are forced back to
 * their defaults before the chart is built. Advanced and API modes render the
 * stored options as-is. Applied once per render in `buildPanelChartOption`.
 */

/**
 * Spread `defaults` over `options` in Default editor mode; pass the options
 * through untouched in Advanced / API mode. The generic core hoisted from the
 * pie's `applyPartToWholeEditorModeDefaults`. Returns the same object reference when no
 * reset is needed, so callers can cheaply detect "unchanged".
 */
export function applyAdvancedDefaults(options: PanelOptions, defaults: Partial<PanelOptions>): PanelOptions {
  if (isAdvancedEditorMode(options) || isApiEditorMode(options)) {
    return options;
  }
  return { ...options, ...defaults };
}

/**
 * Normalize a panel's options for rendering by its series type's Advanced tier.
 * Dispatches to the per-family `ADVANCED_*_DEFAULTS`; families with no Advanced
 * tier (heatmap, hierarchy) return the options unchanged (identity).
 *
 * The per-family defaults are dereferenced lazily inside the switch — not from a
 * top-level map literal — so the `pie`/`cartesian`/`radar`/`stream` ↔ `editorMode`
 * import cycle resolves safely: each `ADVANCED_*_DEFAULTS` is only read at call
 * (render) time, by which point every module has finished initializing.
 */
export function applyEditorModeDefaults(seriesType: SeriesType, options: PanelOptions): PanelOptions {
  // The part-to-whole family (pie + funnel) shares the pie Advanced defaults; the
  // funnel's own layout options are not in `ADVANCED_PIE_DEFAULTS`, so they pass
  // through untouched (they are Default-visible, not Advanced-gated).
  if (partToWholeSeriesTypes.includes(seriesType)) {
    return applyAdvancedDefaults(options, ADVANCED_PIE_DEFAULTS);
  }
  if (isCartesianSingleValueSeriesType(seriesType) || isMultiValueSeriesType(seriesType)) {
    return applyAdvancedDefaults(options, ADVANCED_CARTESIAN_DEFAULTS);
  }
  // Parallel shares the multivariate family with radar but has its own Advanced
  // defaults, so it must be checked before the radar branch below (which the
  // `isMultivariateSeriesType` predicate would otherwise also match).
  if (seriesType === 'parallel') {
    return applyAdvancedDefaults(options, ADVANCED_PARALLEL_DEFAULTS);
  }
  if (isMultivariateSeriesType(seriesType)) {
    return applyAdvancedDefaults(options, ADVANCED_RADAR_DEFAULTS);
  }
  // The relations family's three render variants each own an Advanced tier, merged
  // here rather than in one shared constant: `options/sankey.ts` already imports the
  // graph variant's shared color resolver and constants, so having `graph.ts` spread
  // the sankey defaults back would be an import cycle — and a cycle would resolve to
  // `{}` silently, since spreading an uninitialized binding does not throw.
  // Both sets are applied regardless of the selected variant, so switching variants
  // can never leave the other one's hidden Advanced values in force.
  if (isRelationsSeriesType(seriesType)) {
    return applyAdvancedDefaults(options, {
      ...ADVANCED_RELATIONS_DEFAULTS,
      ...ADVANCED_SANKEY_DEFAULTS,
      ...ADVANCED_CHORD_DEFAULTS,
    });
  }
  if (isStreamSeriesType(seriesType)) {
    return applyAdvancedDefaults(options, ADVANCED_STREAM_DEFAULTS);
  }
  return options;
}
