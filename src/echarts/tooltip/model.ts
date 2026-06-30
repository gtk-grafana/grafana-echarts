import { dateTimeFormat } from '@grafana/data';
import { SortOrder } from '@grafana/schema';
import { ValueFormatter } from 'echarts/style';
import { formatBucketBound } from 'echarts/format';
import { ColorIndicator, ColorPlacement, VizTooltipItem } from 'grafana/VizTooltip';
import {
  EChartsDataValue,
  EChartsTooltipParam,
  HeatmapTooltipParam,
  PieTooltipParam,
  RadarTooltipParam,
  TimeSeriesPoint,
  TimeSeriesTooltipParam,
  TooltipBuildContext,
  TooltipItemRef,
  TooltipKind,
  TooltipModel,
  TooltipParam,
} from './types';

function toColor(color: unknown): string | undefined {
  return typeof color === 'string' ? color : undefined;
}

function toNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * ECharts hands cartesian (heatmap overlay) points back as `[time, value]` tuples
 * — index 0 is the x (epoch ms), index 1 the y; pull the numeric y out
 * positionally. These tuples are ECharts-native coordinate data, so unlike the
 * time series path they can't be normalized away upstream.
 * See https://echarts.apache.org/en/option.html#series-line.data
 */
function cartesianTupleValue(value: EChartsDataValue | EChartsDataValue[]): number | null {
  if (Array.isArray(value)) {
    return toNumber(value[1]);
  }
  return toNumber(value);
}

/** Pull the x (epoch ms) out of a cartesian `[time, value]` tuple; null if not a tuple. */
function cartesianTupleTime(value: EChartsDataValue | EChartsDataValue[]): number | null {
  if (Array.isArray(value)) {
    return toNumber(value[0]);
  }
  return null;
}

/**
 * Normalize a raw time series hover value into a structured point. ECharts reports
 * the `[time, value]` cartesian tuple (index 0 = x epoch ms, index 1 = y) we fed
 * the series, or a bare scalar y on a categorical x axis.
 * See https://echarts.apache.org/en/option.html#series-line.data
 */
function toTimeSeriesPoint(value: EChartsDataValue | EChartsDataValue[]): TimeSeriesPoint {
  if (Array.isArray(value)) {
    return { time: toNumber(value[0]), numeric: toNumber(value[1]) };
  }
  return { time: null, numeric: toNumber(value) };
}

