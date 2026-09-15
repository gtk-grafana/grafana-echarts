import {
  getSankeyDroppedNoticeText,
  getSankeyEmphasis,
  getSankeyLabel,
  getSankeyLinkStyle,
  getSankeyNodeAlign,
  getSankeyOrient,
  getSankeySeries,
} from 'lib/echarts/relations/options/sankey';
import {
  linkItems,
  nodeGraph,
  nodeItems,
  relationsOptions,
  relationsSeriesContext,
  relationsTheme,
} from 'test/relations';
import { type PanelOptions } from 'types';

import { type RelationsSeriesContext } from 'lib/echarts/relations/context';
const baseOptions = relationsOptions;

const ctx = (options: PanelOptions = baseOptions()): RelationsSeriesContext =>
  relationsSeriesContext({ options, seriesType: 'sankey' });

const data = nodeGraph;
const theme = relationsTheme;

describe('getSankeyOrient', () => {
  // Omitted at the ECharts default, per the repo-wide convention.
  it('omits the key at the horizontal default', () => {
    expect(getSankeyOrient(baseOptions())).toBeUndefined();
    expect(getSankeyOrient(baseOptions({ relationsSankeyOrient: 'horizontal' }))).toBeUndefined();
  });

  it('returns vertical when selected', () => {
    expect(getSankeyOrient(baseOptions({ relationsSankeyOrient: 'vertical' }))).toBe('vertical');
  });
});

describe('getSankeyNodeAlign', () => {
  it('emits the left default rather than omitting it', () => {
    expect(getSankeyNodeAlign(baseOptions())).toBe('left');
    expect(getSankeyNodeAlign(baseOptions({ relationsSankeyNodeAlign: 'left' }))).toBe('left');
  });

  it('returns an explicit alignment, including ECharts own default', () => {
    expect(getSankeyNodeAlign(baseOptions({ relationsSankeyNodeAlign: 'right' }))).toBe('right');
    expect(getSankeyNodeAlign(baseOptions({ relationsSankeyNodeAlign: 'justify' }))).toBe('justify');
  });
});

describe('getSankeyLabel', () => {
  it('shows themed labels by default', () => {
    const label = getSankeyLabel(ctx());

    expect(label?.show).toBe(true);
    expect(label?.color).toBe(theme.colors.text.primary);
  });

  it('keeps the ECharts label position on a horizontal flow', () => {
    expect(getSankeyLabel(ctx())?.position).toBe('right');
  });

  it('moves the label below the bar on a vertical flow', () => {
    expect(getSankeyLabel(ctx(baseOptions({ relationsSankeyOrient: 'vertical' })))?.position).toBe('bottom');
  });

  it('routes the label through the node name so titles are shown, not ids', () => {
    expect(getSankeyLabel(ctx())?.formatter).toBe('{b}');
  });

  it('swaps in the shared formatter when node values are switched on', () => {
    const formatter = getSankeyLabel(ctx(baseOptions({ relationsShowNodeValues: true })))?.formatter;

    expect(typeof formatter).toBe('function');
    // Sankey stores the stat in `stat`. ECharts uses `value` for flow.
    expect(
      typeof formatter === 'function'
        ? formatter({ name: 'Gateway', data: { id: 'gw', name: 'Gateway', stat: 1200 } } as never)
        : undefined
    ).toBe('Gateway\n1200');
  });

  it('hides labels when switched off', () => {
    expect(getSankeyLabel(ctx(baseOptions({ relationsShowNodeLabels: false })))).toEqual({ show: false });
  });
});

describe('getSankeyLinkStyle', () => {
  it('defaults the color mode to gradient', () => {
    expect(getSankeyLinkStyle(baseOptions())).toEqual({ color: 'gradient' });
  });

  it('honors an explicit color mode', () => {
    expect(getSankeyLinkStyle(baseOptions({ relationsLinkColor: 'source' })).color).toBe('source');
  });

  it('omits curveness and opacity at the ECharts defaults', () => {
    const lineStyle = getSankeyLinkStyle(
      baseOptions({ relationsSankeyCurveness: 0.5, relationsSankeyLinkOpacity: 0.2 })
    );

    expect(lineStyle).not.toHaveProperty('curveness');
    expect(lineStyle).not.toHaveProperty('opacity');
  });

  it('emits curveness and opacity when overridden', () => {
    const lineStyle = getSankeyLinkStyle(baseOptions({ relationsSankeyCurveness: 0, relationsSankeyLinkOpacity: 0.8 }));

    expect(lineStyle.curveness).toBe(0);
    expect(lineStyle.opacity).toBe(0.8);
  });
});

describe('getSankeyEmphasis', () => {
  it('focuses adjacency by default', () => {
    expect(getSankeyEmphasis(baseOptions())).toEqual({ focus: 'adjacency' });
  });

  it('omits the key when switched off, which is ECharts own sankey behaviour', () => {
    expect(getSankeyEmphasis(baseOptions({ relationsFocusAdjacency: false }))).toBeUndefined();
  });
});

