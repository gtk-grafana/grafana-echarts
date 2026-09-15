import {
  createTheme,
  type DataFrame,
  type FieldConfigSource,
  FieldType,
  getDisplayProcessor,
  type Labels,
  type ReduceDataOptions,
  toDataFrame,
} from '@grafana/data';
import { GRAPH_EDGES_WIDE } from 'lib/echarts/relations/converters/contract';
import { applyTestFieldConfig } from 'test/fieldConfig';

/** Shared graph-wide frame fixtures. */

export const theme = createTheme();

/** Edges carried the contract's primary way: endpoints in labels. */
export const labelledEdges = (): DataFrame =>
  toDataFrame({
    name: 'edges',
    meta: { type: GRAPH_EDGES_WIDE },
    fields: [
      { name: 'e1', type: FieldType.number, labels: { source: 'a', target: 'b' }, values: [10] },
      { name: 'e2', type: FieldType.number, labels: { source: 'b', target: 'c' }, values: [20] },
    ],
  });

/** Edges carried the fallback way: endpoints in the field name. */
export const namedEdges = (): DataFrame =>
  toDataFrame({
    fields: [
      { name: 'a-->b', type: FieldType.number, values: [10] },
      { name: 'b-->c', type: FieldType.number, values: [20] },
    ],
  });

export const T0 = 1700000000000;
export const STEP = 300000;

/** One frame of a raw labelled response: `[Time, Value]`, endpoints on `Value`. */
export const rawSeries = (labels: Labels, values: Array<number | null>, times?: number[]): DataFrame =>
  toDataFrame({
    fields: [
      { name: 'Time', type: FieldType.time, values: times ?? values.map((_, row) => T0 + row * STEP) },
      { name: 'Value', type: FieldType.number, labels, values },
    ],
  });

/** The measured live-Mimir shape: N series, every value field called `Value`. */
export const valueEdges = (): DataFrame[] => [
  rawSeries({ source: 'a', target: 'b' }, [10, 12]),
  rawSeries({ source: 'b', target: 'c' }, [20, 22]),
  rawSeries({ source: 'a', target: 'c' }, [30, 32]),
];

export const withCalc = (calc: string): ReduceDataOptions => ({ calcs: [calc], values: false, fields: '' });

/** Attach the display processor `applyFieldOverrides` would have left behind. */
export const withDisplay = (frame: DataFrame): DataFrame => {
  for (const field of frame.fields) {
    field.display = getDisplayProcessor({ field, theme });
  }
  return frame;
};

/** The real pre-panel field-config pass, so an override is matched and resolved by Grafana rather than by the test. */
export const asPipelineWould = (frames: DataFrame[], overrides: FieldConfigSource['overrides'] = []): DataFrame[] =>
  applyTestFieldConfig(frames, { defaults: {}, overrides }, theme);
