import { type DataFrame, type Field, type FieldConfig } from '@grafana/data';
import { type EChartsFieldConfig } from 'editor/types';

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

type Nullable<T> = T | null;
/**
 * Every value shape a field can hold across the panel's families — the widest
 * `V` a frame is described by before a family narrows it. Frames are
 * heterogeneous (a time column beside a value column beside a category label),
 * so `V` is the union over a frame's fields, not a claim about any one of them;
 * consumers narrow per field with the `isNumberField` / `isStringField` guards.
 */
export type EChartsValueType = Nullable<string> | Nullable<number> | Nullable<string[]> | Nullable<number[]>;

/** A frame whose field values are not yet narrowed to one family's value type. */
export type EChartsFrame = FieldTypedDataFrame<EChartsValueType, EChartsFieldConfig>;

export type NumericFrame = FieldTypedDataFrame<number, EChartsFieldConfig>;
