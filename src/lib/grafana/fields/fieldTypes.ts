import { type EChartsRelationsFieldConfig } from 'editor/types';
import { type ConfigTypedField, type FieldTypedDataFrame } from 'lib/grafana/types';

// Relations
export type RelationsFamilyValue = string | number | null;
export type RelationsFamilyFrame = FieldTypedDataFrame<RelationsFamilyValue, EChartsRelationsFieldConfig>;
export type RelationsFamilyField = ConfigTypedField<RelationsFamilyValue, EChartsRelationsFieldConfig>;
