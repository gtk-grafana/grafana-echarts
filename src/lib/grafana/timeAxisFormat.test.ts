import { dateTime, type TimeRange } from '@grafana/data';
import { getTimeAxisLabelFormatter } from 'lib/grafana/timeAxisFormat';

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** TimeRange spanning `spanMs` and ending after `epoch`, matching the panel shape. */
const rangeSpanning = (epoch: number, spanMs: number): TimeRange => {
  const from = epoch - spanMs;
  const to = epoch;
  return { from: dateTime(from), to: dateTime(to), raw: { from: dateTime(from), to: dateTime(to) } };
};

// The x-axis tick that reproduced the bug report (17:16 UTC == 13:16 EDT).
const EPOCH = Date.parse('2021-07-13T17:16:30.000Z');

describe('getTimeAxisLabelFormatter', () => {
  it('renders the same instant differently per timezone', () => {
    const range = rangeSpanning(EPOCH, 6 * HOUR);

    expect(getTimeAxisLabelFormatter(range, 'utc')(EPOCH)).toBe('17:16');
    expect(getTimeAxisLabelFormatter(range, 'America/New_York')(EPOCH)).toBe('13:16');
  });

  it('never emits a raw ISO timestamp', () => {
    const range = rangeSpanning(EPOCH, 6 * HOUR);
    const label = getTimeAxisLabelFormatter(range, 'utc')(EPOCH);

    expect(label).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  describe('format selection by range span', () => {
    it.each([
      [30 * SECOND, '17:16:30'],
      [6 * HOUR, '17:16'],
      [3 * DAY, '17:16'],
      [90 * DAY, '17:16'],
      [800 * DAY, '2021-07'],
    ])('span %ims formats an intraday tick as %s', (spanMs, expected) => {
      const label = getTimeAxisLabelFormatter(rangeSpanning(EPOCH, spanMs), 'utc')(EPOCH);
      expect(label).toBe(expected);
    });

    it.each([[3 * DAY], [90 * DAY]])('labels a midnight tick with the date (no 00:00) on a %ims span', (spanMs) => {
      const midnight = Date.parse('2021-07-13T00:00:00.000Z');
      const label = getTimeAxisLabelFormatter(rangeSpanning(EPOCH, spanMs), 'utc')(midnight);
      expect(label).toBe('07/13');
    });

    it('respects timezone when deciding a day boundary', () => {
      // Midnight UTC is 20:00 the previous day in New York, so it is not a
      // day-boundary tick there and should render as a time.
      const utcMidnight = Date.parse('2021-07-13T00:00:00.000Z');
      const format = getTimeAxisLabelFormatter(rangeSpanning(EPOCH, 3 * DAY), 'America/New_York');
      expect(format(utcMidnight)).toBe('20:00');
    });
  });

  describe('candlestick/boxplot category input', () => {
    it('formats an ISO string category like the numeric epoch', () => {
      const range = rangeSpanning(EPOCH, 6 * HOUR);
      const format = getTimeAxisLabelFormatter(range, 'utc');

      expect(format(new Date(EPOCH).toISOString())).toBe('17:16');
    });

    it('passes a non-time category through unchanged', () => {
      const range = rangeSpanning(EPOCH, 6 * HOUR);

      expect(getTimeAxisLabelFormatter(range, 'utc')('latency-a')).toBe('latency-a');
    });
  });
});
