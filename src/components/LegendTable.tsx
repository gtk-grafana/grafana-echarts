import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { LegendDisplayMode, LegendPlacement } from '@grafana/schema';
import { useStyles2, VizLegend, VizLegendItem } from '@grafana/ui';
import React, { useState } from 'react';

interface Props {
  items: VizLegendItem[];
  placement: LegendPlacement;
  /** Reserved box the table renders into (scrolls when it overflows). */
  width: number;
  height: number;
  /**
   * Max rows to show before collapsing behind a "show all" toggle (Core's
   * `legend.limit`). `VizLegend` applies this after sorting, so it acts as a
   * top-N when a calc column is sorted. `0`/undefined means show everything.
   */
  limit?: number;
}

const getStyles = (theme: GrafanaTheme2, width: number, height: number) => ({
  container: css({
    width,
    height,
    overflow: 'auto',
    // Match Grafana's gap between the viz and its legend.
    padding: theme.spacing(0.5, 1, 0, 1),
    display: 'flex',
    flex: '1 1 0%',
    flexDirection: 'column',
    scrollbarWidth: 'thin'
  }),
});

/**
 * PoC custom DOM legend: ECharts' native legend only renders a list, so the
 * `table` display mode (with per-series calc columns) is delegated to Core
 * Grafana's `VizLegend`, rendered as a sibling DOM element next to the chart.
 *
 * Sort state is kept locally so clicking a calc column header reorders the rows,
 * matching the time series panel's legend behavior.
 */
export const LegendTable: React.FC<Props> = ({ items, placement, width, height, limit }) => {
  const styles = useStyles2(getStyles, width, height);
  const [sortKey, setSortKey] = useState<string | undefined>(undefined);
  const [sortDesc, setSortDesc] = useState(false);

  const onToggleSort = (key: string) => {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDesc(false);
      return;
    }

    // Cycle: asc -> desc -> unsorted.
    if (!sortDesc) {
      setSortDesc(true);
      return;
    }

    setSortKey(undefined);
    setSortDesc(false);
  };

  return (
    <div className={styles.container}>
      <VizLegend
        displayMode={LegendDisplayMode.Table}
        placement={placement}
        items={items}
        sortBy={sortKey}
        sortDesc={sortDesc}
        isSortable={true}
        onToggleSort={onToggleSort}
        limit={limit}
        readonly={true}
      />
    </div>
  );
};
