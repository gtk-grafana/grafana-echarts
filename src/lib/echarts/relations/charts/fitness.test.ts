import {
  createDataFrame,
  type DataFrame,
  FieldType,
  getPanelDataSummary,
  VisualizationSuggestionScore,
} from '@grafana/data';
import {
  RELATIONS_CHORD_MAX_NODES,
  RELATIONS_MAX_EDGES,
  RELATIONS_SANKEY_MAX_LEVELS,
  RELATIONS_SANKEY_MAX_NODES,
} from 'lib/echarts/charts/suggestionLimits';
import {
  exceedsChordNodeBudget,
  fitsSankeyTopology,
  relationsNodeCount,
  scoreRelations,
} from 'lib/echarts/relations/charts/fitness';

const summaryOf = (...frames: DataFrame[]) => getPanelDataSummary(frames);

const edgesFrame = (rows: number) =>
  createDataFrame({
    name: 'edges',
    fields: [
      { name: 'id', type: FieldType.string, values: Array.from({ length: rows }, (_, row) => `e${row}`) },
      { name: 'source', type: FieldType.string, values: Array.from({ length: rows }, (_, row) => `n${row}`) },
      { name: 'target', type: FieldType.string, values: Array.from({ length: rows }, (_, row) => `n${row + 1}`) },
    ],
  });

const edgePairsFrame = (pairs: Array<[string, string]>) =>
  createDataFrame({
    name: 'edges',
    fields: [
      { name: 'source', type: FieldType.string, values: pairs.map(([source]) => source) },
      { name: 'target', type: FieldType.string, values: pairs.map(([, target]) => target) },
    ],
  });

const nodesFrame = (rows: number) =>
  createDataFrame({
    name: 'nodes',
    fields: [
      { name: 'id', type: FieldType.string, values: Array.from({ length: rows }, (_, row) => `n${row}`) },
      { name: 'title', type: FieldType.string, values: Array.from({ length: rows }, (_, row) => `node ${row}`) },
    ],
  });

describe('scoreRelations', () => {
  it('scores Good for a node-graph frame pair', () => {
    expect(scoreRelations(summaryOf(nodesFrame(3), edgesFrame(2)))).toBe(VisualizationSuggestionScore.Good);
  });

  it('scores Good for an edges-only frame', () => {
    expect(scoreRelations(summaryOf(edgesFrame(2)))).toBe(VisualizationSuggestionScore.Good);
  });

  it('scores Best for the nodeGraph preferred visualisation hint', () => {
    const frame = edgesFrame(2);

    expect(scoreRelations(summaryOf({ ...frame, meta: { preferredVisualisationType: 'nodeGraph' } }))).toBe(
      VisualizationSuggestionScore.Best
    );
  });

  it('does not fit an ordinary two-string-column table', () => {
    const frame = createDataFrame({
      fields: [
        { name: 'host', type: FieldType.string, values: ['a', 'b'] },
        { name: 'region', type: FieldType.string, values: ['eu', 'us'] },
      ],
    });

    expect(scoreRelations(summaryOf(frame))).toBeUndefined();
  });

  it('does not fit a lone nodes frame', () => {
    expect(scoreRelations(summaryOf(nodesFrame(3)))).toBeUndefined();
  });

  it(`fits at ${RELATIONS_MAX_EDGES} edges and withholds above the limit`, () => {
    expect(scoreRelations(summaryOf(edgesFrame(RELATIONS_MAX_EDGES)))).toBe(VisualizationSuggestionScore.Good);
    expect(scoreRelations(summaryOf(edgesFrame(RELATIONS_MAX_EDGES + 1)))).toBeUndefined();
  });

  it('does not fit an empty response', () => {
    expect(scoreRelations(summaryOf())).toBeUndefined();
  });
});

describe('Relations topology gates', () => {
  it('returns the best available node count', () => {
    expect(relationsNodeCount(summaryOf(nodesFrame(4), edgesFrame(2)))).toBe(4);
    expect(relationsNodeCount(summaryOf(edgesFrame(2)))).toBe(3);
    expect(relationsNodeCount(summaryOf())).toBeUndefined();
  });

  it('checks the Chord node budget', () => {
    expect(exceedsChordNodeBudget(summaryOf(nodesFrame(RELATIONS_CHORD_MAX_NODES), edgesFrame(2)))).toBe(false);
    expect(exceedsChordNodeBudget(summaryOf(nodesFrame(RELATIONS_CHORD_MAX_NODES + 1), edgesFrame(2)))).toBe(true);
    expect(exceedsChordNodeBudget(summaryOf())).toBe(false);
  });

  it('checks the Sankey node budget', () => {
    expect(fitsSankeyTopology(summaryOf(nodesFrame(RELATIONS_SANKEY_MAX_NODES), edgesFrame(2)))).toBe(true);
    expect(fitsSankeyTopology(summaryOf(nodesFrame(RELATIONS_SANKEY_MAX_NODES + 1), edgesFrame(2)))).toBe(false);
  });

  it('checks Sankey cycles and levels', () => {
    const cyclic = edgePairsFrame([
      ['a', 'b'],
      ['b', 'a'],
    ]);
    const deep = edgePairsFrame(
      Array.from({ length: RELATIONS_SANKEY_MAX_LEVELS }, (_, index) => [`n${index}`, `n${index + 1}`])
    );

    expect(fitsSankeyTopology(summaryOf(cyclic))).toBe(false);
    expect(fitsSankeyTopology(summaryOf(deep))).toBe(false);
    expect(fitsSankeyTopology(summaryOf())).toBe(true);
  });
});
