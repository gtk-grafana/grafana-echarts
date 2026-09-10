import { css } from '@emotion/css';
import { dateTimeFormat, type GrafanaTheme2 } from '@grafana/data';
import { type TimeZone } from '@grafana/schema';
import { IconButton, Slider, useStyles2 } from '@grafana/ui';
import React from 'react';
import { stopsPerStep } from 'lib/echarts/options/timeline';
import { useTimelinePlayback, resolveTimelineIndex } from './hooks/useTimelinePlayback';

interface Props {
  /**
   * The stops this render can be read at, ascending — `ChartModule.getTimeline`. `null`
   * draws nothing, which is every family but relations and every instant response.
   */
  timeline: number[] | null;
  /** The selected stop. `null` before the user has picked one, which reads as the newest. */
  selected: number | null;
  onSelect: (at: number) => void;
  /** The panel's time zone, so the readout matches its axes and its tooltips. */
  timeZone: TimeZone;
  /** Wall-clock milliseconds per step while playing. */
  stepDuration: number;
  /** How far a step moves, as a percentage of the timeline. See `stopsPerStep`. */
  stepSize: number;
}

/**
 * The height the strip reserves, in px. Read by `Panel` to shrink the plot by exactly
 * this much: `EChart` is given an explicit pixel height, which it pushes into ECharts,
 * so the two boxes cannot be left to a flex solver.
 */
export const TIME_SLIDER_HEIGHT = 32;

/**
 * Step the panel through the timestamps its data carries, instead of reducing them away.
 *
 * Shown when the family says this render has a timeline (`ChartModule.getTimeline`) —
 * today only relations, and only with its "Time slider" option on against ranged data.
 * The selection is a **timestamp** rather than a slider index, because two frames of a
 * ragged response do not share a row grid and a refresh can replace the stops entirely;
 * see `resolveTimelineIndex`. Positions snap to the stops the data actually has, so
 * every one of them has something to draw.
 *
 * **Unlike `ChartNotices` and `ChartZoomControls` this is not an overlay.** Those are
 * absolutely positioned precisely so they do not shrink the plot; a slider laid over the
 * chart would sit on top of the marks it is there to change. It takes layout instead,
 * and `Panel` gives the chart the remaining height.
 */
export const ChartTimeSlider: React.FC<Props> = ({
  timeline,
  selected,
  onSelect,
  timeZone,
  stepDuration,
  stepSize,
}) => {
  const styles = useStyles2(getStyles);
  // Before the early return: the timeline can go `null` on a refresh, and the hook is
  // what stops playback when it does.
  // The percentage is resolved against *this* timeline's length here, where the length
  // is known; the hook counts stops. An empty timeline never reaches the hook's timer.
  const { playing, toggle, stop } = useTimelinePlayback(
    timeline,
    selected,
    stepDuration,
    stopsPerStep(timeline?.length ?? 0, stepSize),
    onSelect
  );

  if (timeline == null || timeline.length === 0) {
    return null;
  }

  const index = resolveTimelineIndex(timeline, selected);

  return (
    <div className={styles.wrapper} data-testid="chart-time-slider">
      {/*
        Labelled rather than tooltipped, unlike `ChartZoomControls`: a magnifier with a
        plus in it needs a word, a play triangle does not — and `IconButton`'s tooltip
        mounts a floating-ui popover inside the viz area for a control that is already
        unambiguous.
      */}
      <IconButton
        name={playing ? 'pause' : 'play'}
        size="sm"
        aria-label={playing ? 'Pause' : 'Play'}
        onClick={toggle}
      />
      <div className={styles.slider}>
        {/*
          Positions are stop *indices*, not timestamps: the stops are whatever the
          response carries and are not evenly spaced, so a slider over the raw time
          range would give a scrape gap a wide dead zone. The value handed back out is
          the timestamp at that index.
          https://developers.grafana.com/ui/latest/index.html?path=/docs/inputs-slider--docs
        */}
        <Slider
          min={0}
          max={timeline.length - 1}
          step={1}
          value={index}
          onChange={(position) => {
            // Taking hold of the slider takes over from playback: otherwise the next tick
            // moves the handle out from under the user a moment after they let go.
            stop();
            onSelect(timeline[position] ?? timeline[timeline.length - 1]);
          }}
          showInput={false}
          ariaLabelForHandle="Selected time"
        />
      </div>
      <span className={styles.readout}>{dateTimeFormat(timeline[index], { timeZone })}</span>
    </div>
  );
};

const getStyles = (theme: GrafanaTheme2) => ({
  wrapper: css({
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    height: TIME_SLIDER_HEIGHT,
    // The slider's own track has generous side padding; trim the strip's so the row
    // still reads as one control at the panel's edge.
    padding: theme.spacing(0, 1),
  }),
  slider: css({
    flex: 1,
    // `Slider` lays its track out at full width and would otherwise refuse to shrink
    // below its content in the flex row.
    minWidth: 0,
    // The handle is a circle centred on the track's end, so half of it hangs past the
    // last position and would otherwise sit on top of the readout at the newest stop.
    paddingRight: theme.spacing(1),
  }),
  readout: css({
    ...theme.typography.bodySmall,
    color: theme.colors.text.secondary,
    fontVariantNumeric: 'tabular-nums',
    // Fixed rather than shrink-to-fit: the text changes on every step, and a readout
    // that resizes drags the slider's right edge with it.
    whiteSpace: 'nowrap',
  }),
});
