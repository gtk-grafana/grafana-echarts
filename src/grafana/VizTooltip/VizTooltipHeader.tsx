// COPIED FROM core Grafana (packages/grafana-ui/src/components/VizTooltip).
// These modern unified tooltip pieces are not yet exported from @grafana/ui.
// Replace this folder with the official export when available; the props/API are
// kept identical to ease that swap.
// @todo switch to the official @grafana/ui export once it lands.
//
// Adaptations from core: `useStyles2` is imported from the public `@grafana/ui`
// entry instead of a relative path.
import { css } from '@emotion/css';
import * as React from 'react';

import { type GrafanaTheme2 } from '@grafana/data';
import { useStyles2 } from '@grafana/ui';

import { VizTooltipRow } from './VizTooltipRow';
import { type VizTooltipItem } from './types';

interface Props {
  item: VizTooltipItem;
  isPinned: boolean;
}

export const VizTooltipHeader = ({ item: { label, value, color, colorIndicator }, isPinned }: Props) => {
  const styles = useStyles2(getStyles);
  return (
    <div className={styles}>
      <VizTooltipRow
        label={label}
        value={value}
        color={color}
        colorIndicator={colorIndicator}
        marginRight={'22px'}
        isPinned={isPinned}
      />
    </div>
  );
};

const getStyles = (theme: GrafanaTheme2) =>
  css({
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    padding: theme.spacing(1),
    lineHeight: 1,
  });
