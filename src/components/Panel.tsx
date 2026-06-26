import { css } from '@emotion/css';
import { Field, FieldType, GrafanaTheme2, LinkModel, PanelProps } from '@grafana/data';
import { PanelDataErrorView } from '@grafana/runtime';
import { LegendPlacement, SortOrder, TooltipDisplayMode } from '@grafana/schema';
import { useStyles2, useTheme2, usePanelContext } from '@grafana/ui';
import { debug, LOG_LEVELS } from 'development';

import { EChartsType, init } from 'echarts';
import { frameToHeatmap, isHeatmapFrame } from 'echarts/converters/heatmap';
import { pieToEChartsOption } from 'echarts/converters/pie';
import { radarToEChartsOption } from 'echarts/converters/radar';
import { timeSeriesToEChartsOption } from 'echarts/converters/timeSeries';
import { cartesianTimeDefaultOptions, getCartesianAxisStyle } from 'echarts/options/cartesian';
import { getHeatmapSeries, getHeatmapVisualMap, HEATMAP_VISUALMAP_WIDTH } from 'echarts/options/heatmap';
import { getCartesianGrid, getLegendOption, isTableLegend } from 'echarts/options/legend';
import { buildPieLegendItems, buildRadarLegendItems, buildTimeSeriesLegendItems } from 'echarts/options/legendItems';
import { pieDefaultOptions } from 'echarts/options/pie';
import { radarDefaultOptions } from 'echarts/options/radar';
import { getCrosshairAxisPointer, getTooltipOption, TooltipItemRef, TooltipKind, tooltipTriggerForMode } from 'echarts/options/tooltip';
import { getValueFormatter, ValueFormatter } from 'echarts/style';
import { ECBasicOption } from 'echarts/types/dist/shared';
import { cartesianTimeSeriesTypes, pieSeriesTypes, radarSeriesTypes, seriesTypePath } from 'editor/series';
import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { PanelOptions } from 'types';
import { TooltipLinkResolver, useGrafanaEChartsTooltip } from './EChartsTooltip';
import { LegendTable } from './LegendTable';

interface Props extends PanelProps<PanelOptions> {}

/** Stable "no data links" resolver (heatmap cells have no per-cell links). */
const NO_LINKS: TooltipLinkResolver = () => [];

/** Default reserved size for the PoC DOM legend table when none is configured. */
const DEFAULT_LEGEND_WIDTH = 240;
const MIN_LEGEND_HEIGHT = 80;
const MAX_LEGEND_HEIGHT = 200;

/**
 * Split the panel box between the chart and the custom DOM legend table.
 *
 * A right-placed table takes a fixed-width column (capped at half the panel);
 * a bottom-placed table takes a fraction of the height. When the table legend
 * is inactive the chart fills the whole panel.
 */
const getLayout = (width: number, height: number, placement: LegendPlacement, tableLegend: boolean) => {
  if (!tableLegend) {
    return { chartWidth: width, chartHeight: height, legendWidth: width, legendHeight: 0 };
  }

  if (placement === 'right') {
    const legendWidth = Math.min(DEFAULT_LEGEND_WIDTH, Math.floor(width / 2));
    return { chartWidth: width - legendWidth, chartHeight: height, legendWidth, legendHeight: height };
  }

  const legendHeight = Math.min(Math.max(Math.round(height * 0.35), MIN_LEGEND_HEIGHT), MAX_LEGEND_HEIGHT);
  return { chartWidth: width, chartHeight: height - legendHeight, legendWidth: width, legendHeight };
};

/**
 * Build a representative value formatter from the first numeric field across all
 * frames, so tooltips and value axes honor the standard Unit/Decimals/Mappings
 * field config. Falls back to identity (String) when no numeric field exists.
 */
const getRepresentativeFormatter = (
  series: PanelProps<PanelOptions>['data']['series'],
  theme: GrafanaTheme2,
  timeZone: string
): ValueFormatter => {
  let numericField: Field | undefined;
  for (const frame of series) {
    numericField = frame.fields.find((field) => field.type === FieldType.number);
    if (numericField) {
      break;
    }
  }

  if (!numericField) {
    return (value) => String(value ?? '');
  }

  return getValueFormatter(numericField, theme, timeZone);
};

