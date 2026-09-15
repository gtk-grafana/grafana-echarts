import { PanelDataErrorView } from '@grafana/runtime';
import { debug, LOG_LEVELS } from 'development';
import React from 'react';
import { PanelContent } from './PanelContent';
import { type PanelComponentProps } from './types';

export const Panel: React.FC<PanelComponentProps> = (props) => {
  const { data, fieldConfig, id } = props;
  debug('panelData series', LOG_LEVELS.debug, data.series);

  // Grafana queries can return frame schemas with no rows. These frames have no
  // chart data and use the same empty view as a response with no frames.
  if (data.series.length === 0 || data.series.every((frame) => frame.length === 0)) {
    debug('PanelDataErrorView', LOG_LEVELS.debug);
    return <PanelDataErrorView fieldConfig={fieldConfig} panelId={id} data={data} needsStringField />;
  }

  return <PanelContent {...props} />;
};
