import { type DataFrame, FieldType, toDataFrame } from '@grafana/data';
import { render } from '@testing-library/react';
import { SERIES_ZLEVEL } from 'test/canvas';
import { getCanvasEvents, getComponent } from 'test/panel';

// Only the symbol threshold is mocked, so the lever can be crossed with a handful of
// points; the same mock as `performance.canvas.test.tsx`, which has to be repeated here
// because a module mock is scoped to one test file. This is what
// `lib/echarts/performance/constants.ts` exists for as a separate module: it can be
// mocked without touching the resolvers that read it.
jest.mock('lib/echarts/performance/constants', () => ({
  ...jest.requireActual('lib/echarts/performance/constants'),
  SYMBOL_VISIBLE_MAX_TOTAL_POINTS: 3,
}));

/** Mocked value of `SYMBOL_VISIBLE_MAX_TOTAL_POINTS` — a chart *total*, not per-series. */
const MOCKED_MAX_TOTAL_POINTS = 3;

/** A time frame with `series` numeric fields of `points` rows each, one hour apart. */
const densityFrame = (points: number, series = 1): DataFrame =>
  toDataFrame({
    fields: [
      {
        name: 'time',
        type: FieldType.time,
        values: Array.from({ length: points }, (_, i) => 1783137094497 + i * 3600000),
      },
      ...Array.from({ length: series }, (_, s) => ({
        name: `cpu${s}`,
        type: FieldType.number,
        values: Array.from({ length: points }, (_, i) => 10 + ((i + s) % 5) * 10),
        config: { displayName: `cpu${s}` },
      })),
    ],
  });

const renderFrames = async (frames: DataFrame[]) => {
  const { container } = render(
    getComponent(frames, 'line', { zLevel: { series: SERIES_ZLEVEL }, animation: { enabled: false } })
  );
  return getCanvasEvents(container);
};

/**
 * Draw calls that put ink on the series layer. A line series paints via `lineTo` (path
 * segments) and `arc` (point markers) — a series with neither renders as an empty
 * canvas, however many `moveTo`/`stroke` pairs it emits, because a zero-length path
 * covers no pixels.
 */
const countInk = (events: Array<{ type: string }>) =>
  events.reduce(
    (acc, { type }) => ({
      arc: acc.arc + (type === 'arc' ? 1 : 0),
      lineTo: acc.lineTo + (type === 'lineTo' ? 1 : 0),
    }),
    { arc: 0, lineTo: 0 }
  );

/**
 * Guards the blank-panel regression: hiding markers on a series that draws no line
 * leaves nothing on the canvas at all. Core Grafana keeps these points visible too, via
 * its uPlot `pointsFilter`.
 *
 * **No baselines here, by construction.** "Did anything render" is the whole claim, and
 * counting ink states it directly — a snapshot would state it in a thousand lines and
 * still pass if it were ever re-recorded blank. The pictures at either side of the
 * threshold are in `performance.canvas.test.tsx`. See `docs/performance.md`.
 */
describe('Panel canvas performance fast path: series that draw no line', () => {
  // Several one-point frames (a Prometheus instant query): past the total, but no series
  // has two points to draw a line between.
  it('still paints single-point series past the symbol threshold', async () => {
    const frames = Array.from({ length: MOCKED_MAX_TOTAL_POINTS + 1 }, (_, i) =>
      toDataFrame({
        fields: [
          { name: 'time', type: FieldType.time, values: [1783137094497 + i * 3600000] },
          { name: `cpu${i}`, type: FieldType.number, values: [10 + i * 10], config: { displayName: `cpu${i}` } },
        ],
      })
    );

    const { seriesEvents } = await renderFrames(frames);

    expect(countInk(seriesEvents).arc).toBeGreaterThan(0);
  });

  // One series past the threshold whose values are each separated by nulls, so
  // `connectNulls: false` leaves no drawable segment anywhere.
  it('still paints a series whose every value is null-separated', async () => {
    const points = (MOCKED_MAX_TOTAL_POINTS + 1) * 2;
    const frame = toDataFrame({
      fields: [
        {
          name: 'time',
          type: FieldType.time,
          values: Array.from({ length: points }, (_, i) => 1783137094497 + i * 3600000),
        },
        {
          name: 'cpu',
          type: FieldType.number,
          values: Array.from({ length: points }, (_, i) => (i % 2 === 0 ? 10 + (i % 5) * 10 : null)),
          config: { displayName: 'cpu' },
        },
      ],
    });

    const { seriesEvents } = await renderFrames([frame]);

    const ink = countInk(seriesEvents);
    expect(ink.lineTo).toBe(0); // nulls break every segment: markers are all there is
    expect(ink.arc).toBeGreaterThan(0);
  });

  // The other side of the boundary: an ordinary dense series does lose its markers, so
  // the guard above cannot be passing because symbols never drop.
  it('still drops markers on an ordinary dense series', async () => {
    const { seriesEvents } = await renderFrames([densityFrame(MOCKED_MAX_TOTAL_POINTS + 1)]);

    const ink = countInk(seriesEvents);
    expect(ink.arc).toBe(0);
    expect(ink.lineTo).toBeGreaterThan(0); // the line is what renders it instead
  });
});
