import { dateTimeFormat } from '@grafana/data';
import { SortOrder, TooltipDisplayMode } from '@grafana/schema';
import { ValueFormatter } from 'echarts/style';
import { ColorIndicator, ColorPlacement, VizTooltipItem } from 'grafana/VizTooltip';

/**
 * ECharts tooltip trigger used by the supported series types: cartesian time
 * series share an x axis (`axis`) while pie/radar are hovered per item (`item`).
 */
export type EChartsTooltipTrigger = 'axis' | 'item';

/** Series families with distinct hover-data shapes, used to pick a mapper. */
export type TooltipKind = 'timeseries' | 'pie' | 'radar' | 'heatmap';

/**
 * Identifies the ECharts data point a tooltip row was built from, so the panel
 * can resolve the originating Grafana field (for data links) on pin. `seriesIndex`
 * is the index into the ECharts `series` array; `dataIndex` is the row within it.
 */
export interface TooltipItemRef {
  seriesIndex: number;
  dataIndex: number;
}

/**
 * Content for the Grafana tooltip, split into the bold header row (the hovered
 * x value / category) and the per-series rows beneath it.
 *
 * `refs` are the (deduped) data points the rows came from; they are not rendered
 * but let the panel look up data links/actions for the pinned tooltip.
 */
export interface TooltipModel {
  header: VizTooltipItem;
  items: VizTooltipItem[];
  refs: TooltipItemRef[];
}

/** Everything the mappers need beyond the raw ECharts hover params. */
export interface TooltipBuildContext {
  kind: TooltipKind;
  valueFormatter: ValueFormatter;
  timeZone: string;
  /** Radar indicator (axis) names, in option order, to label each value row. */
  radarIndicators: string[];
  /** Sort order applied to multi-series (axis) rows by numeric value. */
  sort: SortOrder;
  /** When true, multi-series rows with a value of exactly 0 are dropped. */
  hideZeros: boolean;
}

/**
 * Pick the ECharts tooltip trigger for the active series kind and tooltip mode.
 *
 * Cartesian time series default to `axis` (all series at the hovered x), but
 * "Single" mode narrows that to `item` (just the hovered point). Pie/radar are
 * always hovered per item, so the mode does not change their trigger.
 */
export function tooltipTriggerForMode(kind: TooltipKind, mode: TooltipDisplayMode): EChartsTooltipTrigger {
  if (kind === 'timeseries') {
    return mode === TooltipDisplayMode.Single ? 'item' : 'axis';
  }
  // Heatmap cells (and pie/radar) are hovered per item.
  return 'item';
}

/**
 * ECharts adds `axisValue`/`axisValueLabel` to the callback params for
 * axis-triggered tooltips; they are not part of the base `CallbackDataParams`.
 */
export interface EChartsTooltipParam {
  seriesName?: string;
  name: string;
  color?: unknown;
  value: unknown;
  percent?: number;
  dataIndex: number;
  seriesIndex?: number;
  axisValue?: number | string;
  axisValueLabel?: string;
}

/**
 * Crosshair line color used by Core Grafana's uPlot panels. Taken from
 * `@grafana/ui`'s `themes/GlobalStyles/uPlot.ts` (`.u-cursor-x`/`.u-cursor-y`),
 * which draws `1px dashed rgba(120, 120, 130, 0.5)` and is the same in both the
 * light and dark themes.
 */
const CROSSHAIR_COLOR = 'rgba(120, 120, 130, 0.5)';

/**
 * ECharts `axisPointer` styled to match Core Grafana's uPlot cursor crosshair:
 * a thin dashed line on both axes (`type: 'cross'`) and no axis value-label
 * boxes, so the cartesian charts get the same hover affordance as native panels.
 */
export function getCrosshairAxisPointer() {
  const lineStyle = { color: CROSSHAIR_COLOR, width: 1, type: 'dashed' as const };
  return {
    show: true,
    type: 'cross' as const,
    lineStyle,
    crossStyle: lineStyle,
    // uPlot draws plain dashed lines; suppress ECharts' default value-label boxes.
    label: { show: false },
  };
}

/**
 * Static ECharts `tooltip` config that keeps ECharts' hover/axis-pointer
 * machinery and positioning but renders an empty, fully transparent box, so the
 * Grafana React tooltip (portaled into that box) is the only thing visible.
 *
 * The `formatter` is intentionally omitted here: it closes over React state and
 * is supplied by the panel via the tooltip hook.
 *
 * When `mode` is "None" the tooltip is disabled entirely (no box, no crosshair).
 */
export function getTooltipOption(trigger: EChartsTooltipTrigger, mode?: TooltipDisplayMode) {
  if (mode === TooltipDisplayMode.None) {
    return { show: false };
  }

  return {
    show: true,
    trigger,
    // Render into the chart container (not <body>) so the portal stays scoped.
    appendToBody: false,
    // Hide ECharts' own chrome; the Grafana component draws the box.
    backgroundColor: 'transparent',
    borderWidth: 0,
    padding: 0,
    extraCssText: 'box-shadow: none;',
    // Crosshair on cursor position for axis-triggered (time series) charts,
    // styled to match Core Grafana's uPlot cursor.
    axisPointer: getCrosshairAxisPointer(),
  };
}

