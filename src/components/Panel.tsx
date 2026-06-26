import { css } from '@emotion/css';
import { Field, FieldType, GrafanaTheme2, PanelProps } from '@grafana/data';
import { PanelDataErrorView } from '@grafana/runtime';
import { useStyles2, useTheme2 } from '@grafana/ui';
import { debug, LOG_LEVELS } from 'development';

import { EChartsType, init } from 'echarts';
import { pieToEChartsOption } from 'echarts/converters/pie';
import { radarToEChartsOption } from 'echarts/converters/radar';
import { timeSeriesToEChartsOption } from 'echarts/converters/timeSeries';
import { cartesianTimeDefaultOptions, getCartesianAxisStyle } from 'echarts/options/cartesian';
import { getCartesianGrid, getLegendOption } from 'echarts/options/legend';
import { pieDefaultOptions } from 'echarts/options/pie';
import { radarDefaultOptions } from 'echarts/options/radar';
import { getValueFormatter, ValueFormatter } from 'echarts/style';
import { ECBasicOption } from 'echarts/types/dist/shared';
import { cartesianTimeSeriesTypes, pieSeriesTypes, radarSeriesTypes, seriesTypePath } from 'editor/series';
import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { PanelOptions } from 'types';

interface Props extends PanelProps<PanelOptions> {}

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

const getStyles = (theme: GrafanaTheme2, height: number, width: number) => {
  return {
    wrapper: css`
      position: relative;
    `,
    panelContainer: css({
      height,
      width,
    }),
  };
};

export const Panel: React.FC<Props> = ({ options, data, width, height, fieldConfig, id, timeZone }) => {
  const styles = useStyles2(getStyles, height, width);
  const theme = useTheme2();
  const panelDOMRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<EChartsType | null>(null);
  const seriesType = options[seriesTypePath];

  useLayoutEffect(() => {
    debug('Panel::useLayoutEffect');
    if (!panelDOMRef.current) {
      debug('Panel::useLayoutEffect::Failed to init panel', LOG_LEVELS.error);
      return;
    }
    panelRef.current = init(panelDOMRef.current);
  }, []);

  // useSetOptions
  useEffect(() => {
    if (!panelRef.current) {
      debug('Panel::useEffect::useSetOptions::No panelRef');
      return;
    }

    panelRef.current.clear();

    const formatValue = getRepresentativeFormatter(data.series, theme, timeZone);
    const valueFormatter = (value: unknown) => formatValue(typeof value === 'number' ? value : null);

    // @todo look into adding "auto" series type inferred from data frame
    // @todo look into setting series type using field overrides
    if (cartesianTimeSeriesTypes.includes(seriesType)) {
      const series = timeSeriesToEChartsOption(data.series, seriesType, theme);

      if (!series) {
        debug('Panel::useEffect::useSetOptions::No usable time series in data', LOG_LEVELS.error);
        return;
      }

      const axisStyle = getCartesianAxisStyle(theme);

      // @todo fix types and remove assertions
      const echartOption: ECBasicOption = {
        ...cartesianTimeDefaultOptions,
        tooltip: { ...(cartesianTimeDefaultOptions.tooltip as object), valueFormatter },
        legend: getLegendOption(options.legend, theme),
        grid: getCartesianGrid(options.legend),
        xAxis: { ...(cartesianTimeDefaultOptions.xAxis as object), ...axisStyle },
        yAxis: {
          ...(cartesianTimeDefaultOptions.yAxis as object),
          ...axisStyle,
          axisLabel: { ...axisStyle.axisLabel, formatter: valueFormatter },
        },
        series,
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
        tooltip: { valueFormatter },
        legend: getLegendOption(options.legend, theme, radar.data.map((polygon) => polygon.name)),
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
        tooltip: { valueFormatter },
        legend: getLegendOption(options.legend, theme, slices.map((slice) => slice.name)),
        series: [{ type: seriesType, data: slices }],
      };

      debug('Panel::setPieOption', LOG_LEVELS.debug, echartOption);

      panelRef.current.setOption(echartOption);
    } else {
      debug(`Unsupported series type: ${seriesType}`, LOG_LEVELS.error);
    }
  }, [seriesType, data, theme, timeZone, options.legend]);

  // useSetPanel
  useEffect(() => {
    if (!panelRef.current) {
      debug('Panel::useEffect::useSetPanel::No panelRef');
      return;
    }

    debug('Panel::useEffect::useSetPanel::resize()');
    panelRef.current.resize();
  }, [height, width]);

  if (data.series.length === 0) {
    debug('Panel::Render::NoData');
    return <PanelDataErrorView fieldConfig={fieldConfig} panelId={id} data={data} needsStringField />;
  }

  debug('Panel::Render::Main');
  return (
    <div className={styles.wrapper}>
      <div ref={panelDOMRef} className={styles.panelContainer}></div>
    </div>
  );
};