describe('getSankeyDroppedNoticeText', () => {
  it('counts the dropped links, pluralised, and says nothing at zero', () => {
    expect(getSankeyDroppedNoticeText(0)).toBeUndefined();
    expect(getSankeyDroppedNoticeText(1)).toBe('1 link hidden to remove cycles');
    expect(getSankeyDroppedNoticeText(3)).toBe('3 links hidden to remove cycles');
  });
});

describe('getSankeySeries', () => {
  it('builds a sankey series from the shared node/link model', () => {
    const { series } = getSankeySeries(data(), ctx());

    expect(series.type).toBe('sankey');
    expect(nodeItems(series).map((node) => node.id)).toEqual(['a', 'b']);
    expect(linkItems(series)).toEqual([{ markId: 'e1', source: 'a', target: 'b', value: 5 }]);
  });

  it('omits every geometry key at its ECharts default', () => {
    const { series } = getSankeySeries(
      data(),
      ctx(
        baseOptions({
          relationsSankeyNodeWidth: 20,
          relationsSankeyNodeGap: 8,
          relationsSankeyLayoutIterations: 32,
        })
      )
    );

    expect(series).not.toHaveProperty('orient');
    expect(series).not.toHaveProperty('nodeWidth');
    expect(series).not.toHaveProperty('nodeGap');
    expect(series).not.toHaveProperty('layoutIterations');
    expect(series).toHaveProperty('nodeAlign', 'left');
    expect(series).not.toHaveProperty('edgeLabel');
  });

  it('emits geometry keys when overridden', () => {
    const { series } = getSankeySeries(
      data(),
      ctx(
        baseOptions({
          relationsSankeyNodeWidth: 30,
          relationsSankeyNodeGap: 16,
          relationsSankeyLayoutIterations: 0,
        })
      )
    );

    expect(series.nodeWidth).toBe(30);
    expect(series.nodeGap).toBe(16);
    expect(series.layoutIterations).toBe(0);
  });

  it('pins draggable and roam off, against the ECharts sankey default', () => {
    const { series } = getSankeySeries(data(), ctx());

    expect(series.draggable).toBe(false);
    expect(series.roam).toBe(false);
  });

  it('honors the interaction switches when enabled', () => {
    const { series } = getSankeySeries(data(), ctx(baseOptions({ relationsDraggable: true, relationsPan: true })));

    expect(series.draggable).toBe(true);
    expect(series.roam).toBe('move');
  });

  it('draws the ribbon weight when edge values are switched on', () => {
    const { series } = getSankeySeries(data(), ctx(baseOptions({ relationsShowEdgeValues: true })));

    expect(series.edgeLabel).toMatchObject({ show: true });
  });

  it('hides overlapping node labels by default', () => {
    expect(typeof getSankeySeries(data(), ctx()).series.labelLayout).toBe('function');
  });

  describe('remembered node positions', () => {
    const placed = () =>
      data({
        nodes: [
          { id: 'a', name: 'A', value: 1, fixedX: 0.25, fixedY: 0.5 },
          { id: 'b', name: 'B', value: 2 },
        ],
      });

    it('carries a stored fraction through as localX/localY', () => {
      const { series } = getSankeySeries(placed(), ctx());

      expect(nodeItems(series)[0]).toMatchObject({ localX: 0.25, localY: 0.5 });
      expect(nodeItems(series)[1]).not.toHaveProperty('localX');
    });

    it('ignores a coordinate that cannot be a fraction', () => {
      const pixels = data({ nodes: [{ id: 'a', name: 'A', value: 1, fixedX: 340, fixedY: 150 }] });

      expect(nodeItems(getSankeySeries(pixels, ctx()).series)[0]).not.toHaveProperty('localX');
    });

    it('needs both axes before it places anything', () => {
      const half = data({ nodes: [{ id: 'a', name: 'A', value: 1, fixedX: 0.25 }] });

      expect(nodeItems(getSankeySeries(half, ctx()).series)[0]).not.toHaveProperty('localX');
    });
  });

  it('carries mainstat as stat rather than value', () => {
    const { series } = getSankeySeries(data(), ctx());

    expect(nodeItems(series)[0].stat).toBe(1);
    expect(nodeItems(series)[0]).not.toHaveProperty('value');
  });

  it('drops per-edge thickness and strokedasharray', () => {
    const styled = data({
      links: [{ id: 'e1', source: 'a', target: 'b', value: 5, width: 4, lineType: 'dashed' as const }],
    });

    const { series } = getSankeySeries(styled, ctx());

    expect(linkItems(series)[0].lineStyle).toBeUndefined();
  });

  it('keeps a per-edge color', () => {
    const colored = data({ links: [{ id: 'e1', source: 'a', target: 'b', value: 5, color: 'red' }] });

    const { series } = getSankeySeries(colored, ctx());

    expect(linkItems(series)[0].lineStyle).toEqual({ color: 'red' });
  });

  it('drops noderadius and fixed coordinates', () => {
    const pinned = data({
      nodes: [{ id: 'a', name: 'A', value: 1, radius: 40, fixedX: 10, fixedY: 20 }],
    });

    const { series } = getSankeySeries(pinned, ctx());

    expect(nodeItems(series)[0]).not.toHaveProperty('symbolSize');
    expect(nodeItems(series)[0]).not.toHaveProperty('x');
    expect(nodeItems(series)[0]).not.toHaveProperty('y');
  });
});
