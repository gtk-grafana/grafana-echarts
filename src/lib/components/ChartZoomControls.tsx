import { css } from '@emotion/css';
import { type GrafanaTheme2 } from '@grafana/data';
import { IconButton, useStyles2 } from '@grafana/ui';
import { type ChartZoomAction } from 'lib/echarts/charts/types';
import { type EChartsType } from 'lib/echarts/echarts';
import React, { type MutableRefObject, useCallback } from 'react';

interface Props {
  action: ChartZoomAction | undefined;
  /** The live ECharts instance; `null` before mount and after dispose. */
  chartRef: MutableRefObject<EChartsType | null>;
  /** Viz area size, so a zoom is anchored at its centre rather than at the origin. */
  width: number;
  height: number;
}

/** One click's scale factor. Two clicks in ≈ 1.7x, which is a readable step. */
const ZOOM_STEP = 1.3;

/**
 * Zoom in / out / reset buttons pinned to the viz area's corner, for the families whose
 * series sits on a `View` coordinate system (relations' graph and sankey — see
 * `ChartModule.getZoomAction`).
 *
 * **Buttons rather than the scroll wheel**, which is the whole reason this exists.
 * ECharts' own zoom is `roam`, and `roam` binds the wheel; a panel that captures the
 * wheel is a panel the dashboard cannot be scrolled past, so the user zooms the graph
 * by accident every time they scroll the page and can never scroll away from it. The
 * roam *action* has no such coupling — it is registered by `registerRoamActionSimply`
 * and resolves the view coordinate system directly (`getOwnRoamViewCoordSys`), so it
 * works with `roam: false`. Panning still uses `roam: 'move'`, which binds drag, not
 * the wheel.
 *
 * https://echarts.apache.org/en/api.html#action.graphRoam
 */
export const ChartZoomControls: React.FC<Props> = ({ action, chartRef, width, height }) => {
  const styles = useStyles2(getStyles);

  const zoom = useCallback(
    (scale: number) => {
      const chart = chartRef.current;
      if (!chart || !action) {
        return;
      }
      // Anchored at the viz centre: `originX`/`originY` are the fixed point of the
      // scale, and the centre is what a button (unlike a wheel) has no pointer for.
      chart.dispatchAction({
        type: action.type,
        seriesIndex: action.seriesIndex,
        zoom: scale,
        originX: width / 2,
        originY: height / 2,
      });
    },
    [action, chartRef, width, height]
  );

  const reset = useCallback(() => {
    const chart = chartRef.current;
    if (!chart || !action) {
      return;
    }
    // Both keys, and by `setOption` rather than by another action: the roam action
    // applies a *delta*, so undoing it would mean tracking every zoom and drag since
    // the last rebuild, including the drags this component never saw. `center`/`zoom`
    // are where the view's state is actually kept — the action handler syncs them back
    // onto the series model (`syncBackRoamOptionToRoamHostModel`) — so writing the
    // identity there is the reset. `center: null` is ECharts' own "no override".
    chart.setOption({ series: [{ zoom: 1, center: null }] });
  }, [action, chartRef]);

  if (!action) {
    return null;
  }

  return (
    <div className={styles.wrapper}>
      <IconButton name="search-plus" size="sm" tooltip="Zoom in" onClick={() => zoom(ZOOM_STEP)} />
      <IconButton name="search-minus" size="sm" tooltip="Zoom out" onClick={() => zoom(1 / ZOOM_STEP)} />
      <IconButton name="compress-arrows" size="sm" tooltip="Reset zoom" onClick={reset} />
    </div>
  );
};

const getStyles = (theme: GrafanaTheme2) => ({
  // Absolute, like `ChartNotices`: the panel body is sized by VizLayout and a reserved
  // strip would shrink the plot. Bottom-right rather than top-right so the two do not
  // collide — a sankey's dropped-link notice is pinned to the top corner.
  wrapper: css({
    position: 'absolute',
    bottom: theme.spacing(0.5),
    right: theme.spacing(0.5),
    display: 'flex',
    gap: theme.spacing(0.25),
    zIndex: 1,
  }),
});
