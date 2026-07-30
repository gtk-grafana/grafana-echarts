import {
  type DataFrame,
  type Field,
  type FieldConfigSource,
  getFieldDisplayName,
  type GrafanaTheme2,
} from '@grafana/data';
import { STREAM_LAYER_SOURCE_DEFAULT } from 'editor/stream';
import { type EChartsFieldConfig, type StreamLayerSource } from 'editor/types';
import { forEachTimeSeriesField } from 'lib/echarts/converters/frames';
import { getPaletteColorByIndex, getSeriesColor } from 'lib/echarts/style';
import { getSeriesColorOverride, getHiddenSeriesNames } from 'lib/grafana/fields/seriesConfig';
import { isNumberField, isStringField, isTimeField } from 'lib/grafana/narrowing';
import { type FieldTypedDataFrame } from 'lib/grafana/types';

/**
 * The stream (single-axis) data model: an ordered set of named layers, each a
 * time-ordered list of `[epochMs, value]` points. `getThemeRiverSeries`
 * (`lib/echarts/options/stream.ts`) flattens it to the `[time, value, name]`
 * triples ECharts wants.
 *
 * See `data-plane/stream.md` for the frame contract this implements.
 */
export interface StreamData {
  layers: StreamLayer[];
}

/** One river layer (ribbon). */
export interface StreamLayer {
  /** Layer name: a field display name, or a label-column value on the long path. */
  name: string;
  /** Ribbon color; fed to the series palette in layer order. */
  color: string;
  /**
   * Hidden via the legend visibility toggle. Kept in the model (rather than
   * filtered out) so the legend can grey the item and toggle it back — the same
   * reason `PieSliceModel` carries the flag. The series drops hidden layers; see
   * `visibleStreamLayers`.
   */
  hidden: boolean;
  /**
   * The numeric field behind this layer, present only on the fields path — a
   * long-path layer is a slice of *rows*, not a column. Carries the field's
   * unit/decimals for the tooltip and its data links for the pinned footer.
   */
  field?: Field<number>;
  /**
   * `[epochMs, value]` in emission order. Values are never null: a stacked ribbon
   * cannot break, so missing data is `0` (see `toStreamValue`).
   */
  points: Array<[number, number]>;
}

/**
 * A theme river stacks ribbons, so it has no way to draw a gap: an absent value
 * is zero-height, not a hole. Nulls therefore become `0` rather than `null` (the
 * opposite of the time-series converter, where a gap must stay a gap). ECharts
 * agrees — `ThemeRiverSeriesModel.fixData` zero-fills any `(layer, time)`
 * combination missing from the data.
 */
function toStreamValue(value: number | null | undefined): number {
  return value ?? 0;
}

/**
 * Whether a frame carries the three columns a pivot needs: a time field, a
 * numeric field, and a string field to group by.
 */
function canPivot(frame: DataFrame): boolean {
  return frame.fields.some(isTimeField) && frame.fields.some(isNumberField) && frame.fields.some(isStringField);
}

/**
 * Whether a frame is unambiguously long-shaped: pivotable *and* carrying exactly
 * one numeric field. That is the SQL `GROUP BY time, dim` shape, and the shape
 * every SQL expression returns (`time`, label columns, `__value__`).
 *
 * Deliberately narrow for Auto: with two or more numeric fields the frame reads
 * both ways ("two metrics" vs "one metric per label"), so Auto keeps the fields
 * path and the explicit `labels` source is how a user says otherwise.
 */
function isLongFrame(frame: DataFrame): boolean {
  return canPivot(frame) && frame.fields.filter(isNumberField).length === 1;
}

/** Resolve which shape a single frame is read as, honoring an explicit source. */
function readsAsLabels(frame: DataFrame, source: StreamLayerSource): boolean {
  if (source === 'fields') {
    return false;
  }
  // Explicit `labels` pivots any pivotable frame, using its *first* numeric field
  // as the value; a frame that cannot pivot falls back to the fields path rather
  // than rendering nothing.
  return source === 'labels' ? canPivot(frame) : isLongFrame(frame);
}

/**
 * One layer per numeric value field, across every frame — the wide/multi path.
 *
 * Reuses `forEachTimeSeriesField`, the same walk the time-series model uses, so a
 * one-frame-per-series response (Prometheus/Loki `TimeSeriesMulti`) yields one
 * layer per frame with no join, and layer order is frame index then field index.
 */
