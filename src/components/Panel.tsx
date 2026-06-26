import { css } from '@emotion/css';
import { GrafanaTheme2, PanelProps } from '@grafana/data';
import { PanelDataErrorView } from '@grafana/runtime';
import { useStyles2 } from '@grafana/ui';
import { debug, LOG_LEVELS } from 'development';

import { EChartsType, init } from 'echarts';
import { radarToEChartsOption } from 'echarts/converters/radar';
import { timeSeriesToEChartsOption } from 'echarts/converters/timeSeries';
import { cartesianTimeDefaultOptions } from 'echarts/options/cartesian';
import { radarDefaultOptions } from 'echarts/options/radar';
import { ECBasicOption } from 'echarts/types/dist/shared';
import { cartesianTimeSeriesTypes, radarSeriesTypes, seriesTypePath } from 'editor/series';
import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { PanelOptions } from 'types';

interface Props extends PanelProps<PanelOptions> {}

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

export const Panel: React.FC<Props> = ({ options, data, width, height, fieldConfig, id }) => {
  const styles = useStyles2(getStyles, height, width);
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

    // @todo look into adding "auto" series type inferred from data frame
    // @todo look into setting series type using field overrides
    if (cartesianTimeSeriesTypes.includes(seriesType)) {
      const series = timeSeriesToEChartsOption(data.series, seriesType);

      if (!series) {
        debug('Panel::useEffect::useSetOptions::No usable time series in data', LOG_LEVELS.error);
        return;
      }

      const echartOption: ECBasicOption = {
        ...cartesianTimeDefaultOptions,
        series,
      };

      debug('Panel::setCartesianOption', LOG_LEVELS.debug, echartOption);

      panelRef.current.setOption(echartOption);
    } else if (radarSeriesTypes.includes(seriesType)) {
      // Radar uses its own coordinate system: the converter yields the axes
      // (indicator) and polygons (series data) separately, which we merge into
      // the static radar base option.
      const radar = radarToEChartsOption(data.series);

      if (!radar) {
        debug('Panel::useEffect::useSetOptions::No usable radar data', LOG_LEVELS.error);
        return;
      }

      const echartOption: ECBasicOption = {
        ...radarDefaultOptions,
        radar: { indicator: radar.indicator },
        series: [{ type: 'radar', data: radar.data }],
      };

      debug('Panel::setRadarOption', LOG_LEVELS.debug, echartOption);

      panelRef.current.setOption(echartOption);
    } else {
      debug(`Unsupported series type: ${seriesType}`, LOG_LEVELS.error);
    }
  }, [seriesType, data]);

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
