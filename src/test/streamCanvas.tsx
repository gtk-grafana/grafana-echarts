import { type DataFrame, type FieldConfigSource, FieldType, toDataFrame } from '@grafana/data';
import { render } from '@testing-library/react';
import { SERIES_ZLEVEL } from 'test/canvas';
import { getComponent, getSettledSeriesCanvasEvents } from 'test/panel';
import { type PanelOptions } from 'types';

/**
 * Render harness and fixtures shared by the stream family's canvas and integration
 * suites, so the two describe the same three frames.
 *
 * Series are placed on `SERIES_ZLEVEL`, so only the series-layer draw calls are read
 * (the axis paints on the default layer); see `Panel.canvas.test.tsx` for the
 * layered-capture rationale. Events are read after a forced single repaint — the
 * themeRiver view sets a clip path it removes on a timer when animation is enabled, the
 * same multi-paint hazard `getSettledSeriesCanvasEvents` exists for.
 *
 * Rendered in Advanced editor mode so the advanced options these suites exercise
 * (boundary gap, ribbon style, emphasis, label placement) are respected as-is. In
 * Default mode `applyStreamEditorModeDefaults` resets every advanced option — including
 * forcing `animation.enabled` back on, which would clobber the `animation: { enabled:
 * false }` the snapshots rely on for determinism. The Default-mode reset itself is
 * covered by the `applyStreamEditorModeDefaults` unit tests in `options/stream.test.ts`.
 */
export const streamCanvasOptions = (extra: Partial<PanelOptions> = {}): Partial<PanelOptions> => ({
  zLevel: { series: SERIES_ZLEVEL },
  animation: { enabled: false },
  editorMode: 'advanced',
  ...extra,
});

export const renderStream = async (
  frames: DataFrame[],
  options: Partial<PanelOptions> = {},
  fieldConfig?: FieldConfigSource
) => {
  const { container } = render(
    getComponent(frames, 'themeRiver', streamCanvasOptions(options), undefined, undefined, 'stream', fieldConfig)
  );
  return getSettledSeriesCanvasEvents(container);
};

/**
 * Filled paths in the *final* repaint — one per rendered ribbon.
 *
 * jest-canvas-mock accumulates draw calls across repaints and never resets on
 * `clearRect`, and the themeRiver view still paints the series layer twice per render
 * (each paint opening with a `clearRect`), so the events are sliced to the last paint
 * before counting.
 */
export const fillCount = (events: Array<{ type: string }>) => {
  const lastPaint = events.map((event) => event.type).lastIndexOf('clearRect');
  return events.slice(lastPaint === -1 ? 0 : lastPaint).filter((event) => event.type === 'fill').length;
};

/**
 * Wide frame: one layer per numeric field, the shape Prometheus/Loki produce once each
 * series lands in its own field. The base case every option builds on.
 */
export const logVolumeFrame = toDataFrame({
  fields: [
    { name: 'time', type: FieldType.time, values: [1783137094497, 1783140694497, 1783144294497, 1783147894497] },
    { name: 'error', type: FieldType.number, values: [4, 6, 3, 5], config: { displayName: 'error' } },
    { name: 'warn', type: FieldType.number, values: [8, 5, 9, 7], config: { displayName: 'warn' } },
    { name: 'info', type: FieldType.number, values: [20, 24, 18, 22], config: { displayName: 'info' } },
  ],
});

/**
 * Long frame: time + one numeric + a label column, the SQL / SQL-expression shape the
 * converter pivots into one layer per label value.
 */
export const longFrame = toDataFrame({
  fields: [
    { name: 'time', type: FieldType.time, values: [1783137094497, 1783137094497, 1783144294497, 1783144294497] },
    { name: 'level', type: FieldType.string, values: ['error', 'warn', 'error', 'warn'] },
    { name: 'count', type: FieldType.number, values: [4, 8, 3, 9] },
  ],
});

/**
 * The ambiguous frame the "Layers from" radio exists for: a time field, a string column
 * *and* two numeric columns, which reads equally well as "two metrics" or "one metric
 * per label". Auto keeps the fields path; `labels` pivots on `level` and uses the first
 * numeric field as the value.
 */
export const ambiguousFrame = toDataFrame({
  fields: [
    { name: 'time', type: FieldType.time, values: [1783137094497, 1783137094497, 1783144294497, 1783144294497] },
    { name: 'level', type: FieldType.string, values: ['error', 'warn', 'error', 'warn'] },
    { name: 'count', type: FieldType.number, values: [4, 8, 3, 9] },
    { name: 'bytes', type: FieldType.number, values: [40, 80, 30, 90] },
  ],
});
