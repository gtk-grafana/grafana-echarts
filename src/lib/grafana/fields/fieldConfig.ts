import { type FieldConfig } from '@grafana/data';
import type { EChartsFieldConfig } from 'editor/types';
import { type ConfigTypedField } from 'lib/grafana/types';

export function getFieldConfigFromField<V>(
  field: ConfigTypedField<V, EChartsFieldConfig>
): FieldConfig<EChartsFieldConfig> {
  return field.config;
}
