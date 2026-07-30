import {
  createDataFrame,
  DataFrameType,
  FieldType,
  getPanelDataSummary,
  VisualizationSuggestionScore,
} from '@grafana/data';
import {
  HEATMAP_MATRIX_MAX_COLUMNS,
  HEATMAP_MATRIX_MAX_ROWS,
  PREVIEW_MAX_SERIES,
} from 'lib/echarts/charts/suggestionLimits';
import { type PanelOptions } from 'types';
import { heatmapSuggestionsSupplier } from './suggestions';

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

/** An untagged pivoted histogram of range-named bucket columns, under one refId. */
const bucketsFrame = (refId: string) => ({
  ...createDataFrame({
    fields: [
      { name: 'Time', type: FieldType.time, values: [0, 100] },
      { name: '0-10', type: FieldType.number, values: [2, 3] },
      { name: '10-20', type: FieldType.number, values: [5, 6] },
    ],
  }),
  refId,
});

/** A plain series frame, the shape a cartesian overlay query returns. */
const overlayFrame = (refId: string) => ({
  ...createDataFrame({
    fields: [
      { name: 'Time', type: FieldType.time, values: [0, 100] },
      { name: 'Trend', type: FieldType.number, values: [1.5, 2.2] },
      { name: 'Baseline', type: FieldType.number, values: [2.0, 2.1] },
    ],
  }),
  refId,
});

