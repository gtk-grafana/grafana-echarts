// COPIED FROM core Grafana (packages/grafana-ui/src/components/VizTooltip).
// These modern unified tooltip pieces are not yet exported from @grafana/ui.
// Replace this folder with the official export when available; the props/API are
// kept identical to ease that swap.
// @todo switch to the official @grafana/ui export once it lands.
//
// Adaptations from core: trimmed to the data-links section the ECharts panel
// needs. `useStyles2`/`DataLinkButton` are imported from the public `@grafana/ui`
// entry. Ad-hoc filters, "filter by grouped labels" and annotations are dropped
// (they depend on uPlot/panel plumbing the ECharts bridge does not have).
import { css } from '@emotion/css';
import * as React from 'react';

import { type ActionModel, type Field, type GrafanaTheme2, type LinkModel } from '@grafana/data';
import { DataLinkButton, Stack, useStyles2 } from '@grafana/ui';

interface VizTooltipFooterProps {
  dataLinks: Array<LinkModel<Field>>;
  // @todo Actions have no public API at @grafana/* v13: `getActions` (which
  // builds runnable ActionModels from `field.config.actions`) and `ActionButton`
  // live in core app code, not in @grafana/data or @grafana/ui. Accept the prop
  // now so the call sites are stable, but rendering/execution is a no-op until a
  // public API lands (or we copy `getActions` + `ActionButton` here).
  actions?: Array<ActionModel<Field>>;
}

export const VizTooltipFooter = ({ dataLinks }: VizTooltipFooterProps) => {
  const styles = useStyles2(getStyles);

  if (dataLinks.length === 0) {
    return null;
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.footerSection}>
        <Stack direction="column" justifyContent="flex-start" gap={0.5}>
          {dataLinks.map((link, i) => (
            <DataLinkButton key={i} link={link} buttonProps={{ className: styles.dataLinkButton, fill: 'text' }} />
          ))}
        </Stack>
      </div>
    </div>
  );
};

const getStyles = (theme: GrafanaTheme2) => ({
  wrapper: css({
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    padding: theme.spacing(0),
  }),
  footerSection: css({
    borderTop: `1px solid ${theme.colors.border.medium}`,
    padding: theme.spacing(1),
  }),
  dataLinkButton: css({
    cursor: 'pointer',
    '&:hover': {
      textDecoration: 'underline',
      background: 'none',
    },
    padding: 0,
    height: 'auto',
    '& span': {
      whiteSpace: 'normal',
      textAlign: 'left',
    },
  }),
});
