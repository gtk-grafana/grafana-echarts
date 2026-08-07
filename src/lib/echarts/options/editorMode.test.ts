import { partToWholeSeriesTypes } from 'editor/pie';
import { type SeriesType } from 'editor/types';
import { ADVANCED_CARTESIAN_DEFAULTS } from 'lib/echarts/options/cartesian';
import { ADVANCED_CHORD_DEFAULTS } from 'lib/echarts/options/chord';
import { applyAdvancedDefaults, applyEditorModeDefaults } from 'lib/echarts/options/editorMode';
import { ADVANCED_RELATIONS_DEFAULTS } from 'lib/echarts/options/graph';
import { ADVANCED_PARALLEL_DEFAULTS } from 'lib/echarts/options/parallel';
import { ADVANCED_PIE_DEFAULTS } from 'lib/echarts/options/pie';
import { ADVANCED_RADAR_DEFAULTS } from 'lib/echarts/options/radar';
import { ADVANCED_SANKEY_DEFAULTS } from 'lib/echarts/options/sankey';
import { ADVANCED_STREAM_DEFAULTS } from 'lib/echarts/options/stream';
import { relationsOptions } from 'test/relations';
import { type PanelOptions } from 'types';

/**
 * The Advanced-tier reset, tested over the **whole dispatch** rather than one family at
 * a time.
 *
 * `showIf` hides a control without clearing its value, so a user who configures an
 * Advanced option and then switches back to Default has a panel rendering from settings
 * they can no longer see or reach. `applyEditorModeDefaults` is what prevents that: it
 * spreads the family's `ADVANCED_*_DEFAULTS` over the stored options once per render,
 * in Default mode only. Every family that gates options behind Advanced depends on it —
 * see docs/options-modes.md.
 *
 * Each family's own suite tests its own keys, which is where the *contents* of a tier
 * belong. What had no test at all was the dispatch: which family a `SeriesType` reaches,
 * and in what order the predicates are asked. That is what this file is for.
 */

const options = (extra: Partial<PanelOptions> = {}): PanelOptions => relationsOptions(extra);

/** The keys a family's Default tier must clear, and a value to set each of them to. */
interface FamilyCase {
  name: string;
  types: SeriesType[];
  defaults: Partial<PanelOptions>;
}

/**
 * The relations family's three variants each own an Advanced tier, and all three are
 * applied whatever the selected variant, so switching Chart type can never leave the
 * other one's hidden values in force.
 */
const RELATIONS_DEFAULTS: Partial<PanelOptions> = {
  ...ADVANCED_RELATIONS_DEFAULTS,
  ...ADVANCED_SANKEY_DEFAULTS,
  ...ADVANCED_CHORD_DEFAULTS,
};

const FAMILIES: FamilyCase[] = [
  { name: 'part-to-whole', types: partToWholeSeriesTypes, defaults: ADVANCED_PIE_DEFAULTS },
  {
    name: 'cartesian',
    types: ['line', 'bar', 'scatter', 'effectScatter', 'candlestick', 'boxplot'],
    defaults: ADVANCED_CARTESIAN_DEFAULTS,
  },
  { name: 'parallel', types: ['parallel'], defaults: ADVANCED_PARALLEL_DEFAULTS },
  { name: 'radar', types: ['radar'], defaults: ADVANCED_RADAR_DEFAULTS },
  { name: 'relations', types: ['graph', 'sankey', 'chord'], defaults: RELATIONS_DEFAULTS },
  { name: 'stream', types: ['themeRiver'], defaults: ADVANCED_STREAM_DEFAULTS },
];

/** Families with no Advanced tier at all: the dispatch must fall through to identity. */
const NO_ADVANCED_TIER: SeriesType[] = ['heatmap', 'treemap', 'sunburst'];

/** Every Advanced key a real panel could be holding, whatever family it belongs to. */
const everyAdvancedKey = (): Array<keyof PanelOptions> =>
  FAMILIES.flatMap(({ defaults }) => Object.keys(defaults) as Array<keyof PanelOptions>);

/**
 * A stored value for each key, so "was it reset" is a question with an answer.
 *
 * A tier resets to its *declared* default, which is `undefined` for the options ECharts
 * has a default for and a concrete value for the rest (`animation: { enabled: true }`,
 * `parallelLayout: 'horizontal'`). `'stored'` is neither, so it survives only if the key
 * was never reset at all.
 */
const stored = (defaults: Partial<PanelOptions>): Partial<PanelOptions> =>
  Object.fromEntries(Object.keys(defaults).map((key) => [key, 'stored'])) as Partial<PanelOptions>;

/** The keys a reset left holding something other than the tier's declared default. */
const notReset = (normalized: PanelOptions, defaults: Partial<PanelOptions>): Array<keyof PanelOptions> =>
  (Object.keys(defaults) as Array<keyof PanelOptions>).filter(
    (key) => JSON.stringify(normalized[key]) !== JSON.stringify(defaults[key])
  );