function collectFieldLayers(frames: DataFrame[], theme: GrafanaTheme2): Array<Omit<StreamLayer, 'hidden'>> {
  const layers: Array<Omit<StreamLayer, 'hidden'>> = [];
  // Narrowed to numeric values so the walk yields `Field<number>`: unlike the
  // time-series converter (which only reads values positionally), a layer keeps its
  // source field for the tooltip's unit/decimals and data links.
  const typedFrames: Array<FieldTypedDataFrame<number, EChartsFieldConfig>> = frames;

  forEachTimeSeriesField(typedFrames, ({ frame, field, timeField }) => {
    layers.push({
      name: getFieldDisplayName(field, frame, frames),
      color: getSeriesColor(field, theme),
      field,
      points: timeField.values.map((time, row) => [time, toStreamValue(field.values[row])]),
    });
  });

  return layers;
}

/**
 * One layer per distinct value of the first string field — the long path.
 *
 * Duplicate `(layer, time)` keys are **summed**: two rows for the same label at
 * the same timestamp would otherwise put two segments in one ribbon, which has no
 * defined baseline. Summing is the only aggregation consistent with stacking; the
 * user-facing alternative is a Group by transform upstream (see
 * `data-plane/stream.md`).
 *
 * Insertion order carries the layer order (first appearance) and, within a layer,
 * the point order, so both stay reproducible for the palette and the legend.
 */
function collectLabelLayers(frames: DataFrame[], theme: GrafanaTheme2): Array<Omit<StreamLayer, 'hidden'>> {
  const byName = new Map<string, Map<number, number>>();

  for (const frame of frames) {
    const timeField = frame.fields.find(isTimeField);
    const valueField = frame.fields.find(isNumberField);
    const labelField = frame.fields.find(isStringField);
    if (!timeField || !valueField || !labelField) {
      continue;
    }

    timeField.values.forEach((time, row) => {
      const name = labelField.values[row];
      if (name == null) {
        return;
      }
      const points = byName.get(name) ?? new Map<number, number>();
      points.set(time, (points.get(time) ?? 0) + toStreamValue(valueField.values[row]));
      byName.set(name, points);
    });
  }

  return Array.from(byName, ([name, points], index) => ({
    name,
    // A long-path layer is not a field, so the field's own color config would
    // paint every ribbon alike; the classic palette by position is the
    // categorical default (as for hierarchy nodes and pie slices). A legend
    // color-picker override still wins, matched by layer name.
    color: getPaletteColorByIndex(index, theme),
    points: Array.from(points, ([time, value]): [number, number] => [time, value]),
  }));
}

/**
 * Build the stream model from a query response.
 *
 * Two frame shapes are accepted (see `data-plane/stream.md`): time + N numeric
 * fields (one layer per field) and time + 1 numeric + a string label column (one
 * layer per label value). Detection is per frame and by field shape only —
 * `meta.type` is never read, matching every other model in this plugin.
 *
 * Returns `null` when no layer could be derived, so callers can fall back to a
 * no-data view.
 */
export function frameToStream(
  frames: DataFrame[],
  theme: GrafanaTheme2,
  fieldConfig: FieldConfigSource,
  source: StreamLayerSource = STREAM_LAYER_SOURCE_DEFAULT
): StreamData | null {
  const labelFrames = frames.filter((frame) => readsAsLabels(frame, source));
  const fieldFrames = frames.filter((frame) => !readsAsLabels(frame, source));

  const layers = [...collectFieldLayers(fieldFrames, theme), ...collectLabelLayers(labelFrames, theme)].filter(
    (layer) => layer.points.length > 0
  );

  if (layers.length === 0) {
    return null;
  }

  // Hidden state is read from `fieldConfig` for both paths, the same by-name route
  // the pie takes for slices. It has to be: a long-path layer is a set of *rows*,
  // so there is no field for Grafana's override engine to hide (the fields path
  // also loses its column upstream via `stripHiddenValueFields`, but the legend
  // builder is handed unstripped frames and needs the flag to grey its item).
  const hidden = getHiddenSeriesNames(
    fieldConfig,
    layers.map((layer) => layer.name)
  );

  return {
    layers: layers.map((layer) => ({
      ...layer,
      hidden: hidden.has(layer.name),
      // A legend color-picker override wins over both color sources above; it is
      // stored as a `byName` override, which Grafana can only apply to a field —
      // so a long-path layer has to read it here (as hierarchy nodes do).
      color: getSeriesColorOverride(fieldConfig, layer.name) ?? layer.color,
    })),
  };
}

/**
 * The layers that actually render, in emission order. Hidden layers are dropped
 * here rather than in the converter so the legend keeps their items; every
 * surface keyed to the emitted data (the series palette, the flattened triples,
 * the tooltip's `dataIndex` map) must derive from this same list.
 */
export function visibleStreamLayers(data: StreamData): StreamLayer[] {
  return data.layers.filter((layer) => !layer.hidden);
}