/** Viewport-relative cursor anchor (clientX/clientY). */
export interface TooltipAnchor {
  x: number;
  y: number;
}

/** Measured tooltip box size in pixels. */
export interface TooltipSize {
  width: number;
  height: number;
}

/** Gap (px) between the cursor and the tooltip box, and from the viewport edge. */
const TOOLTIP_CURSOR_OFFSET = 12;
const TOOLTIP_VIEWPORT_MARGIN = 8;

/**
 * Position the tooltip box relative to the cursor, mirroring Core Grafana's
 * uPlot tooltip: by default it sits to the bottom-left of the cursor. It flips
 * to the right when it would overflow the left edge and above when it would
 * overflow the bottom, then clamps so it never leaves the viewport.
 *
 * Pure and viewport-injectable so it can be unit tested without a DOM.
 */
export function computeTooltipPosition(
  anchor: TooltipAnchor,
  size: TooltipSize,
  viewport: TooltipSize
): { left: number; top: number } {
  // Default: bottom-left of the cursor (box's top-right corner near the cursor).
  let left = anchor.x - size.width - TOOLTIP_CURSOR_OFFSET;
  let top = anchor.y + TOOLTIP_CURSOR_OFFSET;

  // Flip to the right of the cursor if the box would overflow the left edge.
  if (left < TOOLTIP_VIEWPORT_MARGIN) {
    left = anchor.x + TOOLTIP_CURSOR_OFFSET;
  }

  // Flip above the cursor if the box would overflow the bottom edge.
  if (top + size.height > viewport.height - TOOLTIP_VIEWPORT_MARGIN) {
    top = anchor.y - size.height - TOOLTIP_CURSOR_OFFSET;
  }

  // Final clamp so the box stays fully within the viewport.
  left = Math.max(TOOLTIP_VIEWPORT_MARGIN, Math.min(left, viewport.width - size.width - TOOLTIP_VIEWPORT_MARGIN));
  top = Math.max(TOOLTIP_VIEWPORT_MARGIN, Math.min(top, viewport.height - size.height - TOOLTIP_VIEWPORT_MARGIN));

  return { left, top };
}

function toColor(color: unknown): string | undefined {
  return typeof color === 'string' ? color : undefined;
}

function toNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Cartesian series carry `[time, value]` tuples; pull the value half out. */
function tupleValue(value: unknown): number | null {
  if (Array.isArray(value)) {
    return toNumber(value[1]);
  }
  return toNumber(value);
}

/** Cartesian series carry `[time, value]` tuples; pull the time half out. */
function tupleTime(value: unknown): number | null {
  if (Array.isArray(value)) {
    return toNumber(value[0]);
  }
  return null;
}

/**
 * Axis trigger (time series): `params` is one entry per series at the hovered
 * x. The header shows the formatted timestamp; each row is a series with its
 * color, name, and value formatted via the field config.
 */
function buildTimeSeriesModel(
  params: EChartsTooltipParam[],
  valueFormatter: ValueFormatter,
  timeZone: string,
  sort: SortOrder,
  hideZeros: boolean
): TooltipModel | null {
  if (params.length === 0) {
    return null;
  }

  const first = params[0];
  const time = tupleTime(first.value) ?? (typeof first.axisValue === 'number' ? first.axisValue : null);

  const header: VizTooltipItem = {
    label: '',
    value: time != null ? dateTimeFormat(time, { timeZone }) : (first.axisValueLabel ?? ''),
  };

  // Build row + ref together so any reordering/filtering keeps them in lockstep.
  let entries = params.map((param) => {
    const numeric = tupleValue(param.value);
    const item: VizTooltipItem = {
      label: param.seriesName ?? '',
      value: valueFormatter(numeric),
      color: toColor(param.color),
      colorIndicator: ColorIndicator.series,
      colorPlacement: ColorPlacement.first,
      numeric: numeric ?? undefined,
    };
    const ref: TooltipItemRef = { seriesIndex: param.seriesIndex ?? -1, dataIndex: param.dataIndex };
    return { item, ref };
  });

  if (hideZeros) {
    entries = entries.filter((entry) => entry.item.numeric !== 0);
  }

  if (sort !== SortOrder.None) {
    const direction = sort === SortOrder.Ascending ? 1 : -1;
    entries.sort((a, b) => ((a.item.numeric ?? -Infinity) - (b.item.numeric ?? -Infinity)) * direction);
  }

  return { header, items: entries.map((entry) => entry.item), refs: entries.map((entry) => entry.ref) };
}

/**
 * Item trigger (pie): a single hovered slice. The header is the slice name; the
 * row shows the formatted value with its share of the whole.
 */
