import { createTheme, type DataFrame, FieldType, MappingType, toDataFrame } from '@grafana/data';
import { type TopLevelFormatterParams } from 'echarts/types/dist/shared';

import { frameToRelationsGraph } from 'lib/echarts/relations/converters/nodeGraph';

import { applyTestFieldConfig } from 'test/fieldConfig';
import { relationsSeriesContext, relationsOptions } from 'test/relations';

import { GRAPH_EDGES_WIDE, GRAPH_NODES_WIDE } from 'lib/echarts/relations/converters/contract';
import { getRelationsNodeLabelFormatter } from 'lib/echarts/relations/options/labels';
import { getRelationsTooltipMarks } from 'lib/echarts/relations/tooltip/marks';
import { buildRelationsTooltipModel } from 'lib/echarts/relations/tooltip/model';
import { type RelationsNodeItem } from 'lib/echarts/relations/tooltip/types';

const theme = createTheme();

/** Two nodes, one carrying a value-to-text mapping and one carrying none. */
const mappedNodes = (): DataFrame =>
  toDataFrame({
    name: 'nodes',
    meta: { type: GRAPH_NODES_WIDE },
    fields: [
      {
        name: 'gateway',
        type: FieldType.number,
        values: [1],
        config: {
          mappings: [
            {
              type: MappingType.ValueToText,
              options: { 1: { text: 'Healthy', index: 0 }, 3: { text: 'Down', index: 1 } },
            },
          ],
        },
      },
      { name: 'db', type: FieldType.number, values: [2] },
    ],
  });

/** An edge whose weight is mapped to a band name rather than a number. */
const mappedEdges = (): DataFrame =>
  toDataFrame({
    name: 'edges',
    meta: { type: GRAPH_EDGES_WIDE },
    fields: [
      {
        name: 'e1',
        type: FieldType.number,
        labels: { source: 'gateway', target: 'db' },
        values: [250],
        config: {
          mappings: [{ type: MappingType.RangeToText, options: { from: 200, to: 300, result: { text: 'Slow' } } }],
        },
      },
    ],
  });

const asPipelineWould = (frames: DataFrame[]): DataFrame[] =>
  applyTestFieldConfig(frames, { defaults: {}, overrides: [] }, theme);

const graphOf = (frames: DataFrame[]) => {
  const data = frameToRelationsGraph(asPipelineWould(frames), theme);
  if (data.kind !== 'data') {
    throw new Error(`fixture produced ${data.reason}`);
  }
  return data.data;
};

const marksOf = (frames: DataFrame[]) => getRelationsTooltipMarks(graphOf(frames), theme, 'utc');

/** The whole response: two nodes and the edge between them. */
const graphFrames = (): DataFrame[] => [mappedNodes(), mappedEdges()];

describe('relations value mappings', () => {
  describe('tooltip', () => {
    const tooltipTextFor = (
      frames: DataFrame[],
      item: RelationsNodeItem | Record<string, unknown>,
      dataType?: string
    ) =>
      buildRelationsTooltipModel(
        marksOf(frames),
        relationsOptions()
      )({ data: item, color: '#ffffff', dataType } as unknown as TopLevelFormatterParams).rows[0]?.value;

    it('shows a node its mapped text instead of its number', () => {
      expect(tooltipTextFor(graphFrames(), { id: 'gateway', name: 'gateway', value: 1 })).toBe('Healthy');
    });

    it('leaves an unmapped node on its own number', () => {
      expect(tooltipTextFor(graphFrames(), { id: 'db', name: 'db', value: 2 })).toBe('2');
    });

    it('shows an edge its mapped band instead of its weight', () => {
      expect(tooltipTextFor(graphFrames(), { markId: 'e1', source: 'gateway', target: 'db', value: 250 }, 'edge')).toBe(
        'Slow'
      );
    });

    it('falls through to the plain number for an unmapped value', () => {
      const unmapped = toDataFrame({
        name: 'nodes',
        meta: { type: GRAPH_NODES_WIDE },
        fields: [{ ...mappedNodes().fields[0], values: [9] }],
      });

      expect(tooltipTextFor([unmapped, mappedEdges()], { id: 'gateway', name: 'gateway', value: 9 })).toBe('9');
    });
  });

  describe('node value label', () => {
    it('prints the mapped text under the node', () => {
      const context = {
        ...relationsSeriesContext({ options: relationsOptions({ relationsShowNodeValues: true }) }),
        marks: marksOf(graphFrames()),
      };
      const formatter = getRelationsNodeLabelFormatter(context)!;

      expect(formatter({ name: 'gateway', data: { id: 'gateway', name: 'gateway', value: 1 } } as never)).toBe(
        'gateway\nHealthy'
      );
    });
  });
});
