import {
  createDataFrame,
  DataFrameType,
  FieldType,
  getPanelDataSummary,
  VisualizationSuggestionScore,
} from '@grafana/data';
import { PREVIEW_MAX_SERIES } from 'lib/echarts/charts/suggestionLimits';
import { hierarchySuggestionsSupplier } from './suggestions';

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

/** A flame-graph nested-set frame, the shape `isFlameGraphFrame` recognises. */
const flameGraphFrame = () =>
  createDataFrame({
    fields: [
      { name: 'level', type: FieldType.number, values: [0, 1, 1] },
      { name: 'value', type: FieldType.number, values: [100, 60, 40] },
      { name: 'self', type: FieldType.number, values: [0, 60, 40] },
      { name: 'label', type: FieldType.string, values: ['root', 'a', 'b'] },
    ],
  });

describe('hierarchySuggestionsSupplier', () => {
  it('returns void when there is no numeric field', () => {
    const result = hierarchySuggestionsSupplier(
      getPanelDataSummary([
        createDataFrame({ fields: [{ name: 'label', type: FieldType.string, values: ['a', 'b'] }] }),
      ])
    );
    expect(result).toBeUndefined();
  });

  it('returns void for multi-point (non-instant, non-numeric) time series', () => {
    const result = hierarchySuggestionsSupplier(
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

  // Previously unreachable: the flame-graph signal was documented as invisible to
  // `PanelDataSummary`, so this family only ever covered the flat categorical path.
  it('scores Best for a flame-graph nested-set frame', () => {
    const result = hierarchySuggestionsSupplier(getPanelDataSummary([flameGraphFrame()]));

    expect(result).toHaveLength(2);
    expect(result!.map((suggestion) => suggestion.name)).toEqual(['Treemap', 'Sunburst']);
    expect(result!.every((suggestion) => suggestion.score === VisualizationSuggestionScore.Best)).toBe(true);
  });

  it('scores Best for the flamegraph preferred visualisation hint', () => {
    const result = hierarchySuggestionsSupplier(
      getPanelDataSummary([
        createDataFrame({
          meta: { preferredVisualisationType: 'flamegraph' },
          fields: [
            { name: 'time', type: FieldType.time, values: [0, 100, 200] },
            { name: 'depth', type: FieldType.number, values: [1, 2, 3] },
          ],
        }),
      ])
    );

    expect(result).toHaveLength(2);
    expect(result!.every((suggestion) => suggestion.score === VisualizationSuggestionScore.Best)).toBe(true);
  });

  it('suggests treemap and sunburst variants scored Good for numeric frame types', () => {
    const result = hierarchySuggestionsSupplier(
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
    expect(result).toHaveLength(2);
    expect(result!.map((suggestion) => suggestion.name)).toEqual(['Treemap', 'Sunburst']);
    expect(result!.every((suggestion) => suggestion.score === VisualizationSuggestionScore.Good)).toBe(true);
    expect(result!.map((suggestion) => suggestion.options?.seriesType)).toEqual(['treemap', 'sunburst']);
  });

  it('suggests both variants for a flat category table with no time field', () => {
    const result = hierarchySuggestionsSupplier(getPanelDataSummary([categoryFrame(1, 4)]));

    expect(result).toHaveLength(2);
    expect(result!.every((suggestion) => suggestion.score === VisualizationSuggestionScore.Best)).toBe(true);
  });

  // Delegating to the shared part-to-whole gate means a single node — one value that
  // is the whole tree — is withheld, where the old inlined copy scored it OK.
  it('returns void for a single instant value', () => {
    const result = hierarchySuggestionsSupplier(
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

  it('bounds every preview card', () => {
    const result = hierarchySuggestionsSupplier(getPanelDataSummary([flameGraphFrame()]));

    expect(result!.every((suggestion) => suggestion.cardOptions?.maxSeries === PREVIEW_MAX_SERIES)).toBe(true);
  });
});