function buildTimeSeriesModel(
  params: TimeSeriesTooltipParam[],
  valueFormatter: ValueFormatter,
  timeZone: string,
  sort: SortOrder,
  hideZeros: boolean
): TooltipModel | null {
  if (params.length === 0) {
    return null;
  }

  const first = params[0];
  const time = first.value.time ?? (typeof first.axisValue === 'number' ? first.axisValue : null);

  const header: VizTooltipItem = {
    label: '',
    value: time != null ? dateTimeFormat(time, { timeZone }) : (first.axisValueLabel ?? ''),
  };

  let entries = params.map((param) => {
    const numeric = param.value.numeric;
    const item: VizTooltipItem = {
      label: param.seriesName ?? '',
      value: valueFormatter(numeric),
      color: toColor(param.color),
      colorIndicator: ColorIndicator.series,
      colorPlacement: ColorPlacement.first,
      numeric: numeric ?? undefined,
    };
    const ref: TooltipItemRef = { seriesIndex: param.seriesIndex ?? -1, rowIndex: param.rowIndex };
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

function buildPieModel(param: PieTooltipParam, valueFormatter: ValueFormatter): TooltipModel {
  const value = valueFormatter(toNumber(param.value));
  const percent = param.percent !== undefined ? ` (${param.percent}%)` : '';

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
    refs: [{ seriesIndex: param.seriesIndex ?? 0, rowIndex: param.rowIndex }],
  };
}

function buildRadarModel(
  param: RadarTooltipParam,
  indicators: string[],
  valueFormatter: ValueFormatter
): TooltipModel {
  const values = param.value;
  const color = toColor(param.color);

  const items: VizTooltipItem[] = values.map((value, index) => ({
    label: indicators[index] ?? `#${index}`,
    value: valueFormatter(toNumber(value)),
    color,
    colorIndicator: ColorIndicator.series,
    colorPlacement: ColorPlacement.first,
  }));

  return {
    header: { label: '', value: param.name },
    items,
    refs: [{ seriesIndex: param.seriesIndex ?? 0, rowIndex: param.rowIndex }],
  };
}

function buildHeatmapModel(
  param: HeatmapTooltipParam,
  valueFormatter: ValueFormatter,
  timeZone: string,
  xIsTime: boolean
): TooltipModel | null {
  const value = param.value;
  // Heatmap cell: the `[xStart, yStart, xEnd, yEnd, value]` tuple encoded by our
  // custom series (see echarts/options/heatmap.ts). A shorter array is a cartesian
  // overlay `[time, value]`, handled by the fallback below.
  // See https://echarts.apache.org/en/option.html#series-custom.encode
  if (value.length >= 5) {
    const [xStart, yStart, xEnd, yEnd, cellValue] = value as Array<number | null>;
    const xs = toNumber(xStart);
    const xe = toNumber(xEnd);
    let headerValue = '';
    if (xIsTime) {
      headerValue = xs != null ? dateTimeFormat(xs, { timeZone }) : '';
    } else if (xs != null) {
      headerValue = xe != null ? `${formatBucketBound(xs)} - ${formatBucketBound(xe)}` : formatBucketBound(xs);
    }
    return {
      header: { label: '', value: headerValue },
      items: [
        {
          label: `${formatBucketBound(Number(yStart))} - ${formatBucketBound(Number(yEnd))}`,
          value: valueFormatter(toNumber(cellValue)),
          color: toColor(param.color),
          colorIndicator: ColorIndicator.value,
          colorPlacement: ColorPlacement.first,
        },
      ],
      refs: [{ seriesIndex: param.seriesIndex ?? 0, rowIndex: param.rowIndex }],
    };
  }

  const time = cartesianTupleTime(value);
  const numeric = cartesianTupleValue(value);
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
    refs: [{ seriesIndex: param.seriesIndex ?? -1, rowIndex: param.rowIndex }],
  };
}

/**
 * Attach the active kind to a raw param so the mappers receive a precise
 * {@link TooltipParam} variant. ECharts guarantees the matching `value` shape for
 * the configured series kind but does not tag params, so narrowing here is sound.
 */
function tag<K extends Exclude<TooltipKind, 'timeseries'>>(
  param: EChartsTooltipParam,
  kind: K
): Extract<TooltipParam, { kind: K }> {
  return { ...param, kind } as Extract<TooltipParam, { kind: K }>;
}

/** Narrow a raw param to the time series variant, normalizing its tuple/scalar value. */
function tagTimeSeries(param: EChartsTooltipParam): TimeSeriesTooltipParam {
  return { ...param, kind: 'timeseries', value: toTimeSeriesPoint(param.value) };
}

/** Map ECharts hover params to Grafana tooltip content for the active series kind. */
export function buildTooltipModel(
  params: EChartsTooltipParam | EChartsTooltipParam[],
  ctx: TooltipBuildContext
): TooltipModel | null {
  const list = Array.isArray(params) ? params : [params];
  switch (ctx.kind) {
    case 'timeseries':
      return buildTimeSeriesModel(
        list.map(tagTimeSeries),
        ctx.valueFormatter,
        ctx.timeZone,
        ctx.sort,
        ctx.hideZeros
      );
    case 'heatmap': {
      const first = list[0];
      return first ? buildHeatmapModel(tag(first, 'heatmap'), ctx.valueFormatter, ctx.timeZone, ctx.xIsTime) : null;
    }
    case 'pie': {
      const first = list[0];
      return first ? buildPieModel(tag(first, 'pie'), ctx.valueFormatter) : null;
    }
    case 'radar': {
      const first = list[0];
      return first ? buildRadarModel(tag(first, 'radar'), ctx.radarIndicators, ctx.valueFormatter) : null;
    }
  }
}
