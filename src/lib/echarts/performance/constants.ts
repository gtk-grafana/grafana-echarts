/**
 * Density thresholds for the cartesian time-series fast path.
 *
 * Kept in their own module (separate from the resolvers in `./resolvers.ts`) so
 * they can be read — and mocked — without pulling in the resolvers or their
 * dependency graph. The canvas regression test relies on that: it mocks this
 * module to shrink the symbol threshold so it can cross it with a handful of
 * points instead of committing a 100-point snapshot.
 *
 * A Chrome profile of 500 time series showed the initial render as one ~4.5s
 * main-thread task, dominated by per-point symbols, transition diffing and
 * scene-graph work that scales with element count. These numbers are where the
 * resolvers switch a chart onto ECharts' big-data levers.
 *
 * **Note which axis each threshold measures.** Symbol cost scales with the
 * *total* number of drawn markers, so its threshold is a total; sampling and
 * `large` reduce work *within* a series, so theirs are per-series. Conflating the
 * two is a real bug: 1000 series x 100 points is only 100 points per series but
 * 100,000 symbols, and measured 720ms with markers on versus 54ms with them off.
 * See `docs/performance.md`.
 */

/**
 * Total point count — summed across every series — at/below which point markers
 * stay visible (auto mode). Above it, line series hide their symbols, because
 * total symbol count is what the render cost tracks: at 100 points the markers
 * cost ~2ms, at 10,000 ~67ms, at 100,000 ~666ms.
 */
export const SYMBOL_VISIBLE_MAX_TOTAL_POINTS = 100;

/**
 * **Per-series** point count above which a line series enables LTTB `sampling`
 * (when downsampling is on). Deliberately per-series rather than total: sampling
 * thins points *within* a series toward pixel resolution, so it does nothing for
 * a chart made of many short series and would only add overhead there.
 */
export const SAMPLING_MIN_POINTS_PER_SERIES = 100;

/**
 * **Per-series** point count at/above which scatter/bar series switch on ECharts'
 * `large` mode (a batched, symbol-simplified renderer). Also emitted as the
 * series' `largeThreshold`, which ECharts itself applies per-series, so a total
 * would not match its semantics.
 * https://echarts.apache.org/en/option.html#series-scatter.large
 */
export const LARGE_MODE_THRESHOLD = 2000;
