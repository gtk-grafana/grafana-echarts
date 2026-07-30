import {
  createDataFrame,
  type DataFrame,
  DataFrameType,
  FieldType,
  getPanelDataSummary,
  VisualizationSuggestionScore,
} from '@grafana/data';
import {
  exceedsChordNodeBudget,
  resolveMultiValueSuggestion,
  resolvePartToWholeSlices,
  scoreCartesian,
  scoreCategoryCartesian,
  scoreHeatmap,
  scoreHierarchy,
  scoreMatrixHeatmap,
  scoreMultivariate,
  scorePartToWhole,
  scoreRelations,
  scoreScatter,
  scoreStream,
} from 'lib/echarts/charts/fitness';
import {
  ALL_VALUES_MAX_ROWS,
  CATEGORY_MAX_ROWS,
  MULTIVARIATE_MAX_AXES,
  RELATIONS_CHORD_MAX_NODES,
  RELATIONS_MAX_EDGES,
  SLICE_MAX,
  STREAM_MAX_LAYERS,
} from 'lib/echarts/charts/suggestionLimits';

// These fixtures mirror the per-family suggestions.test.ts cases so the shared
// fitness predicates are verified against the exact PanelDataSummary shapes the
// suppliers rely on. This is the regression net for the size gates — every
// boundary below is asserted on both sides, because an off-by-one here either
// suggests a chart that cannot draw or silently withholds a good one.
const summaryOf = (...frames: DataFrame[]) => getPanelDataSummary(frames);

/** A category table: one string label column plus `numericFields` value columns. */
const categoryFrame = (numericFields: number, rows: number) =>
  createDataFrame({
    fields: [
      { name: 'label', type: FieldType.string, values: Array.from({ length: rows }, (_, row) => `c${row}`) },
      ...Array.from({ length: numericFields }, (_, field) => ({
        name: `value-${field}`,
        type: FieldType.number,
        values: Array.from({ length: rows }, (_, row) => row + field),
      })),
    ],
  });

/** A wide time series: one time column plus `numericFields` value columns. */
const timeFrame = (numericFields: number, rows: number, type?: DataFrameType) =>
  createDataFrame({
    ...(type ? { meta: { type } } : {}),
    fields: [
      { name: 'time', type: FieldType.time, values: Array.from({ length: rows }, (_, row) => row * 1000) },
      ...Array.from({ length: numericFields }, (_, field) => ({
        name: `value-${field}`,
        type: FieldType.number,
        values: Array.from({ length: rows }, (_, row) => row + field),
      })),
    ],
  });

/**
 * A one-frame-per-series time series: what TestData `random_walk` with
 * `seriesCount: N` returns, and the shape `pie-parity.json` reduces into slices.
 */
const multiSeriesTimeFrames = (series: number, rows: number) =>
  Array.from({ length: series }, () => timeFrame(1, rows, DataFrameType.TimeSeriesMulti));

/** A node-graph edges frame with `rows` edges. */
const edgesFrame = (rows: number) =>
  createDataFrame({
    name: 'edges',
    fields: [
      { name: 'id', type: FieldType.string, values: Array.from({ length: rows }, (_, row) => `e${row}`) },
      { name: 'source', type: FieldType.string, values: Array.from({ length: rows }, (_, row) => `n${row}`) },
      { name: 'target', type: FieldType.string, values: Array.from({ length: rows }, (_, row) => `n${row + 1}`) },
    ],
  });

