import { type SelectableValue } from '@grafana/data';
import { type MultivariateSeriesType, type RadarShape, type SeriesType, type SeriesTypeOption } from 'editor/types';

/**
 * Multivariate-family editor constants and chart-type selection helpers. Radar's
 * own constants live here; the parallel-coordinates constants live in
 * `editor/parallel.ts`. Moved out of the shared `editor/constants.ts` so the
 * family's constants live beside it (mirrors `editor/pie.ts` / `editor/cartesian.ts`).
 * See `modules/multivariate/parity.md`.
 */

/**
 * Radar types, which use a radar coordinate system (indicators + polygons)
 * rather than the cartesian time/value grid. See echarts/converters/radar.ts.
 */
export const radarSeriesTypes: SeriesType[] = ['radar'];

/**
 * Every render type the multivariate family can host: radar and parallel
 * coordinates. Both use the shared categorical model but different coordinate
 * systems, so the family's chart-module dispatch (`multivariateChartModule`) and
 * axis mapping key off this list. The "Chart type" picker lights up separately,
 * once `MULTIVARIATE_SERIES_TYPE_OPTIONS` lists more than one option. Kept
 * distinct from `radarSeriesTypes` (the radar-only subset) so the radar-specific
 * routing stays precise.
 */
export const multivariateSeriesTypes: MultivariateSeriesType[] = ['radar', 'parallel'];

/**
 * Render types offered by the multivariate family panel's "Chart type" picker.
 * With more than one entry the picker registers (see
 * `modules/multivariate/module.tsx`), letting a panel toggle radar↔parallel over
 * the same frames.
 */
export const MULTIVARIATE_SERIES_TYPE_OPTIONS: Array<SelectableValue<MultivariateSeriesType>> = [
  { value: 'radar', label: 'Radar' },
  { value: 'parallel', label: 'Parallel' },
];

/**
 * Resolve the multivariate panel's stored `seriesType` to a concrete render type.
 * The "Chart type" picker writes `radar` or `parallel`; an unset or `'Auto'` value
 * (a fresh panel, or one predating the picker) resolves to `radar`, the family
 * default (mirrors `resolveAutoSeriesType`). Drives the editor `showIf` gates so
 * radar and parallel options stay mutually exclusive.
 */
export function resolveMultivariateSeriesType(options: { seriesType?: SeriesTypeOption }): MultivariateSeriesType {
  return options.seriesType === 'parallel' ? 'parallel' : 'radar';
}

/** Whether the multivariate panel is rendering radar (the family default). */
export const isRadarSelected = (options: { seriesType?: SeriesTypeOption }): boolean =>
  resolveMultivariateSeriesType(options) === 'radar';

/** Whether the multivariate panel is rendering parallel coordinates. */
export const isParallelSelected = (options: { seriesType?: SeriesTypeOption }): boolean =>
  resolveMultivariateSeriesType(options) === 'parallel';

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
