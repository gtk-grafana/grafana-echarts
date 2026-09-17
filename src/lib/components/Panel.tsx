import { LoadingState } from '@grafana/data';
import { PanelDataErrorView } from '@grafana/runtime';
import { debug, LOG_LEVELS } from 'development';
import { type InteractedRelationsView } from 'lib/echarts/relations/options/view';
import React, { useRef } from 'react';
import { PanelContent } from './PanelContent';
import { type PanelComponentProps } from './types';

const PanelComponent: React.FC<PanelComponentProps> = (props) => {
  const { data, fieldConfig, id } = props;
  const relationsViewRef = useRef<InteractedRelationsView>();

  if (data.state === LoadingState.Streaming) {
    return null;
  }

  debug('panelData series', LOG_LEVELS.debug, data.series);

  // Grafana queries can return frame schemas with no rows. These frames have no
  // chart data and use the same empty view as a response with no frames.
  if (data.series.length === 0 || data.series.every((frame) => frame.length === 0)) {
    debug('PanelDataErrorView', LOG_LEVELS.debug);
    return <PanelDataErrorView fieldConfig={fieldConfig} panelId={id} data={data} needsStringField />;
  }

  return <PanelContent {...props} relationsViewRef={relationsViewRef} />;
};

function panelPropsEqual(previous: PanelComponentProps, next: PanelComponentProps): boolean {
  if (previous.options.isPreview !== true || next.options.isPreview !== true) {
    return false;
  }

  return previewDataEqual(previous.data, next.data);
}

function previewDataEqual(previous: PanelComponentProps['data'], next: PanelComponentProps['data']): boolean {
  if (
    previous.state !== next.state ||
    hasQueryError(previous) !== hasQueryError(next) ||
    previous.series.length !== next.series.length
  ) {
    return false;
  }

  for (let frameIndex = 0; frameIndex < previous.series.length; frameIndex++) {
    const previousFrame = previous.series[frameIndex];
    const nextFrame = next.series[frameIndex];
    if (previousFrame.length !== nextFrame.length || previousFrame.fields.length !== nextFrame.fields.length) {
      return false;
    }

    for (let fieldIndex = 0; fieldIndex < previousFrame.fields.length; fieldIndex++) {
      const previousField = previousFrame.fields[fieldIndex];
      const nextField = nextFrame.fields[fieldIndex];
      if (
        previousField.name !== nextField.name ||
        previousField.type !== nextField.type ||
        previousField.labels !== nextField.labels ||
        previousField.values !== nextField.values
      ) {
        return false;
      }
    }
  }

  return true;
}

function hasQueryError(data: PanelComponentProps['data']): boolean {
  // Some Grafana responses still use the legacy singular error field.
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  return data.error != null || (data.errors?.length ?? 0) > 0;
}

export const Panel = React.memo(PanelComponent, panelPropsEqual);
