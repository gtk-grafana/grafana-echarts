import { css } from '@emotion/css';
import { PanelProps } from '@grafana/data';
import { PanelDataErrorView } from '@grafana/runtime';
import { useStyles2 } from '@grafana/ui';
import React from 'react';
import { testId } from 'test/ids';
import { PanelOptions } from 'types';

interface Props extends PanelProps<PanelOptions> {}

const getStyles = () => {
  return {
    wrapper: css`
      position: relative;
    `,
  };
};

export const SimplePanel: React.FC<Props> = ({ options, data, width, height, fieldConfig, id }) => {
  // const theme = useTheme2();
  const styles = useStyles2(getStyles);

  if (data.series.length === 0) {
    return <PanelDataErrorView fieldConfig={fieldConfig} panelId={id} data={data} needsStringField />;
  }

  return (
    <div className={styles.wrapper}>
      {options.seriesType && <div data-testid={testId.seriesType}>Series type {options.seriesType}</div>}
    </div>
  );
};
