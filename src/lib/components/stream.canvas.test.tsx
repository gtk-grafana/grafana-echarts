import { FieldType, toDataFrame } from '@grafana/data';
import { render } from '@testing-library/react';
import { SERIES_ZLEVEL } from 'test/canvas';
import { getComponent, getSettledSeriesCanvasEvents } from 'test/panel';
import { type PanelOptions } from 'types';

// Stream (theme river) canvas coverage.
//
// This is the family's render smoke test, not its regression matrix: it asserts
// that the real <Panel /> reaches ECharts and paints one filled ribbon per layer,
// which is what catches a missing series/component registration, a throwing chart
// module, or a `singleAxis` that never lays out. The per-option snapshot matrix
// lands with the family's editor surface, once each case has been verified in a
// browser and the baselines approved (see `__snapshots__/AGENTS.md`).
//
// Like the multivariate tests, the series is placed on SERIES_ZLEVEL so only the
// series-layer draw calls are read (the axis paints on the default layer), and the
// events are captured after a forced single repaint — the themeRiver view sets a
// clip path it removes on a timer when animation is enabled, the same
// multi-paint hazard `getSettledSeriesCanvasEvents` exists for.
const canvasOptions = (extra: Partial<PanelOptions> = {}): Partial<PanelOptions> => ({
  zLevel: { series: SERIES_ZLEVEL },
  animation: { enabled: false },
  ...extra,
});

const renderStream = async (frames: Parameters<typeof getComponent>[0], options: Partial<PanelOptions> = {}) => {
  const { container } = render(
    getComponent(frames, 'themeRiver', canvasOptions(options), undefined, undefined, 'stream')
  );
  return getSettledSeriesCanvasEvents(container);
};

/**
 * Filled paths in the *final* repaint — one per rendered ribbon.
 *
 * jest-canvas-mock accumulates draw calls across repaints and never resets on
 * `clearRect`, and the themeRiver view still paints the series layer twice per
 * render (each paint opening with a `clearRect`), so the events are sliced to the
 * last paint before counting.
 */
const fillCount = (events: Array<{ type: string }>) => {
  const lastPaint = events.map((event) => event.type).lastIndexOf('clearRect');
  return events.slice(lastPaint === -1 ? 0 : lastPaint).filter((event) => event.type === 'fill').length;
};

describe('stream (themeRiver) canvas renders', () => {
  // Wide frame: one layer per numeric field, the shape Prometheus/Loki produce
  // once each series lands in its own field.
  const logVolumeFrame = toDataFrame({
    fields: [
      { name: 'time', type: FieldType.time, values: [1783137094497, 1783140694497, 1783144294497, 1783147894497] },
      { name: 'error', type: FieldType.number, values: [4, 6, 3, 5], config: { displayName: 'error' } },
      { name: 'warn', type: FieldType.number, values: [8, 5, 9, 7], config: { displayName: 'warn' } },
      { name: 'info', type: FieldType.number, values: [20, 24, 18, 22], config: { displayName: 'info' } },
    ],
  });

  // Long frame: time + one numeric + a label column, the SQL / SQL-expression
  // shape the converter pivots into one layer per label value.
  const longFrame = toDataFrame({
    fields: [
      {
        name: 'time',
        type: FieldType.time,
        values: [1783137094497, 1783137094497, 1783144294497, 1783144294497],
      },
      { name: 'level', type: FieldType.string, values: ['error', 'warn', 'error', 'warn'] },
      { name: 'count', type: FieldType.number, values: [4, 8, 3, 9] },
    ],
  });

  it('paints one ribbon per numeric field', async () => {
    const { seriesEvents } = await renderStream([logVolumeFrame]);

    expect(fillCount(seriesEvents)).toBe(3);
  });

  it('paints one ribbon per label value for a long frame', async () => {
    const { seriesEvents } = await renderStream([longFrame]);

    expect(fillCount(seriesEvents)).toBe(2);
  });

  it('paints one ribbon per frame for a one-frame-per-series response', async () => {
    const frame = (name: string, values: number[]) =>
      toDataFrame({
        name,
        fields: [
          { name: 'time', type: FieldType.time, values: [1783137094497, 1783144294497] },
          { name: 'Value', type: FieldType.number, values, config: { displayName: name } },
        ],
      });

    const { seriesEvents } = await renderStream([frame('a', [1, 2]), frame('b', [3, 4])]);

    expect(fillCount(seriesEvents)).toBe(2);
  });

  it('draws a gappy layer as a zero-height ribbon rather than breaking it', async () => {
    const gappy = toDataFrame({
      fields: [
        { name: 'time', type: FieldType.time, values: [1783137094497, 1783140694497, 1783144294497] },
        { name: 'a', type: FieldType.number, values: [5, null, 5], config: { displayName: 'a' } },
        { name: 'b', type: FieldType.number, values: [5, 5, 5], config: { displayName: 'b' } },
      ],
    });

    // A stacked ribbon has no way to draw a hole, so the null becomes 0 and the
    // ribbon still paints as one continuous shape.
    const { seriesEvents } = await renderStream([gappy]);

    expect(fillCount(seriesEvents)).toBe(2);
  });
});
