import { type SelectableValue } from '@grafana/data';
import { ANIMATION_ENABLED_DEFAULT } from 'editor/constants';
import { type ParallelLayout } from 'editor/types';

/**
 * Parallel-coordinates (multivariate) editor constants. The multivariate family
 * hosts radar and parallel coordinates over the *same* categorical model; these
 * are the parallel-specific paths/defaults (mirrors `editor/radar.ts`). See
 * `modules/multivariate/parity.md`.
 */

/**
 * Editor category for parallel chart-shape options. Named "Parallel" so future
 * ECharts-specific parallel options can join it. The Default-tier "Smooth" toggle
 * sits here; the Advanced options join the single "Advanced" category.
 */
export const parallelCategoryName = 'Parallel';

/** Panel option path for the parallel "Smooth" toggle (ECharts `series.smooth`). Default tier. */
export const parallelSmoothPath = 'parallelSmooth';
/** Default smooth: off (straight segments between axes) — matches ECharts' own default. */
export const PARALLEL_SMOOTH_DEFAULT = false;

/** Panel option path for the parallel layout direction (ECharts `parallel.layout`). Advanced. */
export const parallelLayoutPath = 'parallelLayout';
/** Parallel layout-direction options (Horizontal / Vertical). */
export const parallelLayoutOptions: Array<SelectableValue<ParallelLayout>> = [
  { value: 'horizontal', label: 'Horizontal' },
  { value: 'vertical', label: 'Vertical' },
];
/** Default parallel layout: horizontal (axes left-to-right), matching ECharts' own default. */
export const PARALLEL_LAYOUT_DEFAULT: ParallelLayout = 'horizontal';

/** Panel option path for the parallel line width in px (ECharts `series.lineStyle.width`). Advanced. */
export const parallelLineWidthPath = 'parallelLineWidth';
/** Default parallel line width: unset (ECharts default stroke), so no `width` is written. */
export const PARALLEL_LINE_WIDTH_DEFAULT: number | undefined = undefined;

/** Panel option path for the parallel line opacity 0–100 (ECharts `series.lineStyle.opacity`). Advanced. */
export const parallelLineOpacityPath = 'parallelLineOpacity';
/**
 * Default parallel line opacity: fully opaque. Deliberately *not* ECharts' own
 * default — `series-parallel.lineStyle.opacity` is 0.45 there, which reads as a
 * washed-out line against Grafana's palette and doesn't match the solid strokes
 * every other family draws. Lowering it is still the right move for dense line
 * bundles, so it stays an Advanced lever; it just opts in rather than out.
 */
export const PARALLEL_LINE_OPACITY_DEFAULT = 100;

/**
 * Default animation: off, from the shared `ANIMATION_ENABLED_DEFAULT` — animation
 * is opt-in for every family. See that constant for why, and `docs/performance.md`.
 */
export const PARALLEL_ANIMATION_ENABLED_DEFAULT = ANIMATION_ENABLED_DEFAULT;
