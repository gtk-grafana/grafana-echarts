import { type RelationsSeriesContext } from 'lib/echarts/options/graph';
import {
  getSankeyDroppedNoticeText,
  getSankeyEmphasis,
  getSankeyLabel,
  getSankeyLinkStyle,
  getSankeyNodeAlign,
  getSankeyOrient,
  getSankeySeries,
} from 'lib/echarts/options/sankey';
import {
  linkItems,
  nodeGraph,
  nodeItems,
  relationsOptions,
  relationsSeriesContext,
  relationsTheme,
} from 'test/relations';
import { type PanelOptions } from 'types';

const baseOptions = relationsOptions;

const ctx = (options: PanelOptions = baseOptions()): RelationsSeriesContext =>
  relationsSeriesContext({ options, seriesType: 'sankey' });

const data = nodeGraph;
const theme = relationsTheme;

// The Advanced-tier reset is not tested per-family any more. It was, twice, under the
// same `editor-mode normalization` describe name in this file and in `chord.test.ts` —
// two copies of one claim, neither of which could see the dispatch that routes a
// `seriesType` to a tier. `options/editorMode.test.ts` now covers every family's tier
// and the dispatch itself, and `editor/relations/advancedTier.test.ts` checks that the
// tier and the registered Advanced controls name the same options.

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
  it('omits the key at the justify default', () => {
    expect(getSankeyNodeAlign(baseOptions())).toBeUndefined();
    expect(getSankeyNodeAlign(baseOptions({ relationsSankeyNodeAlign: 'justify' }))).toBeUndefined();
  });

  it('returns an explicit alignment', () => {
    expect(getSankeyNodeAlign(baseOptions({ relationsSankeyNodeAlign: 'left' }))).toBe('left');
  });
});

