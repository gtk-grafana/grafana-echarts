import { type Field } from '@grafana/data';
import { type CartesianSingleValueSeriesType } from 'editor/types';
import { isCartesianSingleValueSeriesType } from 'lib/echarts/charts/narrowing';
import { getFieldConfigFromField } from 'lib/grafana/fields/fieldConfig';

/**
 * Per-field cartesian render overrides, shared by both cartesian converters
 * (time axis and category axis) so a panel mixes render types the same way
 * whichever axis its data selects. The editor registers these for the whole
 * cartesian family (see `modules/cartesian/module.tsx`), so reading them on only
 * one axis path leaves the control visible but inert.
 */

/**
 * Resolve the series type for a single value field: field override wins when cartesian.
 *
 * The `isCartesianSingleValueSeriesType` gate drops overrides the per-field
 * picker offers but no single series can render — `candlestick` / `boxplot` build
 * one series from several fields, and `Auto` means "inherit" — so those fall back
 * to `defaultType` (the panel-level series type).
 */
export function resolveFieldSeriesType<T>(field: Field, defaultType: T): T | CartesianSingleValueSeriesType {
  const seriesTypeOverride = getFieldConfigFromField(field).custom?.seriesType;
  if (seriesTypeOverride && isCartesianSingleValueSeriesType(seriesTypeOverride)) {
    return seriesTypeOverride;
  }
  return defaultType;
}

/**
 * Whether a bar field should stack: field override wins over the panel default.
 * Only bar series stack, so callers gate on the resolved render type.
 */
export function resolveFieldStack(field: Field, panelStack = false): boolean {
  const override = getFieldConfigFromField(field).custom?.stackSeries;
  return override ?? panelStack;
}