describe('applyAdvancedDefaults', () => {
  it('spreads the defaults over the options in Default mode', () => {
    expect(applyAdvancedDefaults(options({ relationsCurveness: 0.4 }), { relationsCurveness: undefined })).toEqual(
      expect.objectContaining({ relationsCurveness: undefined })
    );
    // A tier whose default is a value, not `undefined`, writes that value.
    expect(
      applyAdvancedDefaults(options({ animation: { enabled: false } }), { animation: { enabled: true } }).animation
    ).toEqual({ enabled: true });
  });

  // Returned by reference, so a caller can detect "nothing was reset" without a deep
  // compare — and so an Advanced-mode render allocates nothing per frame.
  it('returns the very same object in Advanced and API mode', () => {
    for (const editorMode of ['advanced', 'api'] as const) {
      const stored = options({ editorMode, relationsCurveness: 0.4 });

      expect(applyAdvancedDefaults(stored, { relationsCurveness: undefined })).toBe(stored);
    }
  });
});

describe('applyEditorModeDefaults', () => {
  describe.each(FAMILIES)('$name', ({ types, defaults }) => {
    const keys = Object.keys(defaults) as Array<keyof PanelOptions>;

    it('has an Advanced tier to reset', () => {
      expect(keys.length).toBeGreaterThan(0);
    });

    it.each(types)('resets every Advanced key for %s in Default mode', (seriesType) => {
      const normalized = applyEditorModeDefaults(seriesType, options(stored(defaults)));

      expect(notReset(normalized, defaults)).toEqual([]);
    });

    it.each(types)('keeps every Advanced key for %s in Advanced mode', (seriesType) => {
      const normalized = applyEditorModeDefaults(seriesType, options({ ...stored(defaults), editorMode: 'advanced' }));

      expect(keys.filter((key) => normalized[key] !== 'stored')).toEqual([]);
    });

    /**
     * A family must not reach another family's tier. Without this the dispatch could
     * silently widen — a new `isXSeriesType` that also matches an old type would clear
     * options the user can still see the control for, which reads as the editor
     * forgetting what they typed.
     */
    it.each(types)('resets nothing outside its own tier for %s', (seriesType) => {
      const foreign = [...new Set(everyAdvancedKey())].filter((key) => !keys.includes(key));
      const configured = options(Object.fromEntries(foreign.map((key) => [key, 'stored'])));
      const normalized = applyEditorModeDefaults(seriesType, configured);

      expect(foreign.filter((key) => normalized[key] !== 'stored')).toEqual([]);
    });
  });

  /**
   * **Parallel is checked before radar, and the order is load-bearing.**
   * `isMultivariateSeriesType` matches `parallel` as well as `radar` — they share the
   * family panel — so a `parallel` panel falling through to the radar branch would be
   * reset by the wrong tier: its own Advanced options would survive into Default mode,
   * and radar's would be cleared on a chart that has none. The dispatch's own comment
   * warns about this; this is the test that makes the warning enforceable.
   */
  it('resets parallel by its own tier rather than by the radar branch it also matches', () => {
    const parallelKeys = Object.keys(ADVANCED_PARALLEL_DEFAULTS) as Array<keyof PanelOptions>;
    const radarOnly = (Object.keys(ADVANCED_RADAR_DEFAULTS) as Array<keyof PanelOptions>).filter(
      (key) => !parallelKeys.includes(key)
    );
    // The two tiers have to actually differ, or the ordering could not be observed and
    // this test would pass for the wrong reason.
    expect(radarOnly.length).toBeGreaterThan(0);

    const normalized = applyEditorModeDefaults(
      'parallel',
      options({ ...stored(ADVANCED_RADAR_DEFAULTS), ...stored(ADVANCED_PARALLEL_DEFAULTS) })
    );

    expect(notReset(normalized, ADVANCED_PARALLEL_DEFAULTS)).toEqual([]);
    expect(radarOnly.filter((key) => normalized[key] !== 'stored')).toEqual([]);
  });

  /**
   * The relations reset is keyed on the **family**, not the variant, so switching Chart
   * type cannot leave the other variant's hidden Advanced values in force — a graph
   * still holding a sankey's `nodeWidth` would apply it the moment the user switched
   * back.
   */
  it('resets all three relations tiers whichever variant is selected', () => {
    for (const seriesType of ['graph', 'sankey', 'chord'] as const) {
      const normalized = applyEditorModeDefaults(seriesType, options(stored(RELATIONS_DEFAULTS)));

      expect(notReset(normalized, RELATIONS_DEFAULTS)).toEqual([]);
    }
  });

  // Heatmap and hierarchy gate nothing behind Advanced, so the dispatch falls through.
  // Returned by reference, which is the identity the fall-through promises.
  it.each(NO_ADVANCED_TIER)('passes %s through untouched, tier or no tier', (seriesType) => {
    const configured = options(Object.fromEntries(everyAdvancedKey().map((key) => [key, 'stored'])));

    expect(applyEditorModeDefaults(seriesType, configured)).toBe(configured);
  });

  // The funnel's own layout options are Default-visible rather than Advanced-gated, so
  // sharing the pie tier must not clear them.
  it('leaves the funnel layout options alone while sharing the pie tier', () => {
    const normalized = applyEditorModeDefaults('funnel', options({ funnelOrient: 'horizontal', funnelGap: 4 }));

    expect(normalized.funnelOrient).toBe('horizontal');
    expect(normalized.funnelGap).toBe(4);
  });
});