describe('getSankeyLabel', () => {
  it('shows themed labels by default', () => {
    const label = getSankeyLabel(ctx());

    expect(label?.show).toBe(true);
    expect(label?.color).toBe(theme.colors.text.primary);
  });

  // Horizontally, `right` is ECharts' own default and the right answer: the node
  // columns are separated by the ribbon area, so a label to the right of a bar has
  // nothing but ribbons behind it.
  it('keeps the ECharts label position on a horizontal flow', () => {
    expect(getSankeyLabel(ctx())?.position).toBe('right');
  });

  // Vertically it is the wrong answer, and geometrically so: the bars now run *along*
  // the row, `nodeGap` (8px) apart, so a label 5px to the right of one is drawn over
  // the next node's fill — unreadable against a saturated colour and colliding with
  // that node's own label. `bottom` puts it in the ribbon gap instead.
  it('moves the label below the bar on a vertical flow', () => {
    expect(getSankeyLabel(ctx(baseOptions({ relationsSankeyOrient: 'vertical' })))?.position).toBe('bottom');
  });

  // `SankeyView` labels a node with `defaultText: node.id` — the graph key, which the
  // converter sets from the frame's `id` so links resolve. Without this formatter a
  // nodes frame's human-readable `title` would never reach the label. `'{b}'` is the
  // data name, which is where `title` lands.
  it('routes the label through the node name so titles are shown, not ids', () => {
    expect(getSankeyLabel(ctx())?.formatter).toBe('{b}');
  });

  // The shared formatter reads `params.name` — the same value `'{b}'` resolves to —
  // so swapping it in keeps titles working while adding the stat.
  it('swaps in the shared formatter when node values are switched on', () => {
    const formatter = getSankeyLabel(ctx(baseOptions({ relationsShowNodeValues: true })))?.formatter;

    expect(typeof formatter).toBe('function');
    // A sankey carries its stat as `stat`; `value` is ECharts' flow computation.
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
  // The family default deliberately overrides ECharts' neutral gray so ribbons
  // inherit node colors, as the graph variant's edges do.
  // `SankeyView` implements `source`/`target`/`gradient` itself, so the family default
  // passes straight through — no per-link work, unlike the graph variant.
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

// One case for three counts, because there is one claim: the count, pluralised, and
// nothing at all at zero. `charts/relations.test.ts` asserts the same string end to end
// through `getNotices`, so what is left here is only the branch that has no other
// coverage — the plural.
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
    expect(series).not.toHaveProperty('nodeAlign');
    expect(series).not.toHaveProperty('nodeWidth');
    expect(series).not.toHaveProperty('nodeGap');
    expect(series).not.toHaveProperty('layoutIterations');
    // `emphasis` is not in this list: adjacency focus is on by default now, so the key
    // is emitted — see `getSankeyEmphasis`.
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

  // ECharts defaults a sankey to `draggable: true`, unlike `graph`. Both variants
  // must be static out of the box, so the key is pinned rather than omitted.
  it('pins draggable and roam off, against the ECharts sankey default', () => {
    const { series } = getSankeySeries(data(), ctx());

    expect(series.draggable).toBe(false);
    expect(series.roam).toBe(false);
  });

  // `roam` is pan only: zoom is driven by the panel's buttons, so the wheel is never
  // bound and the dashboard can still be scrolled past the panel.
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

  /**
   * A dragged sankey node is remembered in the same `custom.fixedX`/`fixedY` pair as a
   * dragged graph node — a mark has one place to record where it was put — but a
   * sankey has no coordinate space to pin one in and reads a **fraction** of the
   * layout rect instead. See `useRelationsPersistence`.
   */
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

    // The range check is what keeps the shared field pair honest: a graph position
    // (pixels) reinterpreted as a fraction would put the node whole layout-widths off
    // screen, so a value outside 0-1 means "not a sankey position".
    it('ignores a coordinate that cannot be a fraction', () => {
      const pixels = data({ nodes: [{ id: 'a', name: 'A', value: 1, fixedX: 340, fixedY: 150 }] });

      expect(nodeItems(getSankeySeries(pixels, ctx()).series)[0]).not.toHaveProperty('localX');
    });

    it('needs both axes before it places anything', () => {
      const half = data({ nodes: [{ id: 'a', name: 'A', value: 1, fixedX: 0.25 }] });

      expect(nodeItems(getSankeySeries(half, ctx()).series)[0]).not.toHaveProperty('localX');
    });
  });

  // A declared node `value` acts as a floor in ECharts' `computeNodeValues`
  // (`Math.max(inSum, outSum, nodeRawValue)`), so a `mainstat` unrelated to the flow
  // would inflate the node past its own ribbons. It rides as `stat` instead.
  it('carries mainstat as stat rather than value', () => {
    const { series } = getSankeySeries(data(), ctx());

    expect(nodeItems(series)[0].stat).toBe(1);
    expect(nodeItems(series)[0]).not.toHaveProperty('value');
  });

  // Both are graph-only: ribbon size comes from the weight, and a filled ribbon has
  // no stroke to dash.
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

  // Graph-only node keys: `noderadius` and `fixedx`/`fixedy` have no sankey meaning
  // (a sankey positions with localX/localY/depth, not pixel coordinates).
  it('drops noderadius and fixed coordinates', () => {
    const pinned = data({
      nodes: [{ id: 'a', name: 'A', value: 1, radius: 40, fixedX: 10, fixedY: 20 }],
    });

    const { series } = getSankeySeries(pinned, ctx());

    expect(nodeItems(series)[0]).not.toHaveProperty('symbolSize');
    expect(nodeItems(series)[0]).not.toHaveProperty('x');
    expect(nodeItems(series)[0]).not.toHaveProperty('y');
  });

  /**
   * **The cycle policy is not tested here.** It was, in a `cycle policy` describe that
   * restated what its two neighbours already say: `converters/dag.test.ts` tests the
   * algorithm itself (which back-edge is dropped, that self-loops go, that the node set
   * is untouched), and `charts/relations.test.ts` tests the whole answer a panel gives
   * — the surviving links *and* the "1 link hidden to remove cycles" notice — through
   * `buildOption`. `relations sankey base a cyclic edge set` renders it. Four layers for
   * one policy is three too many; the two that state something the others cannot are
   * the algorithm and the picture.
   */
});
