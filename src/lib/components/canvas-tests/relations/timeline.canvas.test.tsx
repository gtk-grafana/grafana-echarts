import { DataFrameType, FieldColorModeId, FieldType, ThresholdsMode, toDataFrame } from '@grafana/data';
import { act, fireEvent, screen } from '@testing-library/react';

import {
  clearMockedCanvasEvents,
  DEFAULT_LAYER_SELECTOR,
  getChart,
  normalizeCanvasEvents,
  readCanvasLayer,
  SERIES_LAYER_SELECTOR,
} from 'test/canvas';
import { height, waitForFinished, width } from 'test/panel';
import { renderRelations } from 'test/relationsCanvas';

import { GRAPH_EDGES_WIDE } from 'lib/echarts/relations/converters/contract';

const T0 = 1700000000000;
const STEP = 300000;

/** Build one ranged edge frame on a shared row grid. */
const rangedEdges = () =>
  toDataFrame({
    name: 'edges',
    meta: { type: GRAPH_EDGES_WIDE },
    fields: [
      { name: 'Time', type: FieldType.time, values: [T0, T0 + STEP, T0 + 2 * STEP] },
      { name: 'gateway-->api', type: FieldType.number, values: [1, 2, 3] },
      { name: 'api-->db', type: FieldType.number, values: [10, 20, 30] },
    ],
  });

const instantNodes = () =>
  toDataFrame({
    name: 'nodes',
    meta: { type: DataFrameType.NumericMulti },
    fields: [
      { name: 'Time', type: FieldType.time, values: [T0 + 7] },
      graded('gateway', 10),
      graded('api', 90),
      graded('db', 50),
    ],
  });

/** Use one threshold band for each fixture node. */
const steps = {
  mode: ThresholdsMode.Absolute,
  steps: [
    { value: -Infinity, color: 'green' },
    { value: 40, color: 'orange' },
    { value: 70, color: 'red' },
  ],
};

function graded(name: string, value: number) {
  return {
    name,
    type: FieldType.number,
    values: [value],
    config: { color: { mode: FieldColorModeId.Thresholds }, thresholds: steps },
  };
}

const scrubToEarliest = async (container: HTMLElement) => {
  const { chartInstanceDom, chart } = getChart(container);

  fireEvent.keyDown(screen.getByRole('slider', { name: 'Selected time' }), { key: 'Home', keyCode: 36 });
  await act(async () => {
    await waitForFinished(chart);
  });

  chartInstanceDom.querySelectorAll('canvas').forEach((canvas) => {
    const ctx = canvas.getContext('2d');
    if (ctx) {
      clearMockedCanvasEvents(ctx);
    }
  });
  chart?.resize({ width: chart.getWidth(), height: chart.getHeight() });
  chart?.getZr().flush();

  return {
    seriesEvents: readCanvasLayer(chartInstanceDom, SERIES_LAYER_SELECTOR),
    defaultEvents: readCanvasLayer(chartInstanceDom, DEFAULT_LAYER_SELECTOR),
  };
};

describe('relations time slider', () => {
  it('the graph at the earliest timestamp, under the slider strip (edge weights 1 and 10)', async () => {
    const { container } = await renderRelations({
      frames: [rangedEdges()],
      options: { relationsTimeSlider: true, relationsShowEdgeValues: true },
    });

    const { seriesEvents, defaultEvents } = await scrubToEarliest(container);

    expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
  });

  it('a graded instant nodes frame at the earliest stop (values and bands kept, edges still scrubbed)', async () => {
    const { container } = await renderRelations({
      frames: [rangedEdges(), instantNodes()],
      options: { relationsTimeSlider: true, relationsShowEdgeValues: true, relationsShowNodeValues: true },
    });

    const { seriesEvents, defaultEvents } = await scrubToEarliest(container);

    expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
  });
});