function buildPieModel(param: EChartsTooltipParam, valueFormatter: ValueFormatter): TooltipModel {
  const value = valueFormatter(toNumber(param.value));
  const percent = typeof param.percent === 'number' ? ` (${param.percent}%)` : '';

  return {
    header: { label: '', value: param.name },
    items: [
      {
        label: param.seriesName ?? param.name,
        value: `${value}${percent}`,
        color: toColor(param.color),
        colorIndicator: ColorIndicator.series,
        colorPlacement: ColorPlacement.first,
      },
    ],
    refs: [{ seriesIndex: param.seriesIndex ?? 0, dataIndex: param.dataIndex }],
  };
}

/**
 * Item trigger (radar): a single hovered polygon whose `value` is an array of
 * numbers, one per indicator (axis). The header is the polygon name; each row
 * pairs an indicator name with its formatted value.
 */
function buildRadarModel(
  param: EChartsTooltipParam,
  indicators: string[],
  valueFormatter: ValueFormatter
): TooltipModel {
  const values = Array.isArray(param.value) ? param.value : [];
  const color = toColor(param.color);

  const items: VizTooltipItem[] = values.map((value, index) => ({
    label: indicators[index] ?? `#${index}`,
    value: valueFormatter(toNumber(value)),
    color,
    colorIndicator: ColorIndicator.series,
    colorPlacement: ColorPlacement.first,
  }));

  // A radar polygon maps to a single Grafana field; the row index is not
  // meaningful per indicator, so links resolve at the field level (row 0).
  return {
    header: { label: '', value: param.name },
    items,
    refs: [{ seriesIndex: param.seriesIndex ?? 0, dataIndex: param.dataIndex }],
  };
}

/** Format a bucket bound compactly (integers stay bare, others get 3 sig figs). */
function formatBucketBound(value: number): string {
  if (!Number.isFinite(value)) {
    return '∞';
  }
  return Number.isInteger(value) ? String(value) : String(Number(value.toPrecision(3)));
}

/**
 * Heatmap tooltip. The custom cell layer hovers yield a `[xStart, yStart, xEnd,
 * yEnd, value]` tuple: the header is the cell's time, and the row shows the
 * bucket range and its value. Overlay cartesian points (a `[time, value]`
 * tuple) fall back to a single time-series-style row so a line/bar drawn over
 * the heatmap still gets a tooltip.
 */
function buildHeatmapModel(
  param: EChartsTooltipParam,
  valueFormatter: ValueFormatter,
  timeZone: string
): TooltipModel | null {
  const value = param.value;

  if (Array.isArray(value) && value.length >= 5) {
    const [xStart, yStart, , yEnd, cellValue] = value as Array<number | null>;
    const time = toNumber(xStart);
    return {
      header: { label: '', value: time != null ? dateTimeFormat(time, { timeZone }) : '' },
      items: [
        {
          label: `${formatBucketBound(Number(yStart))} - ${formatBucketBound(Number(yEnd))}`,
          value: valueFormatter(toNumber(cellValue)),
          color: toColor(param.color),
          colorIndicator: ColorIndicator.value,
          colorPlacement: ColorPlacement.first,
        },
      ],
      refs: [{ seriesIndex: param.seriesIndex ?? 0, dataIndex: param.dataIndex }],
    };
  }

  // Overlay cartesian point over the heatmap.
  const time = tupleTime(value);
  const numeric = tupleValue(value);
  return {
    header: { label: '', value: time != null ? dateTimeFormat(time, { timeZone }) : '' },
    items: [
      {
        label: param.seriesName ?? '',
        value: valueFormatter(numeric),
        color: toColor(param.color),
        colorIndicator: ColorIndicator.series,
        colorPlacement: ColorPlacement.first,
        numeric: numeric ?? undefined,
      },
    ],
    refs: [{ seriesIndex: param.seriesIndex ?? -1, dataIndex: param.dataIndex }],
  };
}

/**
 * Map ECharts hover params (single object or per-series array) to the Grafana
 * tooltip content for the active series kind. Returns `null` when there's
 * nothing to show.
 */
export function buildTooltipModel(
  params: EChartsTooltipParam | EChartsTooltipParam[],
  ctx: TooltipBuildContext
): TooltipModel | null {
  if (ctx.kind === 'timeseries') {
    return buildTimeSeriesModel(
      Array.isArray(params) ? params : [params],
      ctx.valueFormatter,
      ctx.timeZone,
      ctx.sort,
      ctx.hideZeros
    );
  }

  const param = Array.isArray(params) ? params[0] : params;
  if (!param) {
    return null;
  }

  if (ctx.kind === 'heatmap') {
    return buildHeatmapModel(param, ctx.valueFormatter, ctx.timeZone);
  }

  if (ctx.kind === 'pie') {
    return buildPieModel(param, ctx.valueFormatter);
  }

  return buildRadarModel(param, ctx.radarIndicators, ctx.valueFormatter);
}
