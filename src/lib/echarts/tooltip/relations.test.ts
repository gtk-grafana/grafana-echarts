import { createTheme, type DataFrame, FieldType, toDataFrame, type ValueFormatter } from '@grafana/data';
import { type TopLevelFormatterParams } from 'echarts/types/dist/shared';
import { GRAPH_EDGES_WIDE, GRAPH_NODES_WIDE } from 'lib/echarts/converters/graphWide';
import { frameToRelationsGraph } from 'lib/echarts/converters/relationsGraph';
import { buildRelationsTooltipModel, getRelationsTooltipMarks } from 'lib/echarts/tooltip/relations';
import { type RelationsLinkItem, type RelationsNodeItem, type TooltipModel } from 'lib/echarts/tooltip/types';

const theme = createTheme();

/** Marks the panel formatter, so a fallback is unmistakable in an assertion. */
const panelFormatValue: ValueFormatter = (value) => ({ text: `panel:${value}` });

// ECharts formatter params carry more fields at runtime than the base type; only the
// ones the relations formatter reads are set here (`data`, `color`, `name`).
const asParams = (params: unknown) => params as TopLevelFormatterParams;

/**
 * Two nodes with **different units**, which is the case the row form cannot express
 * at all: `mainstat` is one column, so one unit covers every node.
 */
const wideNodes = (): DataFrame =>
  toDataFrame({
    name: 'nodes',
    meta: { type: GRAPH_NODES_WIDE },
    fields: [
      { name: 'gateway', type: FieldType.number, values: [12], config: { unit: 'ms', decimals: 1 } },
      { name: 'db', type: FieldType.number, values: [0.42], config: { unit: 'percentunit', decimals: 0 } },
    ],
  });

/**
 * Two **parallel** edges over the same pair, each with its own unit and its own link.
 * They are why an edge is looked up by `markId` rather than by its endpoints.
 */
const wideEdges = (): DataFrame =>
  toDataFrame({
    name: 'edges',
    meta: { type: GRAPH_EDGES_WIDE },
    fields: [
      {
        name: 'e1',
        type: FieldType.number,
        labels: { source: 'gateway', target: 'db' },
        values: [3.5],
        config: { unit: 's', decimals: 2, links: [{ title: 'Trace e1', url: 'http://example.com/e1' }] },
      },
      {
        name: 'e2',
        type: FieldType.number,
        labels: { source: 'gateway', target: 'db' },
        values: [25],
        config: { unit: 'percent', decimals: 1 },
      },
    ],
  });

const modelFor = (frames: DataFrame[]): ((params: TopLevelFormatterParams) => TooltipModel) => {
  const data = frameToRelationsGraph(frames, theme);
  if (!data) {
    throw new Error('fixture produced no graph');
  }
  return buildRelationsTooltipModel({
    formatValue: panelFormatValue,
    marks: getRelationsTooltipMarks(data, theme, 'utc'),
  });
};

/** A hovered node, as the graph variant emits it. */
const nodeParams = (item: RelationsNodeItem) => asParams({ data: item, color: '#ffffff' });
/** A hovered edge, as all three variants emit it. */
const linkParams = (item: RelationsLinkItem) => asParams({ data: item, color: '#ffffff', dataType: 'edge' });

