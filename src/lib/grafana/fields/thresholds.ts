import { type Field, getMinMaxAndDelta, type GrafanaTheme2, sortThresholds, ThresholdsMode } from '@grafana/data';
import { GraphThresholdsStyleMode } from '@grafana/schema';
import { type EChartsGraphFieldConfig } from 'editor/types';
import { type ConfigTypedField } from 'lib/grafana/types';

// Adapts Grafana's threshold field config into a chart-agnostic model that the
// ECharts option builder (lib/echarts/options/thresholds.ts) can render, keeping
// the Grafana API isolated from ECharts. Grafana docs:
// https://grafana.com/docs/grafana/latest/panels-visualizations/configure-thresholds/

// Field typed so the cartesian panel's custom config (`thresholdsStyle`) is
// visible without asserting on Grafana's untyped `FieldConfig.custom`.
type ThresholdField = ConfigTypedField<unknown, EChartsGraphFieldConfig>;

/** A threshold step resolved to an absolute y-axis value with a theme color. */
export interface ResolvedThreshold {
  /** Absolute y value; the leading base step keeps `-Infinity`. */
  value: number;
  color: string;
}

/** Which threshold visuals to draw, derived from the field's display mode. */
export interface ThresholdDisplayFlags {
  line: boolean;
  dashed: boolean;
  area: boolean;
}

/**
 * The per-field threshold display mode (custom field config `thresholdsStyle`),
 * defaulting to `Off` when unset.
 */
export function getThresholdsStyleMode(field: ThresholdField): GraphThresholdsStyleMode {
  return field.config.custom?.thresholdsStyle?.mode ?? GraphThresholdsStyleMode.Off;
}

/**
 * Map a Grafana threshold display mode to render flags. Returns `null` when
 * nothing should be drawn: `Off`, or the per-value `Series` mode (coloring the
 * series by value), which is out of scope for this plugin.
 */
export function thresholdDisplayForMode(mode: GraphThresholdsStyleMode): ThresholdDisplayFlags | null {
  switch (mode) {
    case GraphThresholdsStyleMode.Line:
      return { line: true, dashed: false, area: false };
    case GraphThresholdsStyleMode.Dashed:
      return { line: true, dashed: true, area: false };
    case GraphThresholdsStyleMode.Area:
      return { line: false, dashed: false, area: true };
    case GraphThresholdsStyleMode.LineAndArea:
      return { line: true, dashed: false, area: true };
    case GraphThresholdsStyleMode.DashedAndArea:
      return { line: true, dashed: true, area: true };
    default:
      return null;
  }
}

/**
 * Resolve a field's threshold steps to absolute y values with theme colors.
 *
 * Percentage-mode steps are on a 0-100 scale relative to the field's [min, max]
 * range (Grafana compares `percent * 100 >= step.value`; see
 * `getActiveThresholdForValue`), so they are mapped onto that range here. The
 * leading base step (`-Infinity`) is preserved so callers can pin the lowest
 * region to the axis edge. Returns `null` when the field has no thresholds.
 */
export function resolveFieldThresholds(field: Field, theme: GrafanaTheme2): ResolvedThreshold[] | null {
  // Thresholds are a standard field config, so a plain `Field` suffices here.
  const thresholds = field.config.thresholds;
  if (!thresholds?.steps?.length) {
    return null;
  }

  let range: { min: number; delta: number } | undefined;
  if (thresholds.mode === ThresholdsMode.Percentage) {
    const { min, delta } = getMinMaxAndDelta(field);
    range = { min: min ?? 0, delta: delta ?? 0 };
  }

  // Grafana normally stores steps ascending, but sort defensively (on a copy, to
  // avoid mutating the field config) since the area bands assume that order.
  return sortThresholds([...thresholds.steps]).map((step) => ({
    value: resolveStepValue(step.value, range),
    color: theme.visualization.getColorByName(step.color),
  }));
}

/**
 * Map a step value to absolute; percentage steps scale onto [min, min + delta].
 * Non-finite base values (`-Infinity`, or `null` from saved JSON) pass through so
 * the builder can pin the lowest region to the axis edge.
 */
function resolveStepValue(value: number, range?: { min: number; delta: number }): number {
  if (!range || !Number.isFinite(value)) {
    return value;
  }
  return range.min + (value / 100) * range.delta;
}

/**
 * First field whose threshold display is active (style not `Off`/`Series` and
 * steps configured). Thresholds render once on the shared value axis, so a
 * single representative field is enough; Grafana applies panel-default field
 * config to every field, so this covers the common case.
 */
export function findThresholdField(fields: ThresholdField[]): ThresholdField | undefined {
  return fields.find(
    (field) =>
      thresholdDisplayForMode(getThresholdsStyleMode(field)) !== null && !!field.config.thresholds?.steps?.length
  );
}
