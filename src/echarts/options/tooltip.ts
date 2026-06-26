import { dateTimeFormat } from '@grafana/data';
import { ValueFormatter } from 'echarts/style';
import { ColorIndicator, ColorPlacement, VizTooltipItem } from 'grafana/VizTooltip';

/**
 * ECharts tooltip trigger used by the supported series types: cartesian time
 * series share an x axis (`axis`) while pie/radar are hovered per item (`item`).
 */
export type EChartsTooltipTrigger = 'axis' | 'item';

/** Series families with distinct hover-data shapes, used to pick a mapper. */
export type TooltipKind = 'timeseries' | 'pie' | 'radar';

/**
 * Content for the Grafana tooltip, split into the bold header row (the hovered
 * x value / category) and the per-series rows beneath it.
 */
export interface TooltipModel {
  header: VizTooltipItem;
  items: VizTooltipItem[];
}

/** Everything the mappers need beyond the raw ECharts hover params. */
export interface TooltipBuildContext {
  kind: TooltipKind;
  valueFormatter: ValueFormatter;
  timeZone: string;
  /** Radar indicator (axis) names, in option order, to label each value row. */
  radarIndicators: string[];
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
 * Static ECharts `tooltip` config that keeps ECharts' hover/axis-pointer
 * machinery and positioning but renders an empty, fully transparent box, so the
 * Grafana React tooltip (portaled into that box) is the only thing visible.
 *
 * The `formatter` is intentionally omitted here: it closes over React state and
 * is supplied by the panel via the tooltip hook.
 */
export function getTooltipOption(trigger: EChartsTooltipTrigger) {
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
    // Keep the crosshair line for axis-triggered (time series) charts.
    axisPointer: { type: 'line' as const },
  };
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
  timeZone: string
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

  const items: VizTooltipItem[] = params.map((param) => ({
    label: param.seriesName ?? '',
    value: valueFormatter(tupleValue(param.value)),
    color: toColor(param.color),
    colorIndicator: ColorIndicator.series,
    colorPlacement: ColorPlacement.first,
  }));

  return { header, items };
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

  return { header: { label: '', value: param.name }, items };
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
    return buildTimeSeriesModel(Array.isArray(params) ? params : [params], ctx.valueFormatter, ctx.timeZone);
  }

  const param = Array.isArray(params) ? params[0] : params;
  if (!param) {
    return null;
  }

  if (ctx.kind === 'pie') {
    return buildPieModel(param, ctx.valueFormatter);
  }

  return buildRadarModel(param, ctx.radarIndicators, ctx.valueFormatter);
}
