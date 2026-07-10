import { type DataFrame } from '@grafana/data';
import { type EChartsFieldConfig } from 'editor/types';
import { isNumberField, isStringField } from 'lib/grafana/narrowing';
import { type FieldTypedDataFrame } from 'lib/grafana/types';

export function filterNonStringOrNumericFields(unfilteredFrames: DataFrame[]) {
  let frames: Array<FieldTypedDataFrame<number | string, EChartsFieldConfig>> = [];
  for (let i = 0; i < unfilteredFrames.length; i++) {
    const validFields = unfilteredFrames[i].fields.filter((f) => isNumberField(f) || isStringField(f));
    frames.push({
      ...unfilteredFrames[i],
      fields: validFields,
    });
  }
  return frames;
}