/** A node-graph nodes frame with `rows` nodes. */
const nodesFrame = (rows: number) =>
  createDataFrame({
    name: 'nodes',
    fields: [
      { name: 'id', type: FieldType.string, values: Array.from({ length: rows }, (_, row) => `n${row}`) },
      { name: 'title', type: FieldType.string, values: Array.from({ length: rows }, (_, row) => `node ${row}`) },
    ],
  });

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

  it('scores Best for a wide frame whose numeric columns are named for bucket bounds', () => {
    expect(
      scoreHeatmap(
        summaryOf(
          createDataFrame({
            fields: [
              { name: 'time', type: FieldType.time, values: [0, 100] },
              { name: '0.1', type: FieldType.number, values: [1, 2] },
              { name: '0.5', type: FieldType.number, values: [3, 4] },
              { name: '1', type: FieldType.number, values: [5, 6] },
            ],
          })
        )
      )
    ).toBe(VisualizationSuggestionScore.Best);
  });

  it('scores Best for a Prometheus histogram (one le-labelled field per frame)', () => {
    const bucket = (le: string) =>
      createDataFrame({
        meta: { type: DataFrameType.TimeSeriesMulti },
        fields: [
          { name: 'time', type: FieldType.time, values: [0, 100] },
          { name: 'value', type: FieldType.number, values: [1, 2], labels: { le } },
        ],
      });

    expect(scoreHeatmap(summaryOf(bucket('0.1'), bucket('0.5')))).toBe(VisualizationSuggestionScore.Best);
  });

  it('does not fit a plain time series frame', () => {
    expect(scoreHeatmap(summaryOf(timeFrame(1, 2, DataFrameType.TimeSeriesWide)))).toBeUndefined();
  });

  it('does not fit a time frame with named (non-bucket) metrics', () => {
    expect(scoreHeatmap(summaryOf(timeFrame(3, 2)))).toBeUndefined();
  });

  it('does not fit a single bucket, which is a plain time series', () => {
    expect(
      scoreHeatmap(
        summaryOf(
          createDataFrame({
            fields: [
              { name: 'time', type: FieldType.time, values: [0, 100] },
              { name: '0.1', type: FieldType.number, values: [1, 2] },
            ],
          })
        )
      )
    ).toBeUndefined();
  });
});

describe('scoreMatrixHeatmap', () => {
  it('scores Good for a categorical numeric grid', () => {
    expect(scoreMatrixHeatmap(summaryOf(categoryFrame(3, 4)))).toBe(VisualizationSuggestionScore.Good);
  });

  it('does not fit when a time field is present (that is the binned layout)', () => {
    expect(scoreMatrixHeatmap(summaryOf(timeFrame(3, 4)))).toBeUndefined();
  });

  it('does not fit without a string field to label the rows', () => {
    expect(
      scoreMatrixHeatmap(
        summaryOf(
          createDataFrame({
            fields: [
              { name: 'a', type: FieldType.number, values: [1, 2] },
              { name: 'b', type: FieldType.number, values: [3, 4] },
            ],
          })
        )
      )
    ).toBeUndefined();
  });

  it('does not fit a single numeric column, which is a bar chart', () => {
    expect(scoreMatrixHeatmap(summaryOf(categoryFrame(1, 4)))).toBeUndefined();
  });

  it('does not fit a single row', () => {
    expect(scoreMatrixHeatmap(summaryOf(categoryFrame(3, 1)))).toBeUndefined();
  });
});

describe('scoreCartesian', () => {
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
    expect(scoreCartesian(summaryOf(timeFrame(1, 1)))).toBeUndefined();
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
    expect(scoreCartesian(summaryOf(timeFrame(1, 3)))).toBe(VisualizationSuggestionScore.OK);
  });

  it('scores Good for explicit time series frame types', () => {
    expect(scoreCartesian(summaryOf(timeFrame(1, 3, DataFrameType.TimeSeriesWide)))).toBe(
      VisualizationSuggestionScore.Good
    );
  });
});

describe('scoreCategoryCartesian', () => {
  it('scores Good for a string + numeric table with no time field', () => {
    expect(scoreCategoryCartesian(summaryOf(categoryFrame(1, 5)))).toBe(VisualizationSuggestionScore.Good);
  });

  it('does not fit when a time field is present', () => {
    expect(scoreCategoryCartesian(summaryOf(timeFrame(1, 5)))).toBeUndefined();
  });

  it('does not fit without a string field to label the categories', () => {
    expect(
      scoreCategoryCartesian(
        summaryOf(
          createDataFrame({
            fields: [
              { name: 'a', type: FieldType.number, values: [1, 2] },
              { name: 'b', type: FieldType.number, values: [3, 4] },
            ],
          })
        )
      )
    ).toBeUndefined();
  });

  it('does not fit a single row', () => {
    expect(scoreCategoryCartesian(summaryOf(categoryFrame(1, 1)))).toBeUndefined();
  });

  it(`fits at ${CATEGORY_MAX_ROWS} rows and withholds at ${CATEGORY_MAX_ROWS + 1}`, () => {
    expect(scoreCategoryCartesian(summaryOf(categoryFrame(1, CATEGORY_MAX_ROWS)))).toBe(
      VisualizationSuggestionScore.Good
    );
    expect(scoreCategoryCartesian(summaryOf(categoryFrame(1, CATEGORY_MAX_ROWS + 1)))).toBeUndefined();
  });
});

