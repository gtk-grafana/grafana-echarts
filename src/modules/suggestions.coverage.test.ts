import { createDataFrame, type DataFrame, DataFrameType, FieldType, getPanelDataSummary } from '@grafana/data';
import { supportedChartSeriesTypes } from 'lib/echarts/charts/registry';
import { cartesianSuggestionsSupplier } from 'modules/cartesian/suggestions';
import { heatmapSuggestionsSupplier } from 'modules/heatmap/suggestions';
import { hierarchySuggestionsSupplier } from 'modules/hierarchy/suggestions';
import { multivariateSuggestionsSupplier } from 'modules/multivariate/suggestions';
import { partToWholeSuggestionsSupplier } from 'modules/part-to-whole/suggestions';
import { relationsSuggestionsSupplier } from 'modules/relations/suggestions';
import { streamSuggestionsSupplier } from 'modules/stream/suggestions';

/**
 * Cross-family coverage: every render variant the plugin can route to must be
 * reachable from at least one suggestion card.
 *
 * This exists because the drift it guards against is invisible per-file. Seven
 * families shipped render types — funnel, parallel, sankey, chord, boxplot,
 * candlestick, scatter, the matrix heatmap layout, the bubble stream variant — that
 * no supplier could ever emit, and every individual `suggestions.test.ts` passed
 * the whole time. Adding a render type without a card now fails here.
 */
const SUPPLIERS = [
  cartesianSuggestionsSupplier,
  heatmapSuggestionsSupplier,
  hierarchySuggestionsSupplier,
  multivariateSuggestionsSupplier,
  partToWholeSuggestionsSupplier,
  relationsSuggestionsSupplier,
  streamSuggestionsSupplier,
];

/**
 * `effectScatter` is deliberately never suggested, and is the one routable type
 * excluded here.
 *
 * It is the ripple-animation scatter, which ECharts intends for a handful of
 * highlighted points (`getSeriesPerfOptions` leaves it out of the fast path for the
 * same reason). Suggesting it would put a permanently animating canvas in the
 * suggestions pane, which is the opposite of what the preview caps are for — and it
 * is a decoration of `scatter`, which *is* offered. Still selectable by hand.
 */
const UNSUGGESTED_SERIES_TYPES = ['effectScatter'];

const timeFrame = (numericFields: number, rows = 3) =>
  createDataFrame({
    meta: { type: DataFrameType.TimeSeriesWide },
    fields: [
      { name: 'time', type: FieldType.time, values: Array.from({ length: rows }, (_, row) => row * 1000) },
      ...Array.from({ length: numericFields }, (_, field) => ({
        name: `value-${field}`,
        type: FieldType.number,
        values: Array.from({ length: rows }, (_, row) => row + field),
      })),
    ],
  });

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

const numericFrame = (...names: string[]) =>
  createDataFrame({ fields: names.map((name) => ({ name, type: FieldType.number, values: [1, 2, 3] })) });

/** One realistic response per shape the plugin claims to serve. */
const FIXTURES: Record<string, DataFrame[]> = {
  'wide time series': [timeFrame(3)],
  'ohlc frame': [numericFrame('open', 'high', 'low', 'close')],
  'five-number summary': [numericFrame('min', 'q1', 'median', 'q3', 'max')],
  'two numeric columns': [numericFrame('x', 'y')],
  'category table, one value column': [categoryFrame(1, 4)],
  'category table, several value columns': [categoryFrame(3, 5)],
  'dataplane heatmap': [
    createDataFrame({
      meta: { type: DataFrameType.HeatmapRows },
      fields: [
        { name: 'xMax', type: FieldType.time, values: [0, 100] },
        { name: '1', type: FieldType.number, values: [1, 2] },
      ],
    }),
  ],
  'flame graph': [
    createDataFrame({
      fields: [
        { name: 'level', type: FieldType.number, values: [0, 1] },
        { name: 'value', type: FieldType.number, values: [100, 40] },
        { name: 'self', type: FieldType.number, values: [60, 40] },
        { name: 'label', type: FieldType.string, values: ['root', 'child'] },
      ],
    }),
  ],
  'node graph': [
    createDataFrame({
      name: 'nodes',
      fields: [{ name: 'id', type: FieldType.string, values: ['a', 'b'] }],
    }),
    createDataFrame({
      name: 'edges',
      fields: [
        { name: 'id', type: FieldType.string, values: ['e1'] },
        { name: 'source', type: FieldType.string, values: ['a'] },
        { name: 'target', type: FieldType.string, values: ['b'] },
      ],
    }),
  ],
};

