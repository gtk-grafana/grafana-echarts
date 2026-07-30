import {
  createDataFrame,
  DataFrameType,
  FieldType,
  getPanelDataSummary,
  VisualizationSuggestionScore,
} from '@grafana/data';
import { ALL_VALUES_MAX_ROWS, PREVIEW_MAX_SERIES, SLICE_MAX } from 'lib/echarts/charts/suggestionLimits';
import { type PanelOptions } from 'types';
import { partToWholeSuggestionsSupplier } from './suggestions';

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

describe('partToWholeSuggestionsSupplier', () => {
  it('returns void when there is no numeric field', () => {
    const result = partToWholeSuggestionsSupplier(
      getPanelDataSummary([
        createDataFrame({ fields: [{ name: 'label', type: FieldType.string, values: ['a', 'b'] }] }),
      ])
    );
    expect(result).toBeUndefined();
  });

  it('returns void for multi-point (non-instant, non-numeric) time series', () => {
    const result = partToWholeSuggestionsSupplier(
      getPanelDataSummary([
        createDataFrame({
          fields: [
            { name: 'time', type: FieldType.time, values: [0, 100, 200] },
            { name: 'value', type: FieldType.number, values: [1, 2, 3] },
          ],
        }),
      ])
    );
    expect(result).toBeUndefined();
  });

  // The regression case for the defect this family shipped with: a SQL/TestData
  // category table has no time field at all, so `summary.isInstant` is left
  // `undefined` and the old `isNumericFrame || isInstant` gate dropped the
  // canonical pie source. This returned `undefined` before.
  it('suggests pie, donut and funnel for a string + number table with no time field', () => {
    const result = partToWholeSuggestionsSupplier(getPanelDataSummary([categoryFrame(1, 4)]));

    expect(result).toHaveLength(3);
    expect(result!.map((suggestion) => suggestion.name)).toEqual(['Pie', 'Donut', 'Funnel']);
    expect(result!.map((suggestion) => suggestion.options?.seriesType)).toEqual(['pie', 'pie', 'funnel']);
    expect(result!.map((suggestion) => suggestion.options?.pieType)).toEqual([undefined, 'donut', undefined]);
    // Core piechart treats one label plus one value column as its own shape.
    expect(result!.every((suggestion) => suggestion.score === VisualizationSuggestionScore.Best)).toBe(true);
  });

  it('scores Good for a label column with several value columns', () => {
    const result = partToWholeSuggestionsSupplier(getPanelDataSummary([categoryFrame(4, 4)]));

    expect(result).toHaveLength(3);
    expect(result!.every((suggestion) => suggestion.score === VisualizationSuggestionScore.Good)).toBe(true);
  });

  it('scores Good for numeric frame types', () => {
    const result = partToWholeSuggestionsSupplier(
      getPanelDataSummary([
        createDataFrame({
          meta: { type: DataFrameType.NumericWide },
          fields: [
            { name: 'a', type: FieldType.number, values: [1] },
            { name: 'b', type: FieldType.number, values: [2] },
          ],
        }),
      ])
    );
    expect(result).toHaveLength(3);
    expect(result!.every((suggestion) => suggestion.score === VisualizationSuggestionScore.Good)).toBe(true);
  });

  it('reads one slice per row for a single numeric field', () => {
    const result = partToWholeSuggestionsSupplier(getPanelDataSummary([categoryFrame(1, 10)]));

    expect(result!.map((suggestion) => suggestion.options?.reduceOptions)).toEqual([
      { values: true, calcs: [] },
      { values: true, calcs: [] },
      { values: true, calcs: [] },
    ]);
  });

  it('reduces per field when there are several numeric fields', () => {
    const result = partToWholeSuggestionsSupplier(getPanelDataSummary([categoryFrame(4, 25)]));

    expect(result!.map((suggestion) => suggestion.options?.reduceOptions)).toEqual([
      { values: false, calcs: ['sum'] },
      { values: false, calcs: ['sum'] },
      { values: false, calcs: ['sum'] },
    ]);
  });

  // A lone numeric column past the all-values ceiling would have to be reduced,
  // and reducing one field yields a single 100% slice — so no card is offered.
  it('returns void for a single numeric field past the all-values row ceiling', () => {
    const result = partToWholeSuggestionsSupplier(getPanelDataSummary([categoryFrame(1, ALL_VALUES_MAX_ROWS + 1)]));
    expect(result).toBeUndefined();
  });

  it('returns void for a single slice', () => {
    const result = partToWholeSuggestionsSupplier(
      getPanelDataSummary([
        createDataFrame({
          fields: [
            { name: 'time', type: FieldType.time, values: [100] },
            { name: 'value', type: FieldType.number, values: [42] },
          ],
        }),
      ])
    );
    expect(result).toBeUndefined();
  });

  it(`returns void past ${SLICE_MAX} slices`, () => {
    expect(partToWholeSuggestionsSupplier(getPanelDataSummary([categoryFrame(SLICE_MAX + 1, 2)]))).toBeUndefined();
  });

  it('bounds every preview card and suppresses slice labels', () => {
    const result = partToWholeSuggestionsSupplier(getPanelDataSummary([categoryFrame(1, 4)]));

    expect(result!.every((suggestion) => suggestion.cardOptions?.maxSeries === PREVIEW_MAX_SERIES)).toBe(true);

    const preview: { options?: Partial<PanelOptions> } = { options: { ...result![0].options } };
    result![0].cardOptions!.previewModifier!(preview);
    expect(preview.options?.displayLabels).toEqual([]);
    expect(preview.options?.legend?.showLegend).toBe(false);
    // The card the user would create keeps its labels — the modifier ran on a copy.
    expect(result![0].options?.displayLabels).toBeUndefined();
  });
});
