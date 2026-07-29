import {
  ByNamesMatcherMode,
  type ConfigOverrideRule,
  type DynamicConfigValue,
  type FieldColor,
  FieldColorModeId,
  type FieldConfigSource,
  FieldMatcherID,
  isSystemOverrideWithRef,
  type SystemConfigOverrideRule,
} from '@grafana/data';
import { type HideSeriesConfig } from '@grafana/schema';
import { SeriesVisibilityChangeMode } from '@grafana/ui';
import { debug, LOG_LEVELS } from 'development';

// Legend interaction write-back (see `Panel.tsx`). Grafana re-applies these
// field-config overrides to `data.series` before the next render. The core
// factories that build them are not exported to plugins, so we replicate them.
//
// Two representations, matching Core Grafana:
// - Visibility: a single system override (`__systemRef: 'hideSeriesFrom'`) with a
//   `byNames` matcher in `exclude` mode listing the *kept* (visible) series, i.e.
//   "hide all except these". This is the exact shape core writes and reads, so
//   panels saved by core round-trip and Grafana's override engine applies it onto
//   the matching numeric fields for per-field families (cartesian/radar/heatmap
//   overlays), which then read it back through `field.config.custom.hideFrom.viz`.
// - Color: a per-series `byName` fixed-color override.
//
// Row/series families (pie slices, candlestick/boxplot) have no field named after
// the item, so the engine ignores the override; their converters read it directly
// via `getHiddenSeriesNames` / `getSeriesColorOverride` against the known series
// name universe.

/** Standard color field-config property id. */
const COLOR_PROP_ID = 'color';
/** Custom `hideFrom` field-config property id (registered via `addHideFrom`). */
const HIDE_FROM_PROP_ID = 'custom.hideFrom';

/** System-override ref core uses for the legend visibility toggle. */
const HIDE_SERIES_REF = 'hideSeriesFrom';
/** Matches the single `hideSeriesFrom` system override, as core writes it. */
const isHideSeriesOverride = isSystemOverrideWithRef(HIDE_SERIES_REF);

/** `hideFrom` value core writes for hidden series (kept in the legend, greyed). */
const HIDE_FROM_VALUE: HideSeriesConfig = { viz: true, legend: false, tooltip: true };

// `DynamicConfigValue.value` and `MatcherConfig.options` are typed `any`; narrow
// them through these guards so the readers stay type-safe without assertions.
function isHideSeriesConfig(value: unknown): value is HideSeriesConfig {
  return typeof value === 'object' && value !== null && 'viz' in value;
}

function isFieldColor(value: unknown): value is FieldColor {
  return typeof value === 'object' && value !== null && 'mode' in value;
}

interface ByNamesOptions {
  mode?: ByNamesMatcherMode;
  names?: string[];
}

function isByNamesOptions(value: unknown): value is ByNamesOptions {
  if (typeof value !== 'object' || value === null || !('names' in value)) {
    return false;
  }
  return Array.isArray(value.names);
}

/** The series name a `byName` override targets, or `undefined` for other matchers. */
function matcherName(rule: ConfigOverrideRule): string | undefined {
  return rule.matcher.id === FieldMatcherID.byName ? String(rule.matcher.options) : undefined;
}

/**
 * Add or replace a single property on the `byName(name)` override, creating the
 * override when absent. Other overrides and unrelated properties are preserved.
 */
function upsertProperty(
  overrides: ConfigOverrideRule[],
  name: string,
  property: DynamicConfigValue
): ConfigOverrideRule[] {
  const next = [...overrides];
  const index = next.findIndex((rule) => matcherName(rule) === name);

  if (index < 0) {
    next.push({ matcher: { id: FieldMatcherID.byName, options: name }, properties: [property] });
    return next;
  }

  const existing = next[index];
  const properties = existing.properties.filter((p) => p.id !== property.id);
  properties.push(property);
  next[index] = { ...existing, properties };
  return next;
}

/**
 * Persist a fixed color for a series by name (the legend color picker action).
 */
export function changeSeriesColorConfig(
  fieldConfig: FieldConfigSource,
  label: string,
  color: string
): FieldConfigSource {
  return {
    ...fieldConfig,
    overrides: upsertProperty(fieldConfig.overrides, label, {
      id: COLOR_PROP_ID,
      value: { mode: FieldColorModeId.Fixed, fixedColor: color } satisfies FieldColor,
    }),
  };
}

/** Fixed color overridden for a series by name, or `undefined` when unset. */
export function getSeriesColorOverride(fieldConfig: FieldConfigSource, name: string): string | undefined {
  for (const rule of fieldConfig.overrides) {
    if (matcherName(rule) !== name) {
      continue;
    }
    const color: unknown = rule.properties.find((p) => p.id === COLOR_PROP_ID)?.value;
    if (isFieldColor(color) && color.fixedColor) {
      return color.fixedColor;
    }
  }
  return undefined;
}

/** Build the `hideSeriesFrom` system override for the given kept (visible) names. */
function createHideOverride(keptNames: string[]): SystemConfigOverrideRule {
  return {
    __systemRef: HIDE_SERIES_REF,
    matcher: {
      id: FieldMatcherID.byNames,
      options: { mode: ByNamesMatcherMode.exclude, names: keptNames, prefix: 'All except:', readOnly: true },
    },
    properties: [{ id: HIDE_FROM_PROP_ID, value: HIDE_FROM_VALUE }],
  };
}

/** Names the `hideSeriesFrom` override keeps visible (its `byNames` list). */
function getKeptNames(rule: ConfigOverrideRule): string[] {
  const options: unknown = rule.matcher.options;
  if (!isByNamesOptions(options)) {
    return [];
  }
  return [...(options.names ?? [])];
}

