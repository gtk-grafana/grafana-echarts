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
import { type CSSProperties, type ReactNode } from 'react';

import { type GrafanaTheme2 } from '@grafana/data';
import { useStyles2 } from '@grafana/ui';

import { VizTooltipRow } from './VizTooltipRow';
import { type VizTooltipItem } from './types';

interface VizTooltipContentProps {
  items: VizTooltipItem[];
  children?: ReactNode;
  scrollable?: boolean;
  isPinned: boolean;
  maxHeight?: number;
}

export const VizTooltipContent = ({
  items,
  children,
  isPinned,
  scrollable = false,
  maxHeight,
}: VizTooltipContentProps) => {
  const styles = useStyles2(getStyles);

  const scrollableStyle: CSSProperties = scrollable
    ? {
        maxHeight: maxHeight,
        overflowY: 'auto',
      }
    : {};

  return (
    <div className={styles.wrapper} style={scrollableStyle}>
      {items.map(({ label, value, color, colorIndicator, colorPlacement, isActive, lineStyle, isHiddenFromViz }, i) => (
        <VizTooltipRow
          key={i}
          label={label}
          value={value}
          color={color}
          colorIndicator={colorIndicator}
          colorPlacement={colorPlacement}
          isActive={isActive}
          isPinned={isPinned}
          lineStyle={lineStyle}
          showValueScroll={!scrollable}
          isHiddenFromViz={isHiddenFromViz}
        />
      ))}
      {children}
    </div>
  );
};

const getStyles = (theme: GrafanaTheme2) => ({
  wrapper: css({
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    gap: 2,
    borderTop: `1px solid ${theme.colors.border.weak}`,
    padding: theme.spacing(1),
  }),
});
