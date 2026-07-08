import { type Field, type FieldConfig } from '@grafana/data';
import type { EChartsFieldConfig } from 'editor/types';

export function getFieldConfigFromField(field: Field): FieldConfig<EChartsFieldConfig> {
  return field.config;
}