/** Whether the `hideSeriesFrom` override actually hides from the viz. */
function overrideHidesViz(rule: ConfigOverrideRule): boolean {
  const value: unknown = rule.properties.find((p) => p.id === HIDE_FROM_PROP_ID)?.value;
  return isHideSeriesConfig(value) && value.viz;
}

/**
 * Whether a manual per-series `byName` `custom.hideFrom.viz` override targets
 * `name`. Exposed so row/series families can also match a slice by its underlying
 * field name (mirroring Grafana's `byName` matcher, which matches the field name
 * or its display name), not just the display title.
 */
export function isSeriesHiddenByName(fieldConfig: FieldConfigSource, name: string): boolean {
  return fieldConfig.overrides.some((rule) => matcherName(rule) === name && overrideHidesViz(rule));
}

/**
 * Series names currently hidden from the viz, resolved against `seriesNames` (the
 * full legend universe) straight from `fieldConfig` — the source of truth passed
 * fresh on every render.
 *
 * Every chart family reads hidden state here rather than from Grafana-applied
 * `custom.hideFrom.viz` on `data.series`: row/series families (pie slices,
 * candlestick/boxplot) have no field per legend item for the override engine to
 * target, and reading one source keeps the chart and DOM legend in lockstep.
 *
 * Two override shapes contribute:
 * - The `hideSeriesFrom` system override (the legend visibility toggle / core shape).
 * - Manual per-series "Hide in area" overrides (`byName` `custom.hideFrom.viz`).
 */
export function getHiddenSeriesNames(fieldConfig: FieldConfigSource, seriesNames: string[]): Set<string> {
  const hidden = new Set<string>();

  const override = fieldConfig.overrides.find(isHideSeriesOverride);
  if (override && overrideHidesViz(override)) {
    const options: unknown = override.matcher.options;
    const kept = getKeptNames(override);
    const isExclude =
      !isByNamesOptions(options) || (options.mode ?? ByNamesMatcherMode.exclude) === ByNamesMatcherMode.exclude;

    // exclude: hide everything not in `kept`; include: hide the listed names.
    for (const name of seriesNames) {
      if (isExclude ? !kept.includes(name) : kept.includes(name)) {
        hidden.add(name);
      }
    }
  } else {
    debug('getHiddenSeriesNames::noOverride', LOG_LEVELS.debug, {
      override,
      overrideHidesViz: override ? overrideHidesViz(override) : undefined,
    });
  }

  // Manual per-series "Hide in area" overrides (byName custom.hideFrom.viz).
  for (const name of seriesNames) {
    if (isSeriesHiddenByName(fieldConfig, name)) {
      hidden.add(name);
    }
  }

  debug('getHiddenSeriesNames::hiddenSeriesNames', LOG_LEVELS.debug, { hidden, seriesNames });
  return hidden;
}

/**
 * Persist a legend visibility toggle, matching Core Grafana's
 * `seriesVisibilityConfigFactory`: a single `hideSeriesFrom` system override with
 * a `byNames` `exclude` matcher naming the kept (visible) series.
 *
 * - ToggleSelection (plain click): isolate the clicked series; clicking the
 *   already-isolated series clears the override (all visible again).
 * - AppendToSelection (ctrl/cmd click, and pie/multi-value clicks): toggle just
 *   the clicked series in/out of the kept set.
 *
 * `seriesNames` is the full legend universe, needed to know when everything is
 * visible again (so the override can be dropped).
 *
 * The result must be applied with `onFieldConfigChange(next, true)` (replace
 * mode). The default merge mode cannot remove or shrink overrides, so restores
 * would silently never persist. See `FieldConfigChangeHandler` in `Panel.tsx`.
 */
export function toggleSeriesVisibilityConfig(
  fieldConfig: FieldConfigSource,
  label: string | string[] | null,
  mode: SeriesVisibilityChangeMode,
  seriesNames: string[]
): FieldConfigSource {
  // VizLegend always sends a single series name; ignore anything else.
  if (typeof label !== 'string') {
    debug('toggleSeriesVisibilityConfig::invalid label!', LOG_LEVELS.warn, { label });
    return fieldConfig;
  }

  const { overrides } = fieldConfig;
  const currentIndex = overrides.findIndex(isHideSeriesOverride);

  if (currentIndex < 0) {
    // Toggle isolates the clicked series; append hides only the clicked one
    // (keep everything else).
    const kept =
      mode === SeriesVisibilityChangeMode.ToggleSelection ? [label] : seriesNames.filter((name) => name !== label);
    return { ...fieldConfig, overrides: [...overrides, createHideOverride(kept)] };
  }

  const overridesCopy = [...overrides];
  const [current] = overridesCopy.splice(currentIndex, 1);

  if (mode === SeriesVisibilityChangeMode.ToggleSelection) {
    const existing = getKeptNames(current);
    // Clicking the already-isolated series restores all series.
    if (existing.length === 1 && existing[0] === label) {
      return { ...fieldConfig, overrides: overridesCopy };
    }

    return { ...fieldConfig, overrides: [...overridesCopy, createHideOverride([label])] };
  }

  // AppendToSelection: flip the clicked series in/out of the kept set.
  const kept = getKeptNames(current);
  const next = kept.includes(label) ? kept.filter((name) => name !== label) : [...kept, label];
  // Everything kept again => nothing hidden => drop the override.
  if (next.length >= seriesNames.length) {
    return { ...fieldConfig, overrides: overridesCopy };
  }

  return { ...fieldConfig, overrides: [...overridesCopy, createHideOverride(next)] };
}
