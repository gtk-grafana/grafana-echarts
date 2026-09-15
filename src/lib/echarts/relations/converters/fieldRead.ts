import { type GraphFieldConfig } from '@grafana/schema';

import { type ConfigTypedField } from 'lib/grafana/types';

import { type EChartsRelationsFieldConfig } from 'editor/relations/types';

/** Check whether a value is a record. */
export function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null;
}

export function customOf(
  field: ConfigTypedField<number | string, EChartsRelationsFieldConfig>
): Readonly<EChartsRelationsFieldConfig> {
  const custom = field.config.custom;
  return isRecord(custom) ? custom : {};
}

export function numberFrom(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** Check whether the mark field is hidden. */
export function isHiddenFrom(field: ConfigTypedField<number | string, GraphFieldConfig>): boolean {
  const hideFrom = customOf(field).hideFrom;
  return isRecord(hideFrom) && hideFrom.viz;
}

export function stringFrom(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}
