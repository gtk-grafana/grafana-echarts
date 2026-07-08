import { type DataFrame, type FieldConfig, FieldType } from '@grafana/data';
import { type EChartsFieldConfig } from 'editor/types';
import { isCartesianSingleValueSeriesType } from 'lib/echarts/charts/narrowing';
import { getFieldConfigFromField } from 'lib/grafana/fields/fieldConfig';
import { type FieldTypedDataFrame } from 'lib/grafana/types';

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
export function frameHasCartesianOverride<V>(frame: DataFrame): frame is FieldTypedDataFrame<V, EChartsFieldConfig> {
  return frame.fields.some((field) => {
    if (field.type !== FieldType.number) {
      return false;
    }
    const config: FieldConfig<EChartsFieldConfig> = getFieldConfigFromField(field);
    const seriesTypeOverride = config.custom?.seriesType;
    return seriesTypeOverride != null && isCartesianSingleValueSeriesType(seriesTypeOverride);
  });
}
