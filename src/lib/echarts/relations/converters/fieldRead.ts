import { type GraphFieldConfig } from '@grafana/schema';

import { type ConfigTypedField } from 'lib/grafana/types';

import { type EChartsRelationsFieldConfig } from 'editor/relations/types';
/**
 * Narrowing reads for the arbitrary shapes a `fieldConfig` hands back. `custom` is
 * `any` on the Grafana type, so every read of a per-mark setting goes through one of
 * these rather than a cast.
 *
 * The leaf of the reader's module graph: nothing here knows about the graph contract.
 */

/**
 * A mark's `custom` config, read defensively: `FieldConfig['custom']` is `any`, and the
 * per-mark keys this contract defines are plugin-declared rather than guaranteed by any
 * type. Every read below is narrowed individually.
 */
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

/**
 * Whether the mark's own field is hidden from the visualization.
 *
 * The standard `custom.hideFrom.viz` config, read straight off the field — which is
 * only meaningful because a mark *is* a field: Grafana's override engine matched and
 * applied it upstream, so both the legend's visibility toggle and a hand-written
 * `byName` "Hide in area" override arrive here already resolved onto the right mark.
 */
export function isHiddenFrom(field: ConfigTypedField<number | string, GraphFieldConfig>): boolean {
  const hideFrom = customOf(field).hideFrom;
  return isRecord(hideFrom) && hideFrom.viz;
}

export function stringFrom(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}
