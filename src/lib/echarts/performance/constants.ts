/**
 * Density thresholds for the cartesian time-series fast path.
 *
 * Kept in their own module (separate from the resolvers in `./resolvers.ts`) so
 * they can be read — and mocked — without pulling in the resolvers or their
 * dependency graph. The canvas regression test relies on that: it mocks this
 * module to shrink `SYMBOL_VISIBLE_MAX_POINTS` so it can cross the threshold
 * with a handful of points instead of committing a 100-point snapshot.
 *
 * A Chrome profile of 500 time series showed the initial render as one ~4.5s
 * main-thread task, dominated by per-point symbols, transition diffing and
 * scene-graph work that scales with element count. These numbers are where the
 * resolvers switch a chart onto ECharts' big-data levers; they are set so that
 * charts below them render identically to before. See `docs/performance.md`.
 */

/**
 * Per-series point count at/below which point markers stay visible and LTTB
 * sampling stays off (auto mode). Above it, a line series hides its symbols and
 * (when downsampling is enabled) samples to reduce drawn points. Symbols at
 * every point are the single biggest render cost in the profiled regression.
 */
export const SYMBOL_VISIBLE_MAX_POINTS = 100;

/** Series count above which animation auto-disables (transition diffing scales with series). */
export const ANIMATION_MAX_SERIES = 50;

/** Per-series point count above which animation auto-disables. */
export const ANIMATION_MAX_POINTS = 5000;

/**
 * Per-series point count at/above which scatter/bar series switch on ECharts'
 * `large` mode (a batched, symbol-simplified renderer). Also emitted as the
 * series' `largeThreshold` so ECharts only engages the optimization per-series
 * above this count. https://echarts.apache.org/en/option.html#series-scatter.large
 */
export const LARGE_MODE_THRESHOLD = 2000;
