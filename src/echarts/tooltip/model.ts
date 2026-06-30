import { dateTimeFormat } from '@grafana/data';
import { SortOrder } from '@grafana/schema';
import { ValueFormatter } from 'echarts/style';
import { formatBucketBound } from 'echarts/format';
import { ColorIndicator, ColorPlacement, VizTooltipItem } from 'grafana/VizTooltip';
import {
  EChartsTooltipParam,
  TooltipBuildContext,
  TooltipItemRef,
  TooltipKind,
  TooltipModel,
} from './types';

function toColor(color: unknown): string | undefined {
  return typeof color === 'string' ? color : undefined;
}

function toNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function tupleValue(value: unknown): number | null {
  if (Array.isArray(value)) {
    return toNumber(value[1]);
  }
  return toNumber(value);
}

function tupleTime(value: unknown): number | null {
  if (Array.isArray(value)) {
    return toNumber(value[0]);
  }
  return null;
}

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

  return {
    header: { label: '', value: param.name },
    items,
    refs: [{ seriesIndex: param.seriesIndex ?? 0, dataIndex: param.dataIndex }],
  };
}

function buildHeatmapModel(
  param: EChartsTooltipParam,
  valueFormatter: ValueFormatter,
  timeZone: string,
  xIsTime: boolean
): TooltipModel | null {
  const value = param.value;
  if (Array.isArray(value) && value.length >= 5) {
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
      refs: [{ seriesIndex: param.seriesIndex ?? 0, dataIndex: param.dataIndex }],
    };
  }

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

type TooltipModelBuilder = (
  params: EChartsTooltipParam | EChartsTooltipParam[],
  ctx: TooltipBuildContext
) => TooltipModel | null;

const tooltipModelBuilders: Record<TooltipKind, TooltipModelBuilder> = {
  timeseries: (params, ctx) =>
    buildTimeSeriesModel(
      Array.isArray(params) ? params : [params],
      ctx.valueFormatter,
      ctx.timeZone,
      ctx.sort,
      ctx.hideZeros
    ),
  heatmap: (params, ctx) => {
    const param = Array.isArray(params) ? params[0] : params;
    return param ? buildHeatmapModel(param, ctx.valueFormatter, ctx.timeZone, ctx.xIsTime) : null;
  },
  pie: (params, ctx) => {
    const param = Array.isArray(params) ? params[0] : params;
    return param ? buildPieModel(param, ctx.valueFormatter) : null;
  },
  radar: (params, ctx) => {
    const param = Array.isArray(params) ? params[0] : params;
    return param ? buildRadarModel(param, ctx.radarIndicators, ctx.valueFormatter) : null;
  },
};

/** Map ECharts hover params to Grafana tooltip content for the active series kind. */
export function buildTooltipModel(
  params: EChartsTooltipParam | EChartsTooltipParam[],
  ctx: TooltipBuildContext
): TooltipModel | null {
  return tooltipModelBuilders[ctx.kind](params, ctx);
}
