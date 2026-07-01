import { type DataFrame, FieldType } from '@grafana/data';
import { cartesianTimeSeriesTypes } from 'editor/constants';
import { type EChartsFieldConfig } from 'editor/types';
/**
 * Whether a frame has at least one numeric value field whose custom field
 * config overrides the series type to a cartesian type (line/bar/scatter).
 *
 * When the panel is forced to `heatmap`, such a frame is drawn as a cartesian
 * overlay on top of the heatmap (e.g. a metric line over the cells) instead of
 * being folded into the heatmap layer. A frame is treated as an overlay if
 * *any* of its value fields is overridden, since a `byFrameRefID` override
 * applies the same series type to every field in the frame.
 */
export function frameHasCartesianOverride(frame: DataFrame): boolean {
  return frame.fields.some((field) => {
    if (field.type !== FieldType.number) {
      return false;
    }
    const override = (field.config.custom as EChartsFieldConfig | undefined)?.seriesType;
    return override != null && cartesianTimeSeriesTypes.includes(override);
  });
}
