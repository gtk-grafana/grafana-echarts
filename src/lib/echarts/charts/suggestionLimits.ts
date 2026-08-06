/**
 * Numeric bounds for Visualization Suggestions: the data-shape gates each family
 * scores against, and the preview caps that keep a suggestion card cheap.
 *
 * Constants only — no imports from the resolvers or from `./fitness.ts`, for the
 * same reason `performance/constants.ts` is split from its resolvers: a test can
 * mock this module to cross a limit with a handful of rows instead of committing a
 * 500-row fixture.
 *
 * Two kinds of number live here, and they are not interchangeable:
 *
 * - **Gates** (`*_MIN`/`*_MAX`) decide whether a family is suggested at all. Above
 *   the ceiling the chart is unreadable or unbuildable, so the card is withheld
 *   rather than shown and left to fail — a 500-row Prometheus response would give
 *   `radarToEChartsOption` 500 axes.
 * - **Preview caps** (`PREVIEW_*`) never change what the suggestion *builds*.
 *   Grafana applies them only to the data behind the card (`maxSeries` slices
 *   `data.series`, `maxRows` truncates each field's `values`), so the panel the
 *   user creates from the card still sees the full response.
 *
 * See `docs/performance.md` for why previews degrade differently from panels.
 */

/**
 * Frames per preview card. Grafana renders each card as a real panel at 350x219
 * (`VisualizationSuggestionCard`), so without this every card runs the full
 * converter plus a canvas paint over the *entire* frame set — ten cards over a
 * 500-series response is ten full panel renders. Twenty series is already more
 * than reads at that size; it is a cost ceiling, not a design choice.
 */
export const PREVIEW_MAX_SERIES = 20;

/**
 * Rows per frame for the time-based previews (cartesian, stream). Above this the
 * extra points land inside a single card pixel, so they cost render time and add
 * no information.
 */
export const PREVIEW_MAX_ROWS = 500;

/**
 * Fewest axes worth drawing as a polygon. Radar with two indicators degenerates to
 * a line and parallel coordinates to a single segment, both of which the cartesian
 * family draws better.
 */
export const MULTIVARIATE_MIN_AXES = 3;

/**
 * Most axes radar/parallel can place before the indicator ring is illegible.
 * `frameToCategorical` turns one *row* into one axis, so this bounds rows — and it
 * is the gate that stops a dense time series from reaching radar at all.
 */
export const MULTIVARIATE_MAX_AXES = 50;

/**
 * Rows kept in a multivariate *preview*, i.e. indicators drawn on the card. Well
 * below `MULTIVARIATE_MAX_AXES`: 50 axis labels around a 350px card are a grey
 * smear, while 25 still reads as the right shape.
 */
export const MULTIVARIATE_PREVIEW_MAX_ROWS = 25;

/**
 * Most numeric fields (polygons/polylines) a multivariate chart can overlay before
 * the fills stop being separable.
 */
export const MULTIVARIATE_MAX_SERIES = 12;

/** Fewest slices that show a part-to-whole relationship. One slice is always 100%. */
export const SLICE_MIN = 2;

/**
 * Most slices a pie/funnel can carry. Matches core piechart's own `SLICE_MAX`, so
 * this plugin withholds where core withholds.
 */
export const SLICE_MAX = 30;

/**
 * Most rows the all-values slice mode accepts. Reducing a single numeric column
 * yields exactly one slice (a 100% pie), so a single-column frame has to be read
 * row-per-slice instead — but only while the row count is small enough to be a
 * category list rather than a series.
 */
export const ALL_VALUES_MAX_ROWS = 20;

/**
 * Most rows a categorical (no time field) cartesian chart accepts, matching core
 * barchart's own row gate: past this the category axis labels overlap illegibly.
 */
export const CATEGORY_MAX_ROWS = 50;

/** Fewest layers that make a stream graph rather than one filled area chart. */
export const STREAM_MIN_LAYERS = 2;

/**
 * Most layers a stream graph can stack while individual ribbons stay traceable.
 * `modules/stream/parity.md` already described this ceiling before it existed.
 */
export const STREAM_MAX_LAYERS = 20;

/**
 * Most edges a relations chart accepts. Force-directed layout is iterative and its
 * cost grows with edge count, so this is a render-time ceiling as much as a
 * legibility one.
 */
export const RELATIONS_MAX_EDGES = 500;

/**
 * Most nodes worth laying out as a chord ring. A chord gives every node an arc on
 * one circle, so it runs out of circumference far sooner than a force graph runs
 * out of canvas — past this the Chord card is dropped while Graph and Sankey stay.
 */
export const RELATIONS_CHORD_MAX_NODES = 40;

/**
 * Most numeric fields (X columns) a matrix heatmap accepts. Each becomes one tile
 * column with its field name as the axis label.
 */
export const HEATMAP_MATRIX_MAX_COLUMNS = 50;

/**
 * Most rows (Y categories) a matrix heatmap accepts. Higher than the column
 * ceiling because row labels stack vertically, where there is more room.
 */
export const HEATMAP_MATRIX_MAX_ROWS = 100;