/** Every card the seven suppliers emit across every fixture. */
const allSuggestions = () =>
  Object.values(FIXTURES).flatMap((frames) => {
    const summary = getPanelDataSummary(frames);
    return SUPPLIERS.flatMap((supplier) => supplier(summary) ?? []);
  });

describe('suggestion variant coverage', () => {
  const suggestions = allSuggestions();

  it.each(supportedChartSeriesTypes.filter((type) => !UNSUGGESTED_SERIES_TYPES.includes(type)))(
    'reaches seriesType %s from a suggestion card',
    (seriesType) => {
      expect(suggestions.some((suggestion) => suggestion.options?.seriesType === seriesType)).toBe(true);
    }
  );

  // The three render variants carried by a family-local option rather than by
  // `seriesType`, which the loop above cannot see.
  it('reaches the donut pie type', () => {
    expect(suggestions.some((suggestion) => suggestion.options?.pieType === 'donut')).toBe(true);
  });

  it('reaches the matrix heatmap layout', () => {
    expect(suggestions.some((suggestion) => suggestion.options?.heatmapLayout === 'matrix')).toBe(true);
  });

  it('reaches the bubble stream variant', () => {
    expect(suggestions.some((suggestion) => suggestion.options?.streamChartType === 'bubble')).toBe(true);
  });

  it('bounds the preview of every card', () => {
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.every((suggestion) => suggestion.cardOptions?.maxSeries != null)).toBe(true);
  });

  it('names every card', () => {
    expect(suggestions.every((suggestion) => (suggestion.name?.length ?? 0) > 0)).toBe(true);
  });

  // Grafana's UI groups *contiguous* runs of the same plugin id after sorting the
  // flat list by score, so a family emitting two scores for one response can render
  // as two separate groups with another plugin's cards between them.
  it('emits one score per family per response', () => {
    // Collected rather than asserted in the loop so a failure names the fixture and
    // the scores it mixed, instead of just reporting "2 is not <= 1".
    const mixed = Object.entries(FIXTURES).flatMap(([name, frames]) => {
      const summary = getPanelDataSummary(frames);
      return SUPPLIERS.flatMap((supplier) => {
        const cards = supplier(summary) ?? [];
        const scores = [...new Set(cards.map((suggestion) => suggestion.score))];
        return scores.length > 1 ? [{ fixture: name, cards: cards.map((card) => card.name), scores }] : [];
      });
    });

    expect(mixed).toEqual([]);
  });

  it('withholds everything for an empty response', () => {
    const summary = getPanelDataSummary([]);
    expect(SUPPLIERS.flatMap((supplier) => supplier(summary) ?? [])).toEqual([]);
  });

  // The suppliers run inside a try/catch in `getAllSuggestions`, so a throw becomes a
  // "Some suggestions could not be loaded" banner instead of surfacing — which is
  // exactly why every `rawFrames` read is optional-chained.
  it('does not throw for a summary built with no frames at all', () => {
    const summary = getPanelDataSummary();
    expect(() => SUPPLIERS.flatMap((supplier) => supplier(summary) ?? [])).not.toThrow();
  });

  it('does not throw for frames with fields but no rows', () => {
    const empty = [createDataFrame({ fields: [{ name: 'value', type: FieldType.number, values: [] }] })];
    const summary = getPanelDataSummary(empty);
    expect(() => SUPPLIERS.flatMap((supplier) => supplier(summary) ?? [])).not.toThrow();
  });
});
