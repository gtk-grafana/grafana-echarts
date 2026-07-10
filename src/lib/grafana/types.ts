import { type DataFrame, type Field, type FieldConfig } from '@grafana/data';
import { EChartsFieldConfig } from 'editor/types';

/**
 * It has always bothered me that the exposed types include generics which make it very cumbersome to avoid type assertions
 * @todo can we expose a templated DataFrame from core to help other plugins?
 */
export interface FieldTypedDataFrame<V, C> extends DataFrame {
  fields: Array<ConfigTypedField<V, C>>;
}
export interface ConfigTypedField<V, C> extends Field<V> {
  config: FieldConfig<C>;
}

export type NumericFrame = FieldTypedDataFrame<number, EChartsFieldConfig>;
