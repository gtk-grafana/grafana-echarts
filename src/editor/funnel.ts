import { type SelectableValue } from '@grafana/data';
import {
  type FunnelAlign,
  type FunnelLabelPosition,
  type FunnelOrient,
  type SeriesType,
  type SeriesTypeOption,
} from 'editor/types';

/**
 * Funnel render type(s) of the part-to-whole family. A funnel reuses the pie
 * slice model verbatim (`resolvePieSlices`); only the layout/option builder and
 * its editor options are funnel-specific. See `getFunnelSeries`.
 */
export const funnelSeriesTypes: SeriesType[] = ['funnel'];

/**
 * Whether the stored part-to-whole `seriesType` selects the funnel variant.
 * Passed as an option's `showIf` (composed with the Advanced-mode gate) to reveal
 * funnel-only controls. Typed on the minimal `seriesType` shape so it satisfies
 * the builders' `(options: PanelOptions) => boolean` predicate.
 */
export const isFunnelVariant = (options: { seriesType?: SeriesTypeOption }): boolean => options.seriesType === 'funnel';

/**
 * Whether the stored part-to-whole `seriesType` selects the pie variant. Pie is
 * the family default, so an unset/`'Auto'` value counts as pie (mirrors
 * `resolveAutoSeriesType('part-to-whole') === 'pie'`). Passed as `showIf` to hide
 * pie-only controls when the funnel variant is selected.
 */
export const isPieVariant = (options: { seriesType?: SeriesTypeOption }): boolean => !isFunnelVariant(options);

/**
 * Editor category grouping the funnel layout options (orientation, alignment,
 * gap, size, label position). Unlike the pie's ECharts-only extras — which live in
 * the shared "Advanced" category and gate on Advanced editor mode — the funnel is
 * an entirely ECharts type with no core-parity baseline, so its primary controls
 * get a dedicated always-visible category (gated only on `isFunnelVariant`),
 * mirroring the pie's "Pie" category.
 */
export const funnelCategoryName = 'Funnel';

/**
 * Whether the funnel is laid out horizontally (`funnelOrient === 'horizontal'`).
 * Composed with `isFunnelVariant` as a control's `showIf` to reveal the
 * orientation-specific label placements, and consumed at render to force center
 * alignment. Unset falls back to the vertical default. Typed on the minimal
 * `funnelOrient` shape so it satisfies the builders' predicate.
 */
export const isFunnelHorizontal = (options: { funnelOrient?: FunnelOrient }): boolean =>
  (options.funnelOrient ?? FUNNEL_ORIENT_DEFAULT) === 'horizontal';

/** Whether the funnel is laid out vertically (the default). Inverse of `isFunnelHorizontal`. */
export const isFunnelVertical = (options: { funnelOrient?: FunnelOrient }): boolean => !isFunnelHorizontal(options);

/** Panel option path for the funnel layout direction. Maps to ECharts `series.orient`. */
export const funnelOrientPath = 'funnelOrient';
/** Funnel layout-direction options (Vertical / Horizontal). */
export const funnelOrientOptions: Array<SelectableValue<FunnelOrient>> = [
  { value: 'vertical', label: 'Vertical' },
  { value: 'horizontal', label: 'Horizontal' },
];
/** Default funnel orient: vertical (matches ECharts). Omitted from the series at this default. */
export const FUNNEL_ORIENT_DEFAULT: FunnelOrient = 'vertical';

/** Panel option path for the funnel cross-axis alignment. Maps to ECharts `series.funnelAlign`. */
export const funnelAlignPath = 'funnelAlign';
/** Funnel alignment options (Center / Left / Right), for the default vertical orient. */
export const funnelAlignOptions: Array<SelectableValue<FunnelAlign>> = [
  { value: 'center', label: 'Center' },
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
];
/** Default funnel alignment: center (matches ECharts). Omitted from the series at this default. */
export const FUNNEL_ALIGN_DEFAULT: FunnelAlign = 'center';

/**
 * Panel option path for the gap (px) between funnel trapezoids (ECharts
 * `series.gap`). Advanced-only; omitted at the ECharts default of 0.
 */
export const funnelGapPath = 'funnelGap';
/** Default funnel gap: 0 (matches ECharts; omitted from the series). */
export const FUNNEL_GAP_DEFAULT = 0;

/**
 * Panel option paths for the funnel min/max trapezoid extent as a percentage of
 * the layout box (ECharts `series.minSize` / `series.maxSize`). Advanced-only;
 * unset falls back to the ECharts defaults ('0%' / '100%'), so the keys are
 * omitted. See `getFunnelSize`.
 */
export const funnelMinSizePath = 'funnelMinSize';
export const funnelMaxSizePath = 'funnelMaxSize';

/** Panel option path for the funnel slice-label placement. Maps to ECharts `label.position`. */
export const funnelLabelPositionPath = 'funnelLabelPosition';
/**
 * Funnel slice-label placements for the vertical orient (the default): `left`/
 * `right` place the label outside with a leader line; `inside` draws it on the
 * trapezoid (the plugin default). A vertical funnel stacks top-to-bottom, so
 * `top`/`bottom` would collide with adjacent segments and are not offered. See
 * `funnelLabelPositionHorizontalOptions` for the horizontal counterpart and
 * `getFunnelLabel` for rendering.
 */
export const funnelLabelPositionVerticalOptions: Array<SelectableValue<FunnelLabelPosition>> = [
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
  { value: 'inside', label: 'Inside' },
];
/**
 * Funnel slice-label placements for the horizontal orient: `top`/`bottom` place
 * the label outside (above/below); `center` draws it on the trapezoid (the
 * on-segment placement, analogous to the vertical `inside`). A horizontal funnel
 * runs left-to-right, so `left`/`right` would collide with adjacent segments and
 * are not offered. See `getFunnelLabel`.
 */
export const funnelLabelPositionHorizontalOptions: Array<SelectableValue<FunnelLabelPosition>> = [
  { value: 'top', label: 'Top' },
  { value: 'bottom', label: 'Bottom' },
  { value: 'center', label: 'Center' },
];
/**
 * Default funnel slice-label placement for the vertical orient: inside the
 * trapezoid. Unlike ECharts' `'outer'` funnel default, `inside` keeps labels
 * attached without leader-line room, giving a clean out-of-box part-to-whole read.
 * Always emitted (like the pie label position); see `getFunnelLabel`.
 */
export const FUNNEL_LABEL_POSITION_DEFAULT: FunnelLabelPosition = 'inside';
/**
 * Default funnel slice-label placement for the horizontal orient: `center` (on the
 * trapezoid), the horizontal analogue of the vertical `inside` default.
 */
export const FUNNEL_LABEL_POSITION_HORIZONTAL_DEFAULT: FunnelLabelPosition = 'center';
