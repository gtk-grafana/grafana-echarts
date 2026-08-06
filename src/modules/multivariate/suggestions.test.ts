import {
  createDataFrame,
  DataFrameType,
  FieldType,
  getPanelDataSummary,
  VisualizationSuggestionScore,
} from '@grafana/data';
import {
  MULTIVARIATE_MAX_AXES,
  MULTIVARIATE_MAX_SERIES,
  MULTIVARIATE_PREVIEW_MAX_ROWS,
  PREVIEW_MAX_SERIES,
} from 'lib/echarts/charts/suggestionLimits';
import { multivariateSuggestionsSupplier } from './suggestions';

/** An entity table: one string label column plus `metrics` numeric columns. */
const entityFrame = (metrics: number, rows: number) =>
  createDataFrame({
    fields: [
      { name: 'entity', type: FieldType.string, values: Array.from({ length: rows }, (_, row) => `e${row}`) },
      ...Array.from({ length: metrics }, (_, metric) => ({
        name: `metric-${metric}`,
        type: FieldType.number,
        values: Array.from({ length: rows }, (_, row) => row + metric),
      })),
    ],
  });

describe('multivariateSuggestionsSupplier', () => {
  it('returns void with fewer than two numeric fields', () => {
    expect(multivariateSuggestionsSupplier(getPanelDataSummary([entityFrame(1, 5)]))).toBeUndefined();
  });

  it('returns void with fewer than three rows, which is a line and not a polygon', () => {
    expect(multivariateSuggestionsSupplier(getPanelDataSummary([entityFrame(3, 2)]))).toBeUndefined();
  });

  it('suggests radar and parallel variants scored Good', () => {
    const result = multivariateSuggestionsSupplier(getPanelDataSummary([entityFrame(3, 5)]));

    expect(result).toHaveLength(2);
    expect(result!.map((suggestion) => suggestion.name)).toEqual(['Radar', 'Parallel']);
    expect(result!.map((suggestion) => suggestion.options?.seriesType)).toEqual(['radar', 'parallel']);
    expect(result!.every((suggestion) => suggestion.score === VisualizationSuggestionScore.Good)).toBe(true);
  });

  it(`suggests both variants at ${MULTIVARIATE_MAX_AXES} axes, capping the preview at ${MULTIVARIATE_PREVIEW_MAX_ROWS} rows`, () => {
    const result = multivariateSuggestionsSupplier(getPanelDataSummary([entityFrame(2, 40)]));

    expect(result).toHaveLength(2);
    expect(result!.every((suggestion) => suggestion.cardOptions?.maxRows === MULTIVARIATE_PREVIEW_MAX_ROWS)).toBe(true);
    expect(result!.every((suggestion) => suggestion.cardOptions?.maxSeries === PREVIEW_MAX_SERIES)).toBe(true);
  });

  it(`returns void past ${MULTIVARIATE_MAX_AXES} axes`, () => {
    expect(multivariateSuggestionsSupplier(getPanelDataSummary([entityFrame(2, MULTIVARIATE_MAX_AXES)]))).toHaveLength(
      2
    );
    expect(
      multivariateSuggestionsSupplier(getPanelDataSummary([entityFrame(2, MULTIVARIATE_MAX_AXES + 1)]))
    ).toBeUndefined();
  });

  it(`returns void past ${MULTIVARIATE_MAX_SERIES} metrics`, () => {
    expect(
      multivariateSuggestionsSupplier(getPanelDataSummary([entityFrame(MULTIVARIATE_MAX_SERIES + 1, 5)]))
    ).toBeUndefined();
  });

  // The crash this family shipped with: the old gate was `two or more numeric
  // fields` and nothing else, so a dense Prometheus response scored OK and every
  // *row* became a radar axis.
  it('returns void for a dense time series', () => {
    const dense = createDataFrame({
      meta: { type: DataFrameType.TimeSeriesWide },
      fields: [
        { name: 'time', type: FieldType.time, values: Array.from({ length: 500 }, (_, row) => row * 1000) },
        ...Array.from({ length: 3 }, (_, field) => ({
          name: `value-${field}`,
          type: FieldType.number,
          values: Array.from({ length: 500 }, (_, row) => row + field),
        })),
      ],
    });

    expect(multivariateSuggestionsSupplier(getPanelDataSummary([dense]))).toBeUndefined();
  });

  it('returns void for an empty response', () => {
    expect(multivariateSuggestionsSupplier(getPanelDataSummary([]))).toBeUndefined();
  });
});