describe('scoreScatter', () => {
  it('scores Good for two numeric fields with no time field', () => {
    expect(
      scoreScatter(
        summaryOf(
          createDataFrame({
            fields: [
              { name: 'x', type: FieldType.number, values: [1, 2, 3] },
              { name: 'y', type: FieldType.number, values: [4, 5, 6] },
            ],
          })
        )
      )
    ).toBe(VisualizationSuggestionScore.Good);
  });

  it('does not fit when a time field is present', () => {
    expect(scoreScatter(summaryOf(timeFrame(2, 3)))).toBeUndefined();
  });

  it('does not fit a single numeric field', () => {
    expect(scoreScatter(summaryOf(categoryFrame(1, 3)))).toBeUndefined();
  });

  it('does not fit a single row', () => {
    expect(scoreScatter(summaryOf(categoryFrame(2, 1)))).toBeUndefined();
  });

  // Unlike the category branch, a value axis is not row-bounded — more points is
  // what a scatter is for. Preview cost is capped by PREVIEW_MAX_ROWS instead.
  it('still fits well past the category row ceiling', () => {
    expect(scoreScatter(summaryOf(categoryFrame(2, CATEGORY_MAX_ROWS * 10)))).toBe(VisualizationSuggestionScore.Good);
  });
});

describe('resolveMultiValueSuggestion', () => {
  const namedFrame = (names: string[]) =>
    createDataFrame({
      fields: names.map((name) => ({ name, type: FieldType.number, values: [1, 2] })),
    });

  it('resolves candlestick at Best from OHLC field names', () => {
    expect(resolveMultiValueSuggestion(summaryOf(namedFrame(['open', 'high', 'low', 'close'])))).toEqual({
      seriesType: 'candlestick',
      score: VisualizationSuggestionScore.Best,
    });
  });

  it('resolves boxplot at Best from five-number-summary field names', () => {
    expect(resolveMultiValueSuggestion(summaryOf(namedFrame(['min', 'q1', 'median', 'q3', 'max'])))).toEqual({
      seriesType: 'boxplot',
      score: VisualizationSuggestionScore.Best,
    });
  });

  // The guarantee that keeps four arbitrary metric columns out of a candlestick.
  it('does not resolve for arbitrary numeric columns', () => {
    expect(resolveMultiValueSuggestion(summaryOf(namedFrame(['a', 'b', 'c', 'd'])))).toBeUndefined();
  });

  it('does not resolve for a partial OHLC set', () => {
    expect(resolveMultiValueSuggestion(summaryOf(namedFrame(['open', 'high', 'low'])))).toBeUndefined();
  });

  it('does not throw when the summary carries no frames', () => {
    expect(resolveMultiValueSuggestion(getPanelDataSummary())).toBeUndefined();
  });
});

