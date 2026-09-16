import {
  type FieldConfigSource,
  FieldColorModeId,
  FieldType,
  ThresholdsMode,
  toDataFrame,
  type ThresholdsConfig,
} from '@grafana/data';
import { type CanvasRenderingContext2DEvent } from 'jest-canvas-mock';

import { edgesFrame, nodesFrame } from 'test/relations';
import { renderRelations } from 'test/relationsCanvas';

const fixedEdgeColor = '#ff00ff';

const edgeOverride: FieldConfigSource = {
  defaults: {},
  overrides: [
    {
      matcher: { id: 'byName', options: 'e1' },
      properties: [{ id: 'color', value: { mode: 'fixed', fixedColor: fixedEdgeColor } }],
    },
  ],
};

const thresholds: ThresholdsConfig = {
  mode: ThresholdsMode.Absolute,
  steps: [
    { value: -Infinity, color: 'green' },
    { value: 40, color: 'orange' },
    { value: 70, color: 'red' },
  ],
};

const colorNodes = toDataFrame({
  name: 'nodes',
  fields: [
    { name: 'id', type: FieldType.string, values: ['a', 'b', 'c'] },
    { name: 'mainstat', type: FieldType.number, values: [10, 50, 90], config: { thresholds } },
  ],
});

const colorEdges = toDataFrame({
  name: 'edges',
  fields: [
    { name: 'id', type: FieldType.string, values: ['e1', 'e2'] },
    { name: 'source', type: FieldType.string, values: ['a', 'b'] },
    { name: 'target', type: FieldType.string, values: ['b', 'c'] },
    { name: 'mainstat', type: FieldType.number, values: [20, 80], config: { thresholds } },
  ],
});

const literalSchemes = [
  { name: 'fixed', color: { mode: FieldColorModeId.Fixed, fixedColor: 'red' } },
  { name: 'shades', color: { mode: FieldColorModeId.Shades, fixedColor: 'blue' } },
  { name: 'thresholds', color: { mode: FieldColorModeId.Thresholds } },
  { name: 'continuous', color: { mode: FieldColorModeId.ContinuousGrYlRd } },
];

const withScheme = (color: FieldConfigSource['defaults']['color']): FieldConfigSource => ({
  defaults: {},
  overrides: [
    {
      matcher: { id: 'byType', options: 'number' },
      properties: [{ id: 'color', value: color }],
    },
  ],
});

const fillColors = (events: CanvasRenderingContext2DEvent[]): string[] =>
  events.flatMap((event) => (event.type === 'fillStyle' ? [String(event.props.value)] : []));

const strokeColors = (events: CanvasRenderingContext2DEvent[]): string[] =>
  events.flatMap((event) => (event.type === 'strokeStyle' ? [String(event.props.value)] : []));

const renderFixedEdge = (beforeCapture?: Parameters<typeof renderRelations>[0]['beforeCapture']) =>
  renderRelations({
    frames: [nodesFrame, edgesFrame],
    variant: 'chord',
    fieldConfig: edgeOverride,
    beforeCapture,
  });

describe('relations chord edge color', () => {
  it.each(literalSchemes)('fills every edge color from the $name scheme', async ({ color }) => {
    const { seriesEvents } = await renderRelations({
      frames: [colorNodes, colorEdges],
      variant: 'chord',
      fieldConfig: withScheme(color),
    });

    const edgeColors = strokeColors(seriesEvents);
    expect(edgeColors.length).toBeGreaterThan(0);
    expect(fillColors(seriesEvents)).toEqual(expect.arrayContaining(edgeColors));
  });

  it('fills a ribbon with its fixed field color', async () => {
    const { seriesEvents } = await renderFixedEdge();

    expect(fillColors(seriesEvents)).toContain(fixedEdgeColor);
  });

  it('keeps the fixed fill while the ribbon has emphasis', async () => {
    const { seriesEvents } = await renderFixedEdge((chart) =>
      chart.dispatchAction({ type: 'highlight', seriesIndex: 0, dataIndex: 0, dataType: 'edge' })
    );

    expect(fillColors(seriesEvents)).toContain(fixedEdgeColor);
  });

  it('keeps the fixed fill while another ribbon has emphasis', async () => {
    const { seriesEvents } = await renderFixedEdge((chart) =>
      chart.dispatchAction({ type: 'highlight', seriesIndex: 0, dataIndex: 3, dataType: 'edge' })
    );

    expect(fillColors(seriesEvents)).toContain(fixedEdgeColor);
  });
});
