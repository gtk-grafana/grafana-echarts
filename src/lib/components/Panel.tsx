// Redirect shared async-chunk loading to the app plugin's base URL. Side-effect
// import; must run before the dynamic import() of ECharts below.
import 'lib/publicPath';
import { css } from '@emotion/css';
import { type DataFrame, type Field, FieldType, type GrafanaTheme2, type PanelProps } from '@grafana/data';
import { PanelDataErrorView } from '@grafana/runtime';
import { LegendDisplayMode, type LegendPlacement, TooltipDisplayMode } from '@grafana/schema';
import { PanelContextProvider, type SeriesVisibilityChangeMode, usePanelContext, useStyles2, useTheme2 } from '@grafana/ui';
import { debug, LOG_LEVELS } from 'development';
import { seriesTypePath } from 'editor/constants';
import { type EChartsType } from 'lib/echarts/echarts';
import { panelTypeToAxis } from 'lib/echarts/axes/converters';
import { resolveChartModule } from 'lib/echarts/charts/registry';
import { type ChartContext } from 'lib/echarts/charts/types';
import { getPanelLayout } from 'lib/echarts/layout/layout';
import { isLegendVisible, resolveLegendOptions } from 'lib/echarts/options/legend';
import { getValueFormatter, type ValueFormatter } from 'lib/echarts/style';
import {
  getCrosshairAxisPointer,
  getNoTooltipOption,
  getTooltipOption,
  grafanaTooltipModeToEChartsTrigger,
} from 'lib/echarts/tooltip';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { type PanelOptions } from 'types';
import { Legend } from './Legend';

interface Props extends PanelProps<PanelOptions> {}

const getRepresentativeFormatter = (series: DataFrame[], theme: GrafanaTheme2, timeZone: string): ValueFormatter => {
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
  const panelContext = usePanelContext();
  const panelDOMRef = useRef<HTMLDivElement>(null);
  // ECharts is loaded lazily (dynamic import below), so the chart instance lives
  // in state: dependent effects re-run once it resolves.
  const [chart, setChart] = useState<EChartsType | null>(null);
  const seriesType = options[seriesTypePath];

  const chartModule = useMemo(() => resolveChartModule(seriesType, data.series), [seriesType, data.series]);

  const resolvedLegend = useMemo(
    () => (chartModule ? resolveLegendOptions(chartModule, options) : undefined),
    [chartModule, options]
  );

  const isVizLegend = Boolean(resolvedLegend && isLegendVisible(resolvedLegend) && chartModule?.buildLegendItems);

  const formatValue = useMemo(
    () => getRepresentativeFormatter(data.series, theme, timeZone),
    [data.series, theme, timeZone]
  );

  const chartContext: ChartContext = useMemo(
    () => ({
      frames: data.series,
      theme,
      timeZone,
      options,
      seriesType,
      formatValue,
    }),
    [data.series, theme, timeZone, options, seriesType, formatValue]
  );

  const placement: LegendPlacement = resolvedLegend?.placement === 'right' ? 'right' : 'bottom';
  const { chartWidth, chartHeight, legendWidth, legendHeight } = getPanelLayout(
    width,
    height,
    resolvedLegend ?? { showLegend: false, displayMode: LegendDisplayMode.Hidden, placement: 'bottom', calcs: [] },
    isVizLegend
  );
  const styles = useStyles2(getStyles, height, width, placement);

  const legendItems = useMemo(() => {
    if (!isVizLegend || !chartModule?.buildLegendItems || !resolvedLegend) {
      return [];
    }
    return chartModule.buildLegendItems(chartContext, resolvedLegend.calcs ?? []);
  }, [isVizLegend, chartModule, chartContext, resolvedLegend]);

  const tooltipMode = options.tooltip?.mode ?? TooltipDisplayMode.Single;

  const onSeriesColorChange = useCallback((_label: string, _color: string) => {
    // @todo requires fieldConfig override write-back (PanelContext not available to community panels)
  }, []);

  const onToggleSeriesVisibility = useCallback(
    (_label: string | string[] | null, _mode: SeriesVisibilityChangeMode) => {
      // @todo requires series visibility state
    },
    []
  );

  const legendContextValue = useMemo(
    () => ({
      ...panelContext,
      eventBus,
      onSeriesColorChange,
      onToggleSeriesVisibility,
    }),
    [panelContext, eventBus, onSeriesColorChange, onToggleSeriesVisibility]
  );

  useLayoutEffect(() => {
    const dom = panelDOMRef.current;
    if (!dom) {
      return;
    }

    let instance: EChartsType | null = null;
    let disposed = false;

    // Load ECharts on demand so its (~0.6MB) bundle is emitted as a single
    // shared async chunk across the nested panels instead of being duplicated
    // into every panel entry. See lib/echarts/echarts.ts.
    void import('lib/echarts/echarts').then(({ init }) => {
      if (disposed) {
        return;
      }
      instance = init(dom);
      setChart(instance);
    });

    return () => {
      disposed = true;
      instance?.dispose();
      instance = null;
      setChart(null);
    };
  }, []);

  useEffect(() => {
    if (!chart || !chartModule) {
      return;
    }

    chart.clear();

    const axisType = panelTypeToAxis(seriesType);
    const tooltipOption = getTooltipOption(
      grafanaTooltipModeToEChartsTrigger(axisType, tooltipMode),
      tooltipMode,
      formatValue,
      theme,
    );

    const echartOption = chartModule.buildOption(chartContext, { isGrafanaLegend: isVizLegend });

    if (!echartOption) {
      debug('No echart option', LOG_LEVELS.error, chartContext);
      throw new Error('No echart option!');
    }

    // Only cartesian-grid charts (non-category axes) have an axis to draw the crosshair on.
    // @todo clean up nested ternary
    const axisPointer =
      axisType !== 'category'
        ? tooltipMode === TooltipDisplayMode.None
          ? getNoTooltipOption()
          : getCrosshairAxisPointer()
        : undefined;

    chart.setOption({
      ...echartOption,
      tooltip: tooltipOption,
      ...(axisPointer ? { axisPointer } : {}),
    });
  }, [chart, chartModule, chartContext, isVizLegend, formatValue, seriesType, tooltipMode, theme]);

  useEffect(() => {
    if (!chart) {
      return;
    }
    chart.resize({ width: chartWidth, height: chartHeight });
  }, [chart, chartWidth, chartHeight]);

  if (data.series.length === 0) {
    return <PanelDataErrorView fieldConfig={fieldConfig} panelId={id} data={data} needsStringField />;
  }

  return (
    <div className={styles.wrapper}>
      <div ref={panelDOMRef} className={styles.panelContainer} style={{ width: chartWidth, height: chartHeight }}></div>
      {isVizLegend && resolvedLegend && (
        <PanelContextProvider value={legendContextValue}>
          <Legend items={legendItems} legend={resolvedLegend} width={legendWidth} height={legendHeight} />
        </PanelContextProvider>
      )}
    </div>
  );
};
