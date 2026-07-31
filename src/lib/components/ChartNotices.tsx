import { css } from '@emotion/css';
import { type GrafanaTheme2 } from '@grafana/data';
import { Icon, Tooltip, useStyles2 } from '@grafana/ui';
import { type ChartNotice } from 'lib/echarts/charts/types';
import React from 'react';

interface Props {
  notices: ChartNotice[];
}

/**
 * Panel-corner advisories for renders where the chart had to change the user's
 * data to draw it (today: the sankey cycle policy — see
 * `relationsChartModule.getNotices`).
 *
 * Mirrors what core's `PanelHeaderNotices` looks like — a hoverable severity icon,
 * not body text — because Grafana's real panel-chrome notice slot is not reachable
 * from a panel plugin: `PanelNoticesRenderer` builds it from
 * `sceneGraph.getData(model).useState()`, i.e. `DataFrame.meta.notices` on the
 * scene's data object, which the panel is handed read-only. Writing there would
 * mean mutating a prop and would not re-render the chrome anyway. So the badge is
 * rendered by the panel, pinned to the top-right of the viz area, and reads the
 * same as a chrome notice.
 */
export const ChartNotices: React.FC<Props> = ({ notices }) => {
  const styles = useStyles2(getStyles);

  if (notices.length === 0) {
    return null;
  }

  return (
    <div className={styles.wrapper}>
      {notices.map((notice) => (
        <Tooltip key={`${notice.severity}:${notice.text}`} content={notice.text} theme="info">
          {/* `tabIndex` so the notice is reachable (and its tooltip openable) by keyboard. */}
          <span className={styles.item} tabIndex={0} role="note" aria-label={notice.text}>
            <Icon
              name={notice.severity === 'warning' ? 'exclamation-triangle' : 'info-circle'}
              size="sm"
              className={notice.severity === 'warning' ? styles.warning : styles.info}
            />
          </span>
        </Tooltip>
      ))}
    </div>
  );
};

const getStyles = (theme: GrafanaTheme2) => ({
  // Absolute so the badge overlays the chart rather than taking layout from it —
  // the panel body is sized by VizLayout and any reserved strip would shrink the
  // plot. `pointer-events: none` on the strip keeps chart hover working around
  // the icons, which re-enable it for themselves.
  wrapper: css({
    position: 'absolute',
    top: theme.spacing(0.5),
    right: theme.spacing(0.5),
    display: 'flex',
    gap: theme.spacing(0.5),
    pointerEvents: 'none',
    zIndex: 1,
  }),
  item: css({
    pointerEvents: 'auto',
    display: 'inline-flex',
    cursor: 'help',
  }),
  warning: css({
    color: theme.colors.warning.text,
  }),
  info: css({
    color: theme.colors.info.text,
  }),
});
