// COPIED FROM core Grafana (packages/grafana-ui/src/components/VizTooltip).
// These modern unified tooltip pieces are not yet exported from @grafana/ui.
// Replace this folder with the official export when available; the props/API are
// kept identical to ease that swap.
// @todo switch to the official @grafana/ui export once it lands.
//
// Adaptations from core: `useStyles2`/`SeriesIcon` are imported from the public
// `@grafana/ui` entry instead of relative paths.
import { css, cx } from '@emotion/css';
import * as React from 'react';

import { FALLBACK_COLOR, type GrafanaTheme2 } from '@grafana/data';
import { type LineStyle } from '@grafana/schema';
import { SeriesIcon, useStyles2 } from '@grafana/ui';

import { ColorIndicator, DEFAULT_COLOR_INDICATOR } from './types';
import { getColorIndicatorClass } from './utils';

export enum ColorIndicatorPosition {
  Leading,
  Trailing,
}

interface Props {
  color?: string;
  colorIndicator?: ColorIndicator;
  position?: ColorIndicatorPosition;
  lineStyle?: LineStyle;
  isHollow?: boolean;
}

export type ColorIndicatorStyles = ReturnType<typeof getStyles>;

export const VizTooltipColorIndicator = ({
  color = FALLBACK_COLOR,
  colorIndicator = DEFAULT_COLOR_INDICATOR,
  position = ColorIndicatorPosition.Leading,
  lineStyle,
  isHollow,
}: Props) => {
  const styles = useStyles2(getStyles);

  if (colorIndicator === ColorIndicator.series && !isHollow) {
    return (
      <SeriesIcon
        color={color}
        lineStyle={lineStyle}
        className={cx(
          position === ColorIndicatorPosition.Leading ? styles.leading : styles.trailing,
          styles.seriesIndicator
        )}
      />
    );
  }

  return (
    <div
      style={isHollow ? { border: `1px solid ${color}` } : { backgroundColor: color }}
      className={cx(
        position === ColorIndicatorPosition.Leading ? styles.leading : styles.trailing,
        getColorIndicatorClass(colorIndicator, styles)
      )}
    />
  );
};

// @TODO Update classes/add svgs
const getStyles = (theme: GrafanaTheme2) => ({
  leading: css({
    marginRight: theme.spacing(0.5),
  }),
  trailing: css({
    marginLeft: theme.spacing(0.5),
  }),
  seriesIndicator: css({
    position: 'relative',
    top: -2, // half the height of the color indicator, since the top is aligned with flex center.
  }),
  series: css({
    width: '14px',
    height: '4px',
    borderRadius: theme.shape.radius.pill,
    minWidth: '14px',
  }),
  value: css({
    width: '12px',
    height: '12px',
    borderRadius: theme.shape.radius.default,
    fontWeight: 500,
    minWidth: '12px',
  }),
  hexagon: css({}),
  pie_1_4: css({}),
  pie_2_4: css({}),
  pie_3_4: css({}),
  marker_sm: css({
    width: '4px',
    height: '4px',
    borderRadius: theme.shape.radius.circle,
    minWidth: '4px',
  }),
  marker_md: css({
    width: '8px',
    height: '8px',
    borderRadius: theme.shape.radius.circle,
    minWidth: '8px',
  }),
  marker_lg: css({
    width: '12px',
    height: '12px',
    borderRadius: theme.shape.radius.circle,
    minWidth: '12px',
  }),
});