/**
 * Resolve and de-duplicate the data links for a set of (field, row) points. A
 * field only exposes `getLinks` after Grafana has applied field overrides (which
 * it does before the panel renders), so it is treated as optional here.
 */
const collectDataLinks = (points: Array<{ field?: Field; rowIndex: number }>): Array<LinkModel<Field>> => {
  const links: Array<LinkModel<Field>> = [];
  const seen = new Set<string>();

  for (const { field, rowIndex } of points) {
    if (!field?.getLinks) {
      continue;
    }
    for (const link of field.getLinks({ valueRowIndex: rowIndex })) {
      const key = `${link.title}|${link.href}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      links.push(link);
    }
  }

  return links;
};

const getStyles = (theme: GrafanaTheme2, height: number, width: number, placement: LegendPlacement) => {
  return {
    wrapper: css({
      position: 'relative',
      display: 'flex',
      flexDirection: placement === 'right' ? 'row' : 'column',
      height,
      width,
    }),
    panelContainer: css({}),
  };
};

export const Panel: React.FC<Props> = ({ options, data, width, height, fieldConfig, id, timeZone, eventBus }) => {
  const theme = useTheme2();
  // `sync` reports the dashboard's "Graph tooltip" mode; the event bus carries
  // hover events to/from other panels (shared crosshair / tooltip).
  const { sync } = usePanelContext();
  const panelDOMRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<EChartsType | null>(null);
  const seriesType = options[seriesTypePath];

  // Grafana heatmap frames (heatmap-rows/heatmap-cells) are rendered as a
  // custom-series cell layer; any remaining frames are overlaid as cartesian
  // series on the same grid. This composite path is independent of the panel's
  // single `seriesType` (which only chooses the cartesian overlay default).
  //
  // Selecting the `heatmap` type additionally *forces* every numeric frame to
  // render as a heatmap (each numeric field becomes a bucket row), even when the
  // frame isn't tagged as a heatmap.
  const forceHeatmap = seriesType === 'heatmap';
  const heatmapFrames = useMemo(() => data.series.filter(isHeatmapFrame), [data.series]);
  const cartesianFrames = useMemo(() => data.series.filter((frame) => !isHeatmapFrame(frame)), [data.series]);
  const hasHeatmap = forceHeatmap || heatmapFrames.length > 0;

  const placement: LegendPlacement = options.legend?.placement === 'right' ? 'right' : 'bottom';
  // ECharts can't draw the table legend itself, so any supported series type in
  // table mode renders the custom DOM legend instead of the native (list) one.
  // The composite heatmap mode uses the native list legend only.
  const tableLegend =
    !hasHeatmap &&
    isTableLegend(options.legend) &&
    (cartesianTimeSeriesTypes.includes(seriesType) ||
      radarSeriesTypes.includes(seriesType) ||
      pieSeriesTypes.includes(seriesType));
  const { chartWidth, chartHeight, legendWidth, legendHeight } = getLayout(width, height, placement, tableLegend);

  const styles = useStyles2(getStyles, height, width, placement);

  const legendItems = useMemo(() => {
    if (!tableLegend) {
      return [];
    }

    const calcs = options.legend?.calcs ?? [];
    if (radarSeriesTypes.includes(seriesType)) {
      return buildRadarLegendItems(data.series, theme, calcs, timeZone);
    }
    if (pieSeriesTypes.includes(seriesType)) {
      return buildPieLegendItems(data.series, theme, calcs, timeZone);
    }
    return buildTimeSeriesLegendItems(data.series, theme, calcs, timeZone);
  }, [tableLegend, seriesType, data.series, theme, options.legend?.calcs, timeZone]);

  // Representative formatter (Unit/Decimals/Mappings) shared by the value axis
  // and the Grafana tooltip so rendered values match the rest of Grafana.
  const formatValue = useMemo(
    () => getRepresentativeFormatter(data.series, theme, timeZone),
    [data.series, theme, timeZone]
  );

  const tooltipKind: TooltipKind = hasHeatmap
    ? 'heatmap'
    : radarSeriesTypes.includes(seriesType)
      ? 'radar'
      : pieSeriesTypes.includes(seriesType)
        ? 'pie'
        : 'timeseries';

  const tooltipMode = options.tooltip?.mode ?? TooltipDisplayMode.Single;
  const tooltipSort = options.tooltip?.sort ?? SortOrder.None;
  const tooltipHideZeros = options.tooltip?.hideZeros ?? false;
  const tooltipMaxWidth = options.tooltip?.maxWidth;
  const tooltipMaxHeight = options.tooltip?.maxHeight;

  // Radar value rows are labelled by indicator (axis) name; resolve them up front
  // so the tooltip formatter can map each value to its axis.
  const radarIndicators = useMemo(() => {
    if (!radarSeriesTypes.includes(seriesType)) {
      return [];
    }
    const radar = radarToEChartsOption(data.series, theme);
    return radar ? radar.indicator.map((indicator) => indicator.name) : [];
  }, [seriesType, data.series, theme]);

  // Map a hovered ECharts point (seriesIndex/dataIndex) back to the originating
  // Grafana field so the pinned tooltip can render its data links. The lookup is
  // built to match the order each converter emits series in.
  const resolveLinks: TooltipLinkResolver = useMemo(() => {
    // The heatmap cell layer has no per-cell Grafana field links to resolve.
    if (tooltipKind === 'heatmap') {
      return NO_LINKS;
    }

    if (tooltipKind === 'timeseries') {
      // Flatten frames -> numeric fields exactly as timeSeriesToEChartsOption does
      // (skipping frames without a time field), so seriesIndex lines up.
      const fields: Field[] = [];
      for (const frame of data.series) {
        if (!frame.fields.some((field) => field.type === FieldType.time)) {
          continue;
        }
        for (const field of frame.fields) {
          if (field.type === FieldType.number) {
            fields.push(field);
          }
        }
      }
      return (refs: TooltipItemRef[]) =>
        collectDataLinks(refs.map((ref) => ({ field: fields[ref.seriesIndex], rowIndex: ref.dataIndex })));
    }

    // Pie/radar share the categorical frame (first frame with a numeric field).
    const frame = data.series.find((candidate) => candidate.fields.some((field) => field.type === FieldType.number));
    const numericFields = frame ? frame.fields.filter((field) => field.type === FieldType.number) : [];

    if (tooltipKind === 'pie') {
      const valueField = numericFields[0];
      return (refs: TooltipItemRef[]) =>
        collectDataLinks(refs.map((ref) => ({ field: valueField, rowIndex: ref.dataIndex })));
    }

    // Radar: dataIndex selects the polygon (a numeric field); a single row is not
    // meaningful per polygon, so links resolve at the field level (row 0).
    return (refs: TooltipItemRef[]) =>
      collectDataLinks(refs.map((ref) => ({ field: numericFields[ref.dataIndex], rowIndex: 0 })));
  }, [tooltipKind, data.series]);

  const {
    formatter: tooltipFormatter,
    portal: tooltipPortal,
    attach: tooltipAttach,
  } = useGrafanaEChartsTooltip({
    kind: tooltipKind,
    valueFormatter: formatValue,
    timeZone,
    radarIndicators,
    sort: tooltipSort,
    hideZeros: tooltipHideZeros,
    maxWidth: tooltipMaxWidth,
    maxHeight: tooltipMaxHeight,
    resolveLinks,
    eventBus,
    getCursorSync: sync,
    // Shared crosshair/tooltip only applies to cartesian time series (the only
    // kind with a time axis to map a hovered timestamp onto).
    syncEnabled: tooltipKind === 'timeseries',
  });

  useLayoutEffect(() => {
    debug('Panel::useLayoutEffect');
    if (!panelDOMRef.current) {
      debug('Panel::useLayoutEffect::Failed to init panel', LOG_LEVELS.error);
      return;
    }
    const chart = init(panelDOMRef.current);
    panelRef.current = chart;
    // Track the cursor, clear on leave, and pin on click for the React tooltip.
    const detachTooltip = tooltipAttach(chart, panelDOMRef.current);
    return () => {
      detachTooltip();
      chart.dispose();
    };
  }, [tooltipAttach]);

  // useSetOptions
  useEffect(() => {
    if (!panelRef.current) {
      debug('Panel::useEffect::useSetOptions::No panelRef');
      return;
    }

    panelRef.current.clear();

    const valueFormatter = (value: unknown) => formatValue(typeof value === 'number' ? value : null);

    // Tooltip mode picks the ECharts trigger (and disables it entirely for
    // "Hidden"); the formatter bridges hover content to the React tooltip.
    const tooltipOption = {
      ...getTooltipOption(tooltipTriggerForMode(tooltipKind, tooltipMode), tooltipMode),
      formatter: tooltipFormatter,
    };

    // @todo look into adding "auto" series type inferred from data frame
    // Composite cartesian mode: an optional heatmap cell layer plus per-field
    // cartesian series (line/bar/scatter, resolved from field overrides). Runs
    // whenever a heatmap frame is present or the panel default is cartesian.
    if (hasHeatmap || cartesianTimeSeriesTypes.includes(seriesType)) {
      // The overlay default applies to non-heatmap frames; pie/radar defaults
      // are meaningless on a time grid, so coerce them to `line`.
      const overlayType = cartesianTimeSeriesTypes.includes(seriesType) ? seriesType : 'line';
      // When forcing heatmap, every frame feeds the heatmap layer and nothing is
      // overlaid; otherwise only tagged frames feed it and the rest overlay.
      const overlayFrames = forceHeatmap ? [] : cartesianFrames;
      const heatmapSourceFrames = forceHeatmap ? data.series : heatmapFrames;
      const cartSeries = timeSeriesToEChartsOption(overlayFrames, overlayType, theme) ?? [];
      const heatmap = hasHeatmap ? frameToHeatmap(heatmapSourceFrames, data.series) : null;

      if (cartSeries.length === 0 && !heatmap) {
        debug('Panel::useEffect::useSetOptions::No usable cartesian/heatmap data', LOG_LEVELS.error);
        return;
      }

      const axisStyle = getCartesianAxisStyle(theme);

      // Heatmap occupies series index 0 (so visualMap can target it); cartesian
      // series follow and use the right-side value axis when a heatmap is shown,
      // so the bucket scale and the metric scale don't fight.
      const overlayYAxisIndex = heatmap ? 1 : 0;
      const series: unknown[] = [];
      if (heatmap) {
        series.push(getHeatmapSeries(heatmap, 0));
      }
      for (const cartesian of cartSeries) {
        series.push({ ...cartesian, yAxisIndex: overlayYAxisIndex });
      }

      const overlayValueAxis = {
        ...(cartesianTimeDefaultOptions.yAxis as object),
        ...axisStyle,
        axisLabel: { ...axisStyle.axisLabel, formatter: valueFormatter },
      };
      const yAxis = heatmap
        ? [
            // Bucket (Y) axis for the heatmap cells.
            {
              ...(cartesianTimeDefaultOptions.yAxis as object),
              ...axisStyle,
              min: heatmap.yMin,
              max: heatmap.yMax,
            },
            // Metric axis for the cartesian overlay, on the right.
            { ...overlayValueAxis, position: 'right' },
          ]
        : overlayValueAxis;

      // Reserve room on the right for the vertical color scale when a heatmap is
      // present so the cells don't render under it.
      const baseGrid = getCartesianGrid(tableLegend ? undefined : options.legend) as Record<string, unknown>;
      const grid = heatmap
        ? { ...baseGrid, right: Number(baseGrid.right ?? 16) + HEATMAP_VISUALMAP_WIDTH }
        : baseGrid;

      // @todo fix types and remove assertions
      const echartOption: ECBasicOption = {
        ...cartesianTimeDefaultOptions,
        tooltip: tooltipOption,
        // Top-level axis pointer so the crosshair tracks the cursor in every
        // tooltip mode (e.g. "Single" uses an item trigger that wouldn't drive
        // the tooltip's own axis pointer). Suppressed when tooltips are hidden.
        axisPointer: tooltipMode === TooltipDisplayMode.None ? { show: false } : getCrosshairAxisPointer(),
        legend: tableLegend
          ? { show: false }
          : getLegendOption(options.legend, theme, heatmap ? cartSeries.map((s) => s.name) : undefined),
        grid,
        xAxis: { ...(cartesianTimeDefaultOptions.xAxis as object), ...axisStyle },
        yAxis,
        series,
        ...(heatmap ? { visualMap: getHeatmapVisualMap(heatmap, theme, 0, options.heatmapColorScheme) } : {}),
      };

      debug('Panel::setCartesianOption', LOG_LEVELS.debug, echartOption);

      panelRef.current.setOption(echartOption);
    } else if (radarSeriesTypes.includes(seriesType)) {
      // Radar uses its own coordinate system: the converter yields the axes
      // (indicator) and polygons (series data) separately, which we merge into
      // the static radar base option.
      const radar = radarToEChartsOption(data.series, theme);

      if (!radar) {
        debug('Panel::useEffect::useSetOptions::No usable radar data', LOG_LEVELS.error);
        return;
      }

      const echartOption: ECBasicOption = {
        ...radarDefaultOptions,
        tooltip: tooltipOption,
        legend: tableLegend
          ? { show: false }
          : getLegendOption(options.legend, theme, radar.data.map((polygon) => polygon.name)),
        radar: { indicator: radar.indicator },
        series: [{ type: seriesType, data: radar.data }],
      };

      debug('Panel::setRadarOption', LOG_LEVELS.debug, echartOption);

      panelRef.current.setOption(echartOption);
    } else if (pieSeriesTypes.includes(seriesType)) {
      // Pie has no axes: the converter yields slices (one per category) which we
      // drop into a single pie series on top of the static pie base option.
      const slices = pieToEChartsOption(data.series, theme);

      if (!slices) {
        debug('Panel::useEffect::useSetOptions::No usable pie data', LOG_LEVELS.error);
        return;
      }

      const echartOption: ECBasicOption = {
        ...pieDefaultOptions,
        tooltip: tooltipOption,
        legend: tableLegend
          ? { show: false }
          : getLegendOption(options.legend, theme, slices.map((slice) => slice.name)),
        series: [{ type: seriesType, data: slices }],
      };

      debug('Panel::setPieOption', LOG_LEVELS.debug, echartOption);

      panelRef.current.setOption(echartOption);
    } else {
      debug(`Unsupported series type: ${seriesType}`, LOG_LEVELS.error);
    }
  }, [
    seriesType,
    data,
    cartesianFrames,
    heatmapFrames,
    hasHeatmap,
    forceHeatmap,
    theme,
    timeZone,
    options.legend,
    options.heatmapColorScheme,
    tableLegend,
    formatValue,
    tooltipFormatter,
    tooltipKind,
    tooltipMode,
  ]);

  // useSetPanel: keep the ECharts canvas sized to the chart box (which shrinks
  // when the DOM legend table reserves space).
  useEffect(() => {
    if (!panelRef.current) {
      debug('Panel::useEffect::useSetPanel::No panelRef');
      return;
    }

    debug('Panel::useEffect::useSetPanel::resize()');
    panelRef.current.resize({ width: chartWidth, height: chartHeight });
  }, [chartWidth, chartHeight]);

  if (data.series.length === 0) {
    debug('Panel::Render::NoData');
    return <PanelDataErrorView fieldConfig={fieldConfig} panelId={id} data={data} needsStringField />;
  }

  debug('Panel::Render::Main');
  return (
    <div className={styles.wrapper}>
      <div ref={panelDOMRef} className={styles.panelContainer} style={{ width: chartWidth, height: chartHeight }}></div>
      {tooltipPortal}
      {tableLegend && (
        <LegendTable
          items={legendItems}
          placement={placement}
          width={legendWidth}
          height={legendHeight}
          limit={options.legend?.limit}
        />
      )}
    </div>
  );
};
