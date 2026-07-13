import { type DataFrame } from '@grafana/data';
import { type EChartsFieldConfig } from 'editor/types';
import { isNumberField, isStringField, isTimeField } from 'lib/grafana/narrowing';
import { type FieldTypedDataFrame } from 'lib/grafana/types';

/**
 * @todo it's probably better to just ignore invalid fields instead of creating an extra copy of the frames
 * But filtering for now to keep things simple before we start worrying about performance optimizations.
 *
 * Drop fields the cartesian converters can't use, keeping string, numeric, and
 * time fields.
 */
export function filterUnsupportedFields(unfilteredFrames: DataFrame[]) {
  let frames: Array<FieldTypedDataFrame<number | string, EChartsFieldConfig>> = [];
  for (let i = 0; i < unfilteredFrames.length; i++) {
    const validFields = unfilteredFrames[i].fields.filter(
      (f) => isNumberField(f) || isStringField(f) || isTimeField(f)
    );
    frames.push({
      ...unfilteredFrames[i],
      fields: validFields,
    });
  }
  return frames;
}
