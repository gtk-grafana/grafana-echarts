import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { LegendDisplayMode, VizLegendOptions } from '@grafana/schema';
import { useStyles2, VizLegend, VizLegendItem } from '@grafana/ui';
import React, { useState } from 'react';

interface Props {
  items: VizLegendItem[];
  legend: VizLegendOptions;
  /** Reserved box the legend renders into (scrolls when it overflows). */
  width: number;
  height: number;
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
    scrollbarWidth: 'thin',
  }),
});

/**
 * Grafana DOM legend rendered as a sibling element next to the chart.
 * Delegates to Core Grafana's `VizLegend` for list and table display modes.
 *
 * Sort state is kept locally so clicking a calc column header reorders the rows,
 * matching the time series panel's legend behavior.
 */
export const Legend: React.FC<Props> = ({ items, legend, width, height }) => {
  const styles = useStyles2(getStyles, width, height);
  const [sortKey, setSortKey] = useState<string | undefined>(legend.sortBy);
  const [sortDesc, setSortDesc] = useState(legend.sortDesc ?? false);

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

  const displayMode = legend.displayMode ?? LegendDisplayMode.List;
  const isTable = displayMode === LegendDisplayMode.Table;

  return (
    <div className={styles.container}>
      <VizLegend
        displayMode={displayMode}
        placement={legend.placement}
        items={items}
        sortBy={sortKey}
        sortDesc={sortDesc}
        isSortable={isTable}
        onToggleSort={onToggleSort}
        limit={legend.limit}
      />
    </div>
  );
};
