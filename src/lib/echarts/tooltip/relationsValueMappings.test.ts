import { createTheme, type DataFrame, FieldType, MappingType, toDataFrame } from '@grafana/data';
import { type TopLevelFormatterParams } from 'echarts/types/dist/shared';
import { GRAPH_EDGES_WIDE, GRAPH_NODES_WIDE } from 'lib/echarts/converters/graphWide';
import { frameToRelationsGraph } from 'lib/echarts/converters/relationsGraph';
import { getRelationsNodeLabelFormatter } from 'lib/echarts/options/graph';
import { buildRelationsTooltipModel, getRelationsTooltipMarks } from 'lib/echarts/tooltip/relations';
import { type RelationsNodeItem } from 'lib/echarts/tooltip/types';
import { applyTestFieldConfig } from 'test/fieldConfig';
import { relationsSeriesContext, relationsOptions } from 'test/relations';

/**
 * **Value mappings on a relations mark.**
 *
 * `parity.md` lists them as supported — "applied through the field's display processor"
 * — with no test behind the claim, which is exactly the kind of statement that is true
 * until it isn't: a mark's value reaches the screen through `field.display(value)`, and
 * anything that formatted a raw number instead would keep working for every other case
 * and silently drop the mapping.
 *
 * A mapping is also the sharpest available proof that a mark formats through **its own**
 * field, because a mapping replaces the text outright rather than decorating it. A node
 * showing `Healthy` where its neighbour shows `2` cannot be a shared frame-level
 * formatter.
 *
 * Unit-only, as the plan calls for: a mapping changes text, not geometry, so a canvas
 * baseline would spend 2,500 lines to say what one string comparison says.
 */

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

/**
 * Mappings live in `field.config`, and it is `applyFieldOverrides` — not the reader —
 * that turns them into a display processor. Running the frames through the same pass the
 * host does is therefore load-bearing here: a fixture that skipped it would be a state
 * the panel is never in, and the mapping would appear not to work for the wrong reason.
 */
const asPipelineWould = (frames: DataFrame[]): DataFrame[] =>
  applyTestFieldConfig(frames, { defaults: {}, overrides: [] }, theme);

const graphOf = (frames: DataFrame[]) => {
  const data = frameToRelationsGraph(asPipelineWould(frames), theme);
  if (!data) {
    throw new Error('fixture produced no graph');
  }
  return data;
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

    // The mapping belongs to one field, so its neighbour is untouched — which is the
    // whole point of a mark being a field.
    it('leaves an unmapped node on its own number', () => {
      expect(tooltipTextFor(graphFrames(), { id: 'db', name: 'db', value: 2 })).toBe('2');
    });

    // Range mappings too, on an edge rather than a node: both marks go through the same
    // per-mark display processor.
    it('shows an edge its mapped band instead of its weight', () => {
      expect(tooltipTextFor(graphFrames(), { markId: 'e1', source: 'gateway', target: 'db', value: 250 }, 'edge')).toBe(
        'Slow'
      );
    });

    // A value the mapping does not cover falls through to ordinary formatting rather
    // than rendering blank.
    it('falls through to the plain number for an unmapped value', () => {
      const unmapped = toDataFrame({
        name: 'nodes',
        meta: { type: GRAPH_NODES_WIDE },
        fields: [{ ...mappedNodes().fields[0], values: [9] }],
      });

      expect(tooltipTextFor([unmapped, mappedEdges()], { id: 'gateway', name: 'gateway', value: 9 })).toBe('9');
    });
  });

  /**
   * "Show node values" prints the same number the tooltip does, through the same
   * per-mark lookup — so a mapping has to reach the label too, or the panel would show
   * `Healthy` on hover and `1` underneath the node at the same time.
   */
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
