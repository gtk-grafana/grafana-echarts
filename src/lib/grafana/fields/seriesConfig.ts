import {
  type ConfigOverrideRule,
  type DynamicConfigValue,
  type FieldColor,
  FieldColorModeId,
  type FieldConfigSource,
  FieldMatcherID,
} from '@grafana/data';
import { type HideSeriesConfig } from '@grafana/schema';
import { SeriesVisibilityChangeMode } from '@grafana/ui';

// Legend interaction write-back: both `onSeriesColorChange` and
// `onToggleSeriesVisibility` persist their result as `byName` field-config
// overrides (see `Panel.tsx`), which Grafana re-applies to `data.series` before
// the next render. This mirrors how Core Grafana wires its legend callbacks, but
// the core factories are not exported to plugins, so we replicate them here.
//
// A single representation serves two consumers:
// - Per-field families (cartesian/radar/heatmap overlays): Grafana's override
//   engine applies the `byName` override onto the matching field, so the chart
//   reads it back through `field.config` (color) or `hideFrom.viz` (stripping).
// - Row/series families (pie slices, candlestick/boxplot): no field is named
//   after the item, so the engine ignores it and the converters read the
//   overrides directly via `getHiddenSeriesNames` / `getSeriesColorOverride`.

/** Standard color field-config property id. */
const COLOR_PROP_ID = 'color';
/** Custom `hideFrom` field-config property id (registered via `addHideFrom`). */
const HIDE_FROM_PROP_ID = 'custom.hideFrom';

/** `hideFrom` value that hides a series from the viz only (legend keeps it, greyed). */
const HIDE_FROM_VIZ: HideSeriesConfig = { viz: true, legend: false, tooltip: false };

/** The series name a `byName` override targets, or `undefined` for other matchers. */
function matcherName(rule: ConfigOverrideRule): string | undefined {
  return rule.matcher.id === FieldMatcherID.byName ? String(rule.matcher.options) : undefined;
}

// `DynamicConfigValue.value` is typed `any`; narrow it through these guards so
// the readers stay type-safe without assertions.
function isHideSeriesConfig(value: unknown): value is HideSeriesConfig {
  return typeof value === 'object' && value !== null && 'viz' in value;
}

function isFieldColor(value: unknown): value is FieldColor {
  return typeof value === 'object' && value !== null && 'mode' in value;
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

/** Series names currently hidden from the viz via a `byName` `hideFrom` override. */
export function getHiddenSeriesNames(fieldConfig: FieldConfigSource): Set<string> {
  const hidden = new Set<string>();

  for (const rule of fieldConfig.overrides) {
    const name = matcherName(rule);
    if (name === undefined) {
      continue;
    }
    const hideFrom: unknown = rule.properties.find((p) => p.id === HIDE_FROM_PROP_ID)?.value;
    if (isHideSeriesConfig(hideFrom) && hideFrom.viz) {
      hidden.add(name);
    }
  }

  return hidden;
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

/** Normalize the callback's `string | string[] | null` label into a name list. */
function normalizeLabels(label: string | string[] | null): string[] {
  if (label == null) {
    return [];
  }
  return Array.isArray(label) ? label : [label];
}

/**
 * Compute the next hidden set from a legend click, matching Core Grafana's UX:
 * - ToggleSelection (plain click): if the clicked series is the only visible one
 *   show all; otherwise isolate it (hide every other series).
 * - AppendToSelection (ctrl/cmd click): toggle just the clicked series.
 * - SetExactly: hide everything except the clicked series.
 */
function computeNextHidden(
  current: Set<string>,
  label: string | string[] | null,
  mode: SeriesVisibilityChangeMode,
  seriesNames: string[]
): Set<string> {
  const labels = normalizeLabels(label);
  if (labels.length === 0) {
    return current;
  }

  if (mode === SeriesVisibilityChangeMode.AppendToSelection) {
    const next = new Set(current);
    for (const name of labels) {
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
    }
    return next;
  }

  const isolated = new Set(seriesNames.filter((name) => !labels.includes(name)));

  if (mode === SeriesVisibilityChangeMode.ToggleSelection) {
    const visible = seriesNames.filter((name) => !current.has(name));
    const onlyLabelsVisible = visible.length === labels.length && labels.every((name) => visible.includes(name));
    // Clicking the already-isolated series restores all series.
    return onlyLabelsVisible ? new Set() : isolated;
  }

  // SetExactly
  return isolated;
}

/** Rewrite `byName` `hideFrom` overrides so exactly `hidden` are hidden from the viz. */
function applyHiddenSet(fieldConfig: FieldConfigSource, hidden: Set<string>): FieldConfigSource {
  // Drop existing hideFrom properties (and now-empty byName overrides) so the
  // hidden set is authoritative; color/other overrides are left untouched.
  let overrides = fieldConfig.overrides
    .map((rule) => {
      if (matcherName(rule) === undefined) {
        return rule;
      }
      return { ...rule, properties: rule.properties.filter((p) => p.id !== HIDE_FROM_PROP_ID) };
    })
    .filter((rule) => matcherName(rule) === undefined || rule.properties.length > 0);

  for (const name of hidden) {
    overrides = upsertProperty(overrides, name, { id: HIDE_FROM_PROP_ID, value: HIDE_FROM_VIZ });
  }

  return { ...fieldConfig, overrides };
}

/**
 * Persist series visibility for a legend toggle (the legend label click action).
 * `seriesNames` is the full set of legend series, needed for the isolate logic.
 */
export function toggleSeriesVisibilityConfig(
  fieldConfig: FieldConfigSource,
  label: string | string[] | null,
  mode: SeriesVisibilityChangeMode,
  seriesNames: string[]
): FieldConfigSource {
  const current = getHiddenSeriesNames(fieldConfig);
  const next = computeNextHidden(current, label, mode, seriesNames);
  return applyHiddenSet(fieldConfig, next);
}