describe('heatmapSuggestionsSupplier', () => {
  it('returns void for a plain time series', () => {
    const result = heatmapSuggestionsSupplier(
      getPanelDataSummary([
        createDataFrame({
          meta: { type: DataFrameType.TimeSeriesWide },
          fields: [
            { name: 'time', type: FieldType.time, values: [0, 100] },
            { name: 'value', type: FieldType.number, values: [1, 2] },
          ],
        }),
      ])
    );
    expect(result).toBeUndefined();
  });

  it('scores Best for HeatmapRows frames', () => {
    const result = heatmapSuggestionsSupplier(
      getPanelDataSummary([
        createDataFrame({
          meta: { type: DataFrameType.HeatmapRows },
          fields: [
            { name: 'xMax', type: FieldType.time, values: [0, 100] },
            { name: '1', type: FieldType.number, values: [1, 2] },
          ],
        }),
      ])
    );
    expect(result).toHaveLength(1);
    expect(result![0].name).toBe('Heatmap (binned)');
    expect(result![0].score).toBe(VisualizationSuggestionScore.Best);
    expect(result![0].options?.seriesType).toBe('heatmap');
    expect(result![0].options?.heatmapLayout).toBe('binned');
  });

  it('scores Best for HeatmapCells frames', () => {
    const result = heatmapSuggestionsSupplier(
      getPanelDataSummary([
        createDataFrame({
          meta: { type: DataFrameType.HeatmapCells },
          fields: [
            { name: 'xMin', type: FieldType.number, values: [0, 1] },
            { name: 'yMin', type: FieldType.number, values: [0, 1] },
            { name: 'count', type: FieldType.number, values: [1, 2] },
          ],
        }),
      ])
    );
    expect(result![0].score).toBe(VisualizationSuggestionScore.Best);
  });

  // Core Grafana's own heuristic: an untagged histogram-over-time is still a heatmap.
  it('scores Best for a wide frame of bucket-named numeric columns', () => {
    const result = heatmapSuggestionsSupplier(
      getPanelDataSummary([
        createDataFrame({
          fields: [
            { name: 'time', type: FieldType.time, values: [0, 100] },
            { name: '0.1', type: FieldType.number, values: [1, 2] },
            { name: '0.5', type: FieldType.number, values: [3, 4] },
            { name: '1', type: FieldType.number, values: [5, 6] },
          ],
        }),
      ])
    );

    expect(result).toHaveLength(1);
    expect(result![0].name).toBe('Heatmap (binned)');
    expect(result![0].score).toBe(VisualizationSuggestionScore.Best);
  });

  // `provisioning/dashboards/heatmap-overlay.json`: a pivoted histogram whose columns
  // are bound *ranges*. `Number('0-10')` is NaN, so a numeric-parse-only bucket check
  // withheld the card from every panel on that dashboard.
  it('scores Best for range-named bucket columns', () => {
    const result = heatmapSuggestionsSupplier(
      getPanelDataSummary([
        createDataFrame({
          fields: [
            { name: 'Time', type: FieldType.time, values: [0, 100] },
            { name: '0-10', type: FieldType.number, values: [2, 3] },
            { name: '10-20', type: FieldType.number, values: [5, 6] },
            { name: '20-30', type: FieldType.number, values: [8, 4] },
            { name: '30-40', type: FieldType.number, values: [3, 7] },
          ],
        }),
      ])
    );

    expect(result).toHaveLength(1);
    expect(result![0].name).toBe('Heatmap (binned)');
    expect(result![0].score).toBe(VisualizationSuggestionScore.Best);
    expect(result![0].options?.heatmapLayout).toBe('binned');
  });

  // The overlay is the whole point of this family — core's heatmap cannot draw one —
  // so an overlay frame must never veto the card.
  it('scores Best for buckets accompanied by an overlay frame', () => {
    const result = heatmapSuggestionsSupplier(getPanelDataSummary([bucketsFrame('A'), overlayFrame('B')]));

    expect(result).toHaveLength(1);
    expect(result![0].name).toBe('Heatmap (binned)');
    expect(result![0].score).toBe(VisualizationSuggestionScore.Best);
  });

  // Without this the preview folds the overlay's Trend/Baseline into the cell layer as
  // extra bucket rows, because `frameToBinnedHeatmap` merges every frame it is handed
  // and `splitFrames` only holds one back on a cartesian `seriesType` override.
  it('marks the overlay frame as a line series so it is not drawn as cells', () => {
    const result = heatmapSuggestionsSupplier(getPanelDataSummary([bucketsFrame('A'), overlayFrame('B')]));

    // Exactly what `provisioning/dashboards/heatmap-overlay.json` sets by hand.
    expect(result![0].fieldConfig).toEqual({
      defaults: {},
      overrides: [
        {
          matcher: { id: 'byFrameRefID', options: 'B' },
          properties: [{ id: 'custom.seriesType', value: 'line' }],
        },
      ],
    });
  });

  // On `fieldConfig`, not in `previewModifier`, so the panel the user creates from the
  // card is configured the same way the card previewed.
  it('carries the overlay config on the suggestion itself, not only the preview', () => {
    const result = heatmapSuggestionsSupplier(getPanelDataSummary([bucketsFrame('A'), overlayFrame('B')]));
    const preview: { options?: Partial<PanelOptions> } = { options: { ...result![0].options } };

    result![0].cardOptions!.previewModifier!(preview);

    expect(result![0].fieldConfig?.overrides).toHaveLength(1);
  });

  it('sets no overrides when there is no companion frame to overlay', () => {
    const result = heatmapSuggestionsSupplier(getPanelDataSummary([bucketsFrame('A')]));

    expect(result![0].fieldConfig).toBeUndefined();
  });

  it('scores Best for a Prometheus histogram carrying le labels', () => {
    const bucket = (le: string) =>
      createDataFrame({
        meta: { type: DataFrameType.TimeSeriesMulti },
        fields: [
          { name: 'time', type: FieldType.time, values: [0, 100] },
          { name: 'value', type: FieldType.number, values: [1, 2], labels: { le } },
        ],
      });

    const result = heatmapSuggestionsSupplier(getPanelDataSummary([bucket('0.1'), bucket('0.5')]));
    expect(result![0].score).toBe(VisualizationSuggestionScore.Best);
  });

  describe('matrix layout', () => {
    it('scores Good for a categorical numeric grid', () => {
      const result = heatmapSuggestionsSupplier(getPanelDataSummary([categoryFrame(3, 4)]));

      expect(result).toHaveLength(1);
      expect(result![0].name).toBe('Heatmap (matrix)');
      expect(result![0].score).toBe(VisualizationSuggestionScore.Good);
      expect(result![0].options?.seriesType).toBe('heatmap');
      expect(result![0].options?.heatmapLayout).toBe('matrix');
    });

    it('returns void for a single numeric column, which is a bar chart', () => {
      expect(heatmapSuggestionsSupplier(getPanelDataSummary([categoryFrame(1, 4)]))).toBeUndefined();
    });

    it(`returns void past ${HEATMAP_MATRIX_MAX_COLUMNS} columns`, () => {
      expect(
        heatmapSuggestionsSupplier(getPanelDataSummary([categoryFrame(HEATMAP_MATRIX_MAX_COLUMNS, 4)]))
      ).toHaveLength(1);
      expect(
        heatmapSuggestionsSupplier(getPanelDataSummary([categoryFrame(HEATMAP_MATRIX_MAX_COLUMNS + 1, 4)]))
      ).toBeUndefined();
    });

    it(`returns void past ${HEATMAP_MATRIX_MAX_ROWS} rows`, () => {
      expect(heatmapSuggestionsSupplier(getPanelDataSummary([categoryFrame(3, HEATMAP_MATRIX_MAX_ROWS)]))).toHaveLength(
        1
      );
      expect(
        heatmapSuggestionsSupplier(getPanelDataSummary([categoryFrame(3, HEATMAP_MATRIX_MAX_ROWS + 1)]))
      ).toBeUndefined();
    });
  });

  it('bounds every preview card', () => {
    const result = heatmapSuggestionsSupplier(getPanelDataSummary([categoryFrame(3, 4)]));

    expect(result!.every((suggestion) => suggestion.cardOptions?.maxSeries === PREVIEW_MAX_SERIES)).toBe(true);
  });

  it('returns void for an empty response', () => {
    expect(heatmapSuggestionsSupplier(getPanelDataSummary([]))).toBeUndefined();
  });
});