describe('buildRelationsTooltipModel', () => {
  /**
   * Item 13 of `todo/graph-wide-migration.md`: "tooltip unit decided by frame order"
   * was the frame's *first* numeric field formatting every mark. A mark is a field
   * now, so each one formats with its own unit and decimals.
   */
  describe('per-mark formatting', () => {
    it('formats each node with its own unit and decimals', () => {
      const model = modelFor([wideNodes(), wideEdges()]);

      expect(model(nodeParams({ id: 'gateway', name: 'gateway', value: 12 })).rows[0].value).toBe('12.0 ms');
      expect(model(nodeParams({ id: 'db', name: 'db', value: 0.42 })).rows[0].value).toBe('42%');
    });

    it('formats an edge with the edge field’s unit, not the nodes frame’s', () => {
      const model = modelFor([wideNodes(), wideEdges()]);

      const link = model(linkParams({ source: 'gateway', target: 'db', markId: 'e1', value: 3.5 }));

      expect(link.header).toEqual({ label: 'gateway → db', value: '' });
      expect(link.rows[0].value).toBe('3.50 s');
    });

    // Two edges joining the same pair are indistinguishable by endpoint, which is
    // exactly why the item carries the edge's field name.
    it('tells parallel edges apart by their mark id', () => {
      const model = modelFor([wideNodes(), wideEdges()]);

      expect(model(linkParams({ source: 'gateway', target: 'db', markId: 'e2', value: 25 })).rows[0].value).toBe(
        '25.0%'
      );
    });

    // Sankey and chord leave `value` to ECharts' flow computation and carry the stat
    // as `stat`; it must format through the same mark.
    it('formats the sankey/chord `stat` through the hovered node’s field', () => {
      const model = modelFor([wideNodes(), wideEdges()]);

      expect(model(nodeParams({ id: 'gateway', name: 'gateway', stat: 12 })).rows[0].value).toBe('12.0 ms');
    });
  });

  /**
   * Item 14, and gaps 1-3 of `todo/relations-data-links.md`: the footer used to
   * resolve one field for the whole series, so a link configured anywhere painted
   * everywhere. The source is now the hovered mark's own field.
   */
  describe('per-mark data links', () => {
    it('resolves a node back to its own field and row', () => {
      const model = modelFor([wideNodes(), wideEdges()]);

      expect(model(nodeParams({ id: 'db', name: 'db', value: 0.42 })).source).toEqual({
        field: expect.objectContaining({ name: 'db' }),
        rowIndex: 0,
      });
    });

    it('resolves an edge back to its own field, not a node’s', () => {
      const model = modelFor([wideNodes(), wideEdges()]);

      const link = model(linkParams({ source: 'gateway', target: 'db', markId: 'e1', value: 3.5 }));

      expect(link.source?.field.name).toBe('e1');
      expect(link.source?.field.config.links).toEqual([{ title: 'Trace e1', url: 'http://example.com/e1' }]);
      // The row carries the same source, so a pinned tooltip resolves links from
      // either the model or the clicked row.
      expect(link.rows[0].source).toBe(link.source);
    });

    /**
     * Gap 4, which the contract does **not** close: a node derived from an edge's
     * endpoints has no field, so there is nothing for an override to land on. It
     * falls back to the panel formatter and renders no footer.
     */
    it('gives a derived node no source, and the panel formatter', () => {
      const model = modelFor([wideEdges()]);

      const node = model(nodeParams({ id: 'gateway', name: 'gateway', value: 2 }));

      expect(node.source).toBeUndefined();
      expect(node.rows[0].value).toBe('panel:2');
    });
  });

  describe('rows', () => {
    it('adds subtitle and secondary rows when the mark carries them', () => {
      const model = modelFor([wideNodes(), wideEdges()]);

      const node = model(
        nodeParams({ id: 'gateway', name: 'Gateway', value: 12, subtitle: 'eu-west', secondary: '3 errors' })
      );

      expect(node.header).toEqual({ label: 'Gateway', value: '' });
      expect(node.rows.map((row) => [row.label, row.value])).toEqual([
        ['Value', '12.0 ms'],
        ['Subtitle', 'eu-west'],
        ['Secondary', '3 errors'],
      ]);
    });

    it('keeps the hovered colour as the value row’s swatch', () => {
      const model = modelFor([wideNodes(), wideEdges()]);

      expect(model(nodeParams({ id: 'db', name: 'db', value: 0.42 })).rows[0].color).toBe('#ffffff');
    });
  });
});

describe('getRelationsTooltipMarks', () => {
  it('keys nodes and edges separately, so a shared name cannot collide', () => {
    // A node and an edge both called `e1`: legal, since they live in different frames.
    const nodes = toDataFrame({
      meta: { type: GRAPH_NODES_WIDE },
      fields: [
        { name: 'e1', type: FieldType.number, values: [1], config: { unit: 'ms', decimals: 0 } },
        { name: 'b', type: FieldType.number, values: [2] },
      ],
    });
    const edges = toDataFrame({
      meta: { type: GRAPH_EDGES_WIDE },
      fields: [
        {
          name: 'e1',
          type: FieldType.number,
          labels: { source: 'e1', target: 'b' },
          values: [5],
          config: { unit: 'percent', decimals: 0 },
        },
      ],
    });

    const data = frameToRelationsGraph([nodes, edges], theme);
    const marks = getRelationsTooltipMarks(data!, theme, 'utc');

    expect(marks.nodes.get('e1')?.source.field.config.unit).toBe('ms');
    expect(marks.links.get('e1')?.source.field.config.unit).toBe('percent');
  });

  it('holds no entry for a mark with no field, so the lookup misses cleanly', () => {
    const data = frameToRelationsGraph([wideEdges()], theme);

    expect(getRelationsTooltipMarks(data!, theme, 'utc').nodes.size).toBe(0);
  });
});
