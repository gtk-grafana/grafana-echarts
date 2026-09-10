import { css } from '@emotion/css';
import { dateTimeFormat, type GrafanaTheme2 } from '@grafana/data';
import { type TimeZone } from '@grafana/schema';
import { IconButton, Slider, useStyles2 } from '@grafana/ui';
import React from 'react';

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
}

/**
 * The height the strip reserves, in px. Read by `Panel` to shrink the plot by exactly
 * this much: `EChart` is given an explicit pixel height, which it pushes into ECharts,
 * so the two boxes cannot be left to a flex solver.
 */
export const TIME_SLIDER_HEIGHT = 32;

/**
 * The stop nearest a timestamp, as an index into `timeline` — the **last** stop when
 * nothing is selected.
 *
 * Nearest rather than exact because a refresh replaces the timeline under the selection: a
 * rolling window drops the stop that was picked, and an index would silently come to mean a
 * different instant. Defaulting to the last stop is what `lastNotNull` already draws, so
 * switching the slider on changes no picture.
 *
 * `timeline` must be ascending and non-empty; `graphWideTimeline` guarantees both.
 */
export function resolveTimelineIndex(timeline: number[], selected: number | null | undefined): number {
  if (selected == null) {
    return timeline.length - 1;
  }
  let nearest = 0;
  for (let index = 1; index < timeline.length; index++) {
    if (Math.abs(timeline[index] - selected) < Math.abs(timeline[nearest] - selected)) {
      nearest = index;
    }
  }
  return nearest;
}

/**
 * Step the panel through the timestamps its data carries, instead of reducing them away.
 *
 * Drawn when the family reports a timeline (`ChartModule.getTimeline`). Positions are the
 * stops the data actually has, and the selection handed back is a **timestamp** rather than
 * an index — see `resolveTimelineIndex`. Every step is the user's; nothing moves on a timer.
 *
 * **Not an overlay**, unlike `ChartNotices` and `ChartZoomControls`: a slider laid over the
 * chart would sit on top of the marks it is there to change. It takes layout, and `Panel`
 * gives the chart the remaining height.
 */
export const ChartTimeSlider: React.FC<Props> = ({ timeline, selected, onSelect, timeZone }) => {
  const styles = useStyles2(getStyles);

  if (timeline == null || timeline.length === 0) {
    return null;
  }

  const index = resolveTimelineIndex(timeline, selected);
  /**
   * Wraps at both ends, so neither button is ever dead. The end of the timeline is where a
   * reader most often wants another pass, and a `›` that went inert there would send them
   * across the panel to `‹` — the one gesture the buttons exist to save.
   */
  const step = (delta: number) => onSelect(timeline[(index + delta + timeline.length) % timeline.length]);

  return (
    <div className={styles.wrapper} data-testid="chart-time-slider">
      {/*
        Labelled rather than tooltipped, unlike `ChartZoomControls`: an arrow between two
        timestamps needs no word, and `IconButton`'s tooltip would mount a floating-ui
        popover inside the viz area.
      */}
      <IconButton name="angle-left" size="sm" aria-label="Previous step" onClick={() => step(-1)} />
      <div className={styles.slider}>
        {/*
          Positions are stop *indices*: the stops are not evenly spaced, so a slider over
          the raw time range would give a scrape gap a wide dead zone.
          https://developers.grafana.com/ui/latest/index.html?path=/docs/inputs-slider--docs
        */}
        <Slider
          min={0}
          max={timeline.length - 1}
          step={1}
          value={index}
          onChange={(position) => onSelect(timeline[position] ?? timeline[timeline.length - 1])}
          showInput={false}
          ariaLabelForHandle="Selected time"
        />
      </div>
      <IconButton name="angle-right" size="sm" aria-label="Next step" onClick={() => step(1)} />
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
    // The handle is a circle centred on the track's end, so half of it hangs past the last
    // position and would otherwise sit under the next button.
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
