import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { ChartTimeSlider, resolveTimelineIndex } from './ChartTimeSlider';

/**
 * The time slider, tested through its roles rather than its markup, like
 * `ChartZoomControls.test.tsx` — and with plain `fireEvent`, since
 * `@testing-library/user-event` is not a dependency here.
 *
 * What this component decides is *which timestamp a position means*: the stops are the
 * ones the data carries and are not evenly spaced, so the slider runs over indices and
 * hands back the timestamp at that index. That the selected timestamp then changes what
 * is drawn is asserted on the built option in `relations-timeline.integration.test.tsx`.
 */

const T0 = 1700000000000;
const STEP = 300000;
const timeline = [T0, T0 + STEP, T0 + 2 * STEP];

const renderSlider = (overrides: Partial<React.ComponentProps<typeof ChartTimeSlider>> = {}) => {
  const onSelect = jest.fn();
  render(
    <ChartTimeSlider timeline={timeline} selected={T0 + STEP} onSelect={onSelect} timeZone="utc" {...overrides} />
  );
  return onSelect;
};

describe('resolveTimelineIndex', () => {
  it('finds an exact stop', () => {
    expect(resolveTimelineIndex(timeline, T0 + STEP)).toBe(1);
  });

  /**
   * Nothing selected reads as the **newest** stop, which is what the family's default
   * `lastNotNull` reducer already draws — so switching the slider on does not change the
   * picture.
   */
  it('defaults to the newest stop', () => {
    expect(resolveTimelineIndex(timeline, null)).toBe(2);
    expect(resolveTimelineIndex(timeline, undefined)).toBe(2);
  });

  /**
   * The reason the selection is a timestamp rather than an index: the dashboard refreshes
   * on its own interval and replaces the timeline underneath it. A rolling window drops
   * the oldest stop and shifts every index by one; the nearest *timestamp* is still the
   * same instant.
   */
  it('falls back to the nearest stop when the selection is gone', () => {
    const shifted = [T0 + STEP, T0 + 2 * STEP, T0 + 3 * STEP];

    expect(resolveTimelineIndex(shifted, T0)).toBe(0);
    expect(resolveTimelineIndex(shifted, T0 + 2 * STEP + 10)).toBe(1);
    expect(resolveTimelineIndex(shifted, T0 + 9 * STEP)).toBe(2);
  });
});

describe('ChartTimeSlider', () => {
  // The family decides whether this render has a timeline (`getTimeline`), so no timeline
  // means no strip — which is every family but relations, and every instant response.
  it('renders nothing when the render has no timeline', () => {
    const { container } = render(
      <ChartTimeSlider timeline={null} selected={null} onSelect={jest.fn()} timeZone="utc" />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('renders step buttons, a slider and the selected timestamp', () => {
    renderSlider();

    expect(screen.getByRole('button', { name: 'Previous step' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next step' })).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'Selected time' })).toBeInTheDocument();
    expect(screen.getByText('2023-11-14 22:18:20')).toBeInTheDocument();
  });

  /**
   * The readout is in the **panel's** time zone, not the browser's: a dashboard pinned to
   * UTC would otherwise label the stop with a local time that matches nothing else on it.
   */
  it('formats the timestamp in the panel time zone', () => {
    renderSlider({ selected: T0, timeZone: 'America/New_York' });

    expect(screen.getByText('2023-11-14 17:13:20')).toBeInTheDocument();
  });

  /**
   * Positions are indices and the callback is a **timestamp** — the whole translation
   * this component does. The stops are whatever the response carries, so a slider over
   * the raw time range would give a scrape gap a wide dead zone.
   */
  it('reports the timestamp at the position the slider moved to', () => {
    const onSelect = renderSlider();

    fireEvent.keyDown(screen.getByRole('slider', { name: 'Selected time' }), { key: 'ArrowRight', keyCode: 39 });

    expect(onSelect).toHaveBeenCalledWith(T0 + 2 * STEP);
  });

  // The buttons are the same selection the slider makes, one stop either way.
  it('steps to the neighbouring stop', () => {
    const onSelect = renderSlider();

    fireEvent.click(screen.getByRole('button', { name: 'Next step' }));
    expect(onSelect).toHaveBeenCalledWith(T0 + 2 * STEP);

    fireEvent.click(screen.getByRole('button', { name: 'Previous step' }));
    expect(onSelect).toHaveBeenCalledWith(T0);
  });

  /**
   * Wrapping rather than clamping, and in both directions. The end of the timeline is
   * where a reader most often wants to start over, and a `›` that went inert there would
   * send them across the panel to `‹` — the one gesture the buttons exist to save.
   */
  it('wraps forward from the newest stop to the oldest', () => {
    const onSelect = renderSlider({ selected: T0 + 2 * STEP });

    fireEvent.click(screen.getByRole('button', { name: 'Next step' }));

    expect(onSelect).toHaveBeenCalledWith(T0);
  });

  it('wraps back from the oldest stop to the newest', () => {
    const onSelect = renderSlider({ selected: T0 });

    fireEvent.click(screen.getByRole('button', { name: 'Previous step' }));

    expect(onSelect).toHaveBeenCalledWith(T0 + 2 * STEP);
  });

  // Neither button is ever dead, which is the whole point of wrapping.
  it('leaves both step buttons enabled at either end', () => {
    renderSlider({ selected: T0 });

    expect(screen.getByRole('button', { name: 'Previous step' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Next step' })).toBeEnabled();
  });

  /**
   * The handle sits at the stop **nearest** the selection, not only at an exact match: a
   * refresh replaces the timeline underneath it, and a rolling window can drop the very
   * stop that was picked. See `resolveTimelineIndex`.
   */
  it('snaps the handle to the nearest stop when the selection is between two', () => {
    renderSlider({ selected: T0 + 2 * STEP - 1 });

    expect(screen.getByRole('slider', { name: 'Selected time' })).toHaveAttribute('aria-valuenow', '2');
  });

  // Nothing selected yet reads as the newest stop, which is what the default
  // `lastNotNull` reducer already draws — so switching the slider on changes no picture.
  it('starts at the newest stop when nothing is selected', () => {
    renderSlider({ selected: null });

    expect(screen.getByRole('slider', { name: 'Selected time' })).toHaveAttribute('aria-valuenow', '2');
    expect(screen.getByText('2023-11-14 22:23:20')).toBeInTheDocument();
  });
});