describe('resolvePartToWholeSlices', () => {
  it('reads one slice per row when there is a single numeric field', () => {
    expect(resolvePartToWholeSlices(summaryOf(categoryFrame(1, 10)))).toEqual({ mode: 'allValues', count: 10 });
  });

  it('reduces per field when there are several numeric fields', () => {
    expect(resolvePartToWholeSlices(summaryOf(categoryFrame(4, 10)))).toEqual({ mode: 'calculate', count: 4 });
  });

  // Calculate mode reduces each numeric field across every frame, so the row count
  // never reaches the chart and a time dimension is not disqualifying.
  it('reduces one slice per series for a multi-frame time series', () => {
    expect(resolvePartToWholeSlices(summaryOf(...multiSeriesTimeFrames(5, 200)))).toEqual({
      mode: 'calculate',
      count: 5,
    });
  });

  // A row per slice only makes sense when rows are categories, not timestamps.
  it('never reads rows as slices when the data carries a time dimension', () => {
    expect(resolvePartToWholeSlices(summaryOf(timeFrame(1, 10)))).toEqual({ mode: 'calculate', count: 1 });
  });

  it(`reads rows up to ${ALL_VALUES_MAX_ROWS} and reduces above it`, () => {
    expect(resolvePartToWholeSlices(summaryOf(categoryFrame(1, ALL_VALUES_MAX_ROWS)))).toEqual({
      mode: 'allValues',
      count: ALL_VALUES_MAX_ROWS,
    });
    // Past the ceiling a lone numeric field falls back to reducing, which yields a
    // single slice — so `scorePartToWhole` withholds it (asserted below).
    expect(resolvePartToWholeSlices(summaryOf(categoryFrame(1, ALL_VALUES_MAX_ROWS + 1)))).toEqual({
      mode: 'calculate',
      count: 1,
    });
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

  // Withheld because reducing one numeric field is one 100% slice — not because the
  // data has a time dimension. See the multi-series case below.
  it('does not fit a single-series time series', () => {
    expect(scorePartToWhole(summaryOf(timeFrame(1, 3)))).toBeUndefined();
  });

  // The regression the `pie-parity.json` dashboard caught: reduced multi-series time
  // series is the commonest pie in Grafana (core suggests Pie chart / Donut chart for
  // exactly this), and a blanket snapshot-shape gate withheld the whole family.
  it('fits a multi-frame time series, which Calculate mode reduces to one slice per series', () => {
    expect(scorePartToWhole(summaryOf(...multiSeriesTimeFrames(5, 200)))).toBe(VisualizationSuggestionScore.Good);
  });

  it('fits a wide time frame with several value columns', () => {
    expect(scorePartToWhole(summaryOf(timeFrame(4, 200, DataFrameType.TimeSeriesWide)))).toBe(
      VisualizationSuggestionScore.Good
    );
  });

  // Core is observably silent here too, so the slice ceiling is the parity boundary.
  it(`does not fit a ${SLICE_MAX * 10}-series response`, () => {
    expect(scorePartToWhole(summaryOf(...multiSeriesTimeFrames(SLICE_MAX * 10, 20)))).toBeUndefined();
  });

  // Defect 3: `isInstant` is only ever assigned while walking a time field, so a
  // frame with no time column left it `undefined` and the old
  // `isNumericFrame || isInstant` gate dropped the canonical pie source outright.
  it('fits a string + number table with no time field and no dataplane type', () => {
    expect(scorePartToWhole(summaryOf(categoryFrame(1, 4)))).toBe(VisualizationSuggestionScore.Best);
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

  it('scores Good for a label column with several value columns', () => {
    expect(scorePartToWhole(summaryOf(categoryFrame(4, 4)))).toBe(VisualizationSuggestionScore.Good);
  });

  it('does not fit a single slice, which is always 100%', () => {
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
    ).toBeUndefined();
  });

  it(`fits at ${SLICE_MAX} slices and withholds at ${SLICE_MAX + 1}`, () => {
    expect(scorePartToWhole(summaryOf(categoryFrame(SLICE_MAX, 2)))).toBe(VisualizationSuggestionScore.Good);
    expect(scorePartToWhole(summaryOf(categoryFrame(SLICE_MAX + 1, 2)))).toBeUndefined();
  });

  it('does not fit a lone numeric field past the all-values row ceiling', () => {
    expect(scorePartToWhole(summaryOf(categoryFrame(1, ALL_VALUES_MAX_ROWS + 1)))).toBeUndefined();
  });

  it('does not fit an empty response', () => {
    expect(scorePartToWhole(summaryOf())).toBeUndefined();
  });
});

describe('scoreHierarchy', () => {
  it('scores Best for a flame-graph nested-set frame', () => {
    expect(
      scoreHierarchy(
        summaryOf(
          createDataFrame({
            fields: [
              { name: 'level', type: FieldType.number, values: [0, 1] },
              { name: 'value', type: FieldType.number, values: [100, 40] },
              { name: 'self', type: FieldType.number, values: [60, 40] },
              { name: 'label', type: FieldType.string, values: ['root', 'child'] },
            ],
          })
        )
      )
    ).toBe(VisualizationSuggestionScore.Best);
  });

  it('scores Best for the flamegraph preferred visualisation hint', () => {
    expect(
      scoreHierarchy(
        summaryOf(
          createDataFrame({
            meta: { preferredVisualisationType: 'flamegraph' },
            fields: [
              { name: 'time', type: FieldType.time, values: [0, 100, 200] },
              { name: 'depth', type: FieldType.number, values: [1, 2, 3] },
            ],
          })
        )
      )
    ).toBe(VisualizationSuggestionScore.Best);
  });

  it('falls back to the flat categorical gate', () => {
    expect(scoreHierarchy(summaryOf(categoryFrame(1, 4)))).toBe(VisualizationSuggestionScore.Best);
    expect(scoreHierarchy(summaryOf(categoryFrame(4, 4)))).toBe(VisualizationSuggestionScore.Good);
  });

  it('does not fit a multi-point time series', () => {
    expect(scoreHierarchy(summaryOf(timeFrame(1, 3)))).toBeUndefined();
  });

  // The asymmetry with part-to-whole, which *does* fit this shape: hierarchy has no
  // `reduceOptions`, so `frameToCategorical` would emit one node per timestamp
  // labelled "0", "1", … instead of one node per series.
  it('does not fit a multi-frame time series, unlike part-to-whole', () => {
    const summary = summaryOf(...multiSeriesTimeFrames(5, 200));

    expect(scorePartToWhole(summary)).toBe(VisualizationSuggestionScore.Good);
    expect(scoreHierarchy(summary)).toBeUndefined();
  });
});

describe('scoreMultivariate', () => {
  it('scores Good for several metrics over a bounded set of rows', () => {
    expect(scoreMultivariate(summaryOf(categoryFrame(3, 5)))).toBe(VisualizationSuggestionScore.Good);
  });

  it('does not fit with fewer than two numeric fields', () => {
    expect(scoreMultivariate(summaryOf(categoryFrame(1, 5)))).toBeUndefined();
  });

  it('does not fit fewer than three rows, which is a line and not a polygon', () => {
    expect(scoreMultivariate(summaryOf(categoryFrame(3, 2)))).toBeUndefined();
  });

  it(`fits at ${MULTIVARIATE_MAX_AXES} axes and withholds at ${MULTIVARIATE_MAX_AXES + 1}`, () => {
    expect(scoreMultivariate(summaryOf(categoryFrame(2, MULTIVARIATE_MAX_AXES)))).toBe(
      VisualizationSuggestionScore.Good
    );
    expect(scoreMultivariate(summaryOf(categoryFrame(2, MULTIVARIATE_MAX_AXES + 1)))).toBeUndefined();
  });

  // Defect 2: the old gate was `fieldCountByType(number) >= 2` and nothing else,
  // so this scored OK and handed `radarToEChartsOption` 500 axes.
  it('does not fit a dense time series', () => {
    expect(scoreMultivariate(summaryOf(timeFrame(3, 500, DataFrameType.TimeSeriesWide)))).toBeUndefined();
  });

  it('counts axes per frame rather than across frames', () => {
    // `frameToCategorical` reads a single frame, so two 30-row frames are 30 axes,
    // not 60 — `rowCountTotal` would withhold this.
    expect(scoreMultivariate(summaryOf(categoryFrame(2, 30), categoryFrame(2, 30)))).toBe(
      VisualizationSuggestionScore.Good
    );
  });
});

describe('scoreRelations', () => {
  it('scores Good for a node-graph frame pair', () => {
    expect(scoreRelations(summaryOf(nodesFrame(3), edgesFrame(2)))).toBe(VisualizationSuggestionScore.Good);
  });

  it('scores Good for an edges-only frame', () => {
    expect(scoreRelations(summaryOf(edgesFrame(2)))).toBe(VisualizationSuggestionScore.Good);
  });

  it('scores Best for the nodeGraph preferred visualisation hint', () => {
    const frame = edgesFrame(2);
    expect(scoreRelations(summaryOf({ ...frame, meta: { preferredVisualisationType: 'nodeGraph' } }))).toBe(
      VisualizationSuggestionScore.Best
    );
  });

  it('does not fit an ordinary two-string-column table', () => {
    expect(
      scoreRelations(
        summaryOf(
          createDataFrame({
            fields: [
              { name: 'host', type: FieldType.string, values: ['a', 'b'] },
              { name: 'region', type: FieldType.string, values: ['eu', 'us'] },
            ],
          })
        )
      )
    ).toBeUndefined();
  });

  it('does not fit a lone nodes frame, which is a table and not a graph', () => {
    expect(scoreRelations(summaryOf(nodesFrame(3)))).toBeUndefined();
  });

  it(`fits at ${RELATIONS_MAX_EDGES} edges and withholds at ${RELATIONS_MAX_EDGES + 1}`, () => {
    expect(scoreRelations(summaryOf(edgesFrame(RELATIONS_MAX_EDGES)))).toBe(VisualizationSuggestionScore.Good);
    expect(scoreRelations(summaryOf(edgesFrame(RELATIONS_MAX_EDGES + 1)))).toBeUndefined();
  });

  it('does not fit an empty response', () => {
    expect(scoreRelations(summaryOf())).toBeUndefined();
  });
});

describe('exceedsChordNodeBudget', () => {
  it('counts the nodes frame when there is one', () => {
    expect(exceedsChordNodeBudget(summaryOf(nodesFrame(RELATIONS_CHORD_MAX_NODES), edgesFrame(2)))).toBe(false);
    expect(exceedsChordNodeBudget(summaryOf(nodesFrame(RELATIONS_CHORD_MAX_NODES + 1), edgesFrame(2)))).toBe(true);
  });

  it('falls back to the edges frame when Grafana sent no nodes frame', () => {
    expect(exceedsChordNodeBudget(summaryOf(edgesFrame(RELATIONS_CHORD_MAX_NODES)))).toBe(false);
    expect(exceedsChordNodeBudget(summaryOf(edgesFrame(RELATIONS_CHORD_MAX_NODES + 1)))).toBe(true);
  });

  it('is false when there are no frames to count', () => {
    expect(exceedsChordNodeBudget(summaryOf())).toBe(false);
  });
});

describe('scoreStream', () => {
  it('scores OK for a multi-layer time series', () => {
    expect(scoreStream(summaryOf(timeFrame(3, 3, DataFrameType.TimeSeriesWide)))).toBe(VisualizationSuggestionScore.OK);
  });

  it('scores OK for a one-frame-per-series response', () => {
    expect(scoreStream(summaryOf(timeFrame(1, 3), timeFrame(1, 3)))).toBe(VisualizationSuggestionScore.OK);
  });

  it('scores OK for a long frame, whose label column pivots into layers', () => {
    expect(
      scoreStream(
        summaryOf(
          createDataFrame({
            fields: [
              { name: 'time', type: FieldType.time, values: [1000, 1000, 2000, 2000] },
              { name: 'level', type: FieldType.string, values: ['error', 'warn', 'error', 'warn'] },
              { name: 'count', type: FieldType.number, values: [1, 2, 3, 4] },
            ],
          })
        )
      )
    ).toBe(VisualizationSuggestionScore.OK);
  });

  it('withholds for a single-layer time series (a filled area chart, not a river)', () => {
    expect(scoreStream(summaryOf(timeFrame(1, 3)))).toBeUndefined();
  });

  it('withholds for instant (single-timestamp) data', () => {
    expect(
      scoreStream(
        summaryOf(
          createDataFrame({
            fields: [
              { name: 'time', type: FieldType.time, values: [1000, 1000] },
              { name: 'a', type: FieldType.number, values: [1, 2] },
              { name: 'b', type: FieldType.number, values: [3, 4] },
            ],
          })
        )
      )
    ).toBeUndefined();
  });

  it('withholds without a time field', () => {
    expect(scoreStream(summaryOf(categoryFrame(2, 3)))).toBeUndefined();
  });

  it(`fits at ${STREAM_MAX_LAYERS} layers and withholds at ${STREAM_MAX_LAYERS + 1}`, () => {
    expect(scoreStream(summaryOf(timeFrame(STREAM_MAX_LAYERS, 3)))).toBe(VisualizationSuggestionScore.OK);
    expect(scoreStream(summaryOf(timeFrame(STREAM_MAX_LAYERS + 1, 3)))).toBeUndefined();
  });

  it('applies the layer ceiling to a one-frame-per-series response too', () => {
    const frames = Array.from({ length: STREAM_MAX_LAYERS + 1 }, () => timeFrame(1, 3));
    expect(scoreStream(summaryOf(...frames))).toBeUndefined();
  });

  it('withholds for an empty response', () => {
    expect(scoreStream(summaryOf())).toBeUndefined();
  });
});
