import { type SelectableValue } from '@grafana/data';
import { type MultivariateSeriesType, type RadarShape, type SeriesType } from 'editor/types';

/**
 * Multivariate-family editor constants (radar today; parallel coordinates is the
 * roadmap second render type — see `modules/multivariate/parity.md`). Moved out
 * of the shared `editor/constants.ts` so the family's constants live beside it
 * (mirrors `editor/pie.ts` / `editor/cartesian.ts`).
 */

/**
 * Radar types, which use a radar coordinate system (indicators + polygons)
 * rather than the cartesian time/value grid. See echarts/converters/radar.ts.
 */
export const radarSeriesTypes: SeriesType[] = ['radar'];

/**
 * Every render type the multivariate family can host. Today just `radar`;
 * `parallel` (parallel-coordinates) will be added here when implemented, at
 * which point the family's chart-module dispatch and the "Chart type" picker
 * both light up (both key off this list). Kept distinct from `radarSeriesTypes`
 * (the radar-only subset) so the radar-specific routing stays precise.
 */
export const multivariateSeriesTypes: MultivariateSeriesType[] = ['radar'];

/**
 * Render types offered by the multivariate family panel's "Chart type" picker.
 * One entry (`radar`) today, so the picker is not registered (a no-op seam);
 * adding `parallel` here lights it up. See `modules/multivariate/module.tsx`.
 */
export const MULTIVARIATE_SERIES_TYPE_OPTIONS: Array<SelectableValue<MultivariateSeriesType>> = [
  { value: 'radar', label: 'Radar' },
];

/**
 * Editor category for radar chart-shape options. Named "Radar" so future
 * ECharts-specific radar options can join it. The Default-tier "Fill area"
 * toggle sits here; the Advanced options join the single "Advanced" category.
 */
export const radarCategoryName = 'Radar';

/** Panel option path for the radar "Fill area" toggle (ECharts `series.areaStyle`). Default tier. */
export const radarFillAreaPath = 'radarFillArea';
/** Default fill area: off (polygons are outlined, not filled) — matches today's render. */
export const RADAR_FILL_AREA_DEFAULT = false;
/** Uniform opacity applied to the polygon fill when "Fill area" is on. */
export const RADAR_FILL_AREA_OPACITY = 0.3;

/** Panel option path for the radar grid shape (ECharts `radar.shape`). Advanced. */
export const radarShapePath = 'radarShape';
/** Radar grid shape options (Polygon / Circle). */
export const radarShapeOptions: Array<SelectableValue<RadarShape>> = [
  { value: 'polygon', label: 'Polygon' },
  { value: 'circle', label: 'Circle' },
];
/** Default radar shape: polygon (straight edges), matching ECharts' own default. */
export const RADAR_SHAPE_DEFAULT: RadarShape = 'polygon';

/** Panel option path for the radar line width in px (ECharts `series.lineStyle.width`). Advanced. */
export const radarLineWidthPath = 'radarLineWidth';
/** Default radar line width: unset (ECharts default stroke), so no `width` is written. */
export const RADAR_LINE_WIDTH_DEFAULT: number | undefined = undefined;

/**
 * Panel option path for the radar symbol size in px (ECharts `series.symbolSize`);
 * `0` hides the vertex markers. Advanced.
 */
export const radarSymbolSizePath = 'radarSymbolSize';
/** Default radar symbol size: unset (ECharts default marker), so nothing is written. */
export const RADAR_SYMBOL_SIZE_DEFAULT: number | undefined = undefined;

/** Panel option path for the radar ring count (ECharts `radar.splitNumber`). Advanced. */
export const radarSplitNumberPath = 'radarSplitNumber';
/** Default radar ring count: unset (ECharts default, 5 rings), so nothing is written. */
export const RADAR_SPLIT_NUMBER_DEFAULT: number | undefined = undefined;

/** Default animation state: enabled (matches ECharts). Reset in Default editor mode. */
export const RADAR_ANIMATION_ENABLED_DEFAULT = true;
