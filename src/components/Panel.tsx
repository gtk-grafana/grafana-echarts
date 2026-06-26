import { css } from '@emotion/css';
import { FieldType, GrafanaTheme2, PanelProps } from '@grafana/data';
import { PanelDataErrorView } from '@grafana/runtime';
import { useStyles2 } from '@grafana/ui';
import { debug, LOG_LEVELS } from 'development';

import { EChartsType, init } from 'echarts';
import { ECBasicOption } from 'echarts/types/dist/shared';
import { seriesTypePath } from 'editor/series';
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
    // @todo refactor: build xAxis, yAxis, series etc separately since many different panel types will have similar
    if (seriesType === 'line') {
      // @todo convert to for
      data.series.forEach((frame) => {
        const timeAxis = frame.fields.find((field) => field.type === FieldType.time);
        const numericAxes = frame.fields.filter((field) => field.type === FieldType.number);

        if(!timeAxis){
          console.error('Line graph requires 1 numeric time axis')
          return;
        }
        if(numericAxes.length < 1){
          console.error('Line graph requires 1 numeric time axis');
          return;
        }

        const timeDimension = timeAxis.name;
        const valueDimensions = numericAxes.map((field) => field.name);

        // setLineOption
        const echartOption: ECBasicOption = {
          animationDuration: 300,

          // https://echarts.apache.org/en/option.html#grid
          grid: {
            top: 'top',
            left: 'left',
            // right: 'right',
            bottom: '5%',
          },

          tooltip: {
            show: true,
            trigger: 'axis',
          },

          // https://echarts.apache.org/en/tutorial.html#dataset
          dataset: {
            dimensions: [timeDimension, ...valueDimensions],
            source: {
              [timeDimension]: Array.from({ length: frame.length }, (_, i) => timeAxis.values[i]),
              ...Object.fromEntries(
                numericAxes.map((field) => [
                  field.name,
                  Array.from({ length: frame.length }, (_, i) => field.values[i]),
                ])
              ),
            },
          },

          // https://echarts.apache.org/en/option.html#xAxis
          xAxis: {
            // https://echarts.apache.org/en/option.html#xAxis.type
            type: 'time',
            // https://echarts.apache.org/en/option.html#xAxis.name
            name: timeDimension,
            // https://echarts.apache.org/en/option.html#xAxis.tooltip
            tooltip: {
              show: true,
            },
            // https://echarts.apache.org/en/option.html#xAxis.alignTicks
            alignTicks: true,
          },
          // https://echarts.apache.org/en/option.html#yAxis
          yAxis: {
            // https://echarts.apache.org/en/option.html#yAxis.type
            type: 'value',
          },

          // https://echarts.apache.org/en/option.html#series
          series: numericAxes.map((field) => ({
            name: field.name,
            type: seriesType,
            encode: {
              x: timeDimension,
              y: field.name,
            },
          })),
        };

        debug('Panel::setLineOption', LOG_LEVELS.debug, echartOption);

        panelRef.current.setOption(echartOption);
      });
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
