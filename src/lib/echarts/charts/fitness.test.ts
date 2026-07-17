import {
  createDataFrame,
  type DataFrame,
  DataFrameType,
  FieldType,
  getPanelDataSummary,
  VisualizationSuggestionScore,
} from '@grafana/data';
import { scoreCartesian, scoreHeatmap, scoreMultivariate, scorePartToWhole } from 'lib/echarts/charts/fitness';

// These fixtures mirror the per-family suggestions.test.ts cases so the shared
// fitness predicates are verified against the exact PanelDataSummary shapes the
// suppliers rely on. This is the regression net that keeps the suggestion cards
// and the panel-level 'Auto' resolver from drifting apart.
const summaryOf = (...frames: DataFrame[]) => getPanelDataSummary(frames);

describe('scoreHeatmap', () => {
  it('scores Best for HeatmapRows frames', () => {
    expect(
      scoreHeatmap(
        summaryOf(
          createDataFrame({
            meta: { type: DataFrameType.HeatmapRows },
            fields: [
              { name: 'xMax', type: FieldType.time, values: [0, 100] },
              { name: '1', type: FieldType.number, values: [1, 2] },
            ],
          })
        )
      )
    ).toBe(VisualizationSuggestionScore.Best);
  });

  it('scores Best for HeatmapCells frames', () => {
    expect(
      scoreHeatmap(
        summaryOf(
          createDataFrame({
            meta: { type: DataFrameType.HeatmapCells },
            fields: [
              { name: 'xMin', type: FieldType.number, values: [0, 1] },
              { name: 'yMin', type: FieldType.number, values: [0, 1] },
              { name: 'count', type: FieldType.number, values: [1, 2] },
            ],
          })
        )
      )
    ).toBe(VisualizationSuggestionScore.Best);
  });

  it('does not fit a plain time series frame', () => {
    expect(
      scoreHeatmap(
        summaryOf(
          createDataFrame({
            meta: { type: DataFrameType.TimeSeriesWide },
            fields: [
              { name: 'time', type: FieldType.time, values: [0, 100] },
              { name: 'value', type: FieldType.number, values: [1, 2] },
            ],
          })
        )
      )
    ).toBeUndefined();
  });
});

describe('scoreCartesian', () => {
  const timeNumber = (type?: DataFrameType) =>
    createDataFrame({
      ...(type ? { meta: { type } } : {}),
      fields: [
        { name: 'time', type: FieldType.time, values: [0, 100, 200] },
        { name: 'value', type: FieldType.number, values: [1, 2, 3] },
      ],
    });

  it('does not fit without a time field', () => {
    expect(
      scoreCartesian(
        summaryOf(createDataFrame({ fields: [{ name: 'value', type: FieldType.number, values: [1, 2, 3] }] }))
      )
    ).toBeUndefined();
  });

  it('does not fit without a numeric field', () => {
    expect(
      scoreCartesian(
        summaryOf(createDataFrame({ fields: [{ name: 'time', type: FieldType.time, values: [0, 100, 200] }] }))
      )
    ).toBeUndefined();
  });

  it('does not fit a single row', () => {
    expect(
      scoreCartesian(
        summaryOf(
          createDataFrame({
            fields: [
              { name: 'time', type: FieldType.time, values: [0] },
              { name: 'value', type: FieldType.number, values: [1] },
            ],
          })
        )
      )
    ).toBeUndefined();
  });

  it('does not fit instant (snapshot) data', () => {
    expect(
      scoreCartesian(
        summaryOf(
          createDataFrame({
            fields: [
              { name: 'time', type: FieldType.time, values: [100, 100, 100] },
              { name: 'value', type: FieldType.number, values: [1, 2, 3] },
            ],
          })
        )
      )
    ).toBeUndefined();
  });

  it('scores OK for untyped time + number data', () => {
    expect(scoreCartesian(summaryOf(timeNumber()))).toBe(VisualizationSuggestionScore.OK);
  });

  it('scores Good for explicit time series frame types', () => {
    expect(scoreCartesian(summaryOf(timeNumber(DataFrameType.TimeSeriesWide)))).toBe(VisualizationSuggestionScore.Good);
  });
});

describe('scorePartToWhole', () => {
  it('does not fit without a numeric field', () => {
    expect(
      scorePartToWhole(
        summaryOf(createDataFrame({ fields: [{ name: 'label', type: FieldType.string, values: ['a', 'b'] }] }))
      )
    ).toBeUndefined();
  });

  it('does not fit a multi-point (non-instant, non-numeric) time series', () => {
    expect(
      scorePartToWhole(
        summaryOf(
          createDataFrame({
            fields: [
              { name: 'time', type: FieldType.time, values: [0, 100, 200] },
              { name: 'value', type: FieldType.number, values: [1, 2, 3] },
            ],
          })
        )
      )
    ).toBeUndefined();
  });

  it('scores Good for numeric frame types', () => {
    expect(
      scorePartToWhole(
        summaryOf(
          createDataFrame({
            meta: { type: DataFrameType.NumericWide },
            fields: [
              { name: 'a', type: FieldType.number, values: [1] },
              { name: 'b', type: FieldType.number, values: [2] },
            ],
          })
        )
      )
    ).toBe(VisualizationSuggestionScore.Good);
  });

  it('scores OK for instant numeric data without a dataplane type', () => {
    expect(
      scorePartToWhole(
        summaryOf(
          createDataFrame({
            fields: [
              { name: 'time', type: FieldType.time, values: [100] },
              { name: 'value', type: FieldType.number, values: [42] },
            ],
          })
        )
      )
    ).toBe(VisualizationSuggestionScore.OK);
  });
});

describe('scoreMultivariate', () => {
  it('does not fit with fewer than two numeric fields', () => {
    expect(
      scoreMultivariate(
        summaryOf(
          createDataFrame({
            fields: [
              { name: 'metric', type: FieldType.string, values: ['a', 'b'] },
              { name: 'value', type: FieldType.number, values: [1, 2] },
            ],
          })
        )
      )
    ).toBeUndefined();
  });

  it('scores OK for multiple numeric metrics', () => {
    expect(
      scoreMultivariate(
        summaryOf(
          createDataFrame({
            fields: [
              { name: 'entity', type: FieldType.string, values: ['a', 'b'] },
              { name: 'speed', type: FieldType.number, values: [1, 2] },
              { name: 'power', type: FieldType.number, values: [3, 4] },
            ],
          })
        )
      )
    ).toBe(VisualizationSuggestionScore.OK);
  });
});
