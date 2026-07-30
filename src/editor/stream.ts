import { type StreamLayerSource, type StreamSeriesType } from 'editor/types';

/**
 * Single-axis stream family editor constants (mirrors `editor/parallel.ts`).
 *
 * The family renders on the ECharts `singleAxis` coordinate system; `themeRiver`
 * is its only render type today, so there is no "Chart type" picker (the panel's
 * `'Auto'` resolver returns `themeRiver`). See `data-plane/stream.md`.
 */

/**
 * Series types the stream family renders. `themeRiver` is the only ECharts series
 * that *requires* `singleAxis` (`ThemeRiverSeriesModel.dependencies`), which is
 * why the family exists as its own panel rather than a cartesian render variant.
 */
export const streamSeriesTypes: StreamSeriesType[] = ['themeRiver'];

/**
 * Panel option path for the layer source (`auto` / `fields` / `labels`); see
 * {@link StreamLayerSource} for what each mode reads.
 *
 * JSON-only for now: the converter honors it, but the editor radio ships with the
 * rest of the option surface. Auto covers both frame shapes the family accepts,
 * so a panel never needs it set to render.
 */
export const streamLayerSourcePath = 'streamLayerSource';
/** Default layer source: infer the shape per frame. */
export const STREAM_LAYER_SOURCE_DEFAULT: StreamLayerSource = 'auto';

/**
 * Orthogonal padding around the ribbons (ECharts `series.boundaryGap`), which is
 * what keeps the river off the top edge and clear of the axis line at the bottom
 * of the single axis' rect. ECharts' own default, restated so the render layer
 * reads it from one place once it becomes an option.
 * https://echarts.apache.org/en/option.html#series-themeRiver.boundaryGap
 */
export const STREAM_BOUNDARY_GAP_DEFAULT: [string, string] = ['10%', '10%'];
