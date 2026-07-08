import { dateTimeFormat, systemDateFormats, type TimeRange } from '@grafana/data';

// ECharts only exposes a global `useUTC` toggle and has no arbitrary IANA
// timezone support, so its built-in time-axis labels always render in browser
// local time. To honor Grafana's configured `timeZone` we format each tick
// ourselves with Grafana's `dateTimeFormat`, letting ECharts keep placing the
// ticks. https://echarts.apache.org/en/option.html#xAxis.axisLabel.formatter

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const YEAR = 365 * DAY;

/** Format one tick value (epoch ms) in the given timezone with `format`. */
function format(ms: number, fmt: string, timeZone: string): string {
  return dateTimeFormat(ms, { format: fmt, timeZone });
}

/**
 * Choose a per-tick label formatter based on the visible span. A deliberately
 * simpler take on core Grafana's `formatTime` (which reads uPlot's chosen tick
 * increment): exact parity isn't needed, only timezone-correct, non-ISO,
 * non-overlapping labels. Formats come from `systemDateFormats.interval` so they
 * match the rest of Grafana.
 *
 * For multi-day/week spans a fixed `MM/DD HH:mm` would render a redundant
 * `00:00` on every day-boundary tick (which then overlap). Instead the day-scale
 * band labels midnight ticks with the date and intraday ticks with the time
 * (mirroring how uPlot/ECharts read), so daily ticks show just `MM/DD`.
 */
function pickTickFormatter(spanMs: number, timeZone: string): (ms: number) => string {
  const { interval } = systemDateFormats;

  if (spanMs < SECOND) {
    return (ms) => format(ms, interval.millisecond, timeZone);
  }
  if (spanMs <= MINUTE) {
    return (ms) => format(ms, interval.second, timeZone);
  }
  if (spanMs <= DAY) {
    return (ms) => format(ms, interval.minute, timeZone);
  }
  if (spanMs < YEAR) {
    // Day scale: date on midnight ticks, time on intraday ticks.
    return (ms) =>
      format(ms, 'HHmmss', timeZone) === '000000'
        ? format(ms, interval.day, timeZone)
        : format(ms, interval.minute, timeZone);
  }
  return (ms) => format(ms, interval.month, timeZone);
}

/**
 * Build an ECharts `axisLabel.formatter` that renders time ticks in Grafana's
 * timezone with a concise format chosen from the dashboard range span.
 *
 * Accepts a numeric epoch (time axis) or a string category (candlestick/boxplot
 * axis, whose labels are ISO timestamps). Non-time strings (e.g. a categorical
 * boxplot label) fail to parse and pass through unchanged.
 */
export function getTimeAxisLabelFormatter(
  timeRange: TimeRange,
  timeZone: string
): (value: number | string) => string {
  const formatTick = pickTickFormatter(timeRange.to.valueOf() - timeRange.from.valueOf(), timeZone);

  return (value) => {
    const ms = typeof value === 'number' ? value : Date.parse(value);
    if (!Number.isFinite(ms)) {
      return String(value);
    }
    return formatTick(ms);
  };
}
