import { getChordEmphasis, getChordLabel, getChordLinkStyle, getChordSeries } from 'lib/echarts/options/chord';
import { type RelationsSeriesContext } from 'lib/echarts/options/graph';
import {
  linkItems,
  nodeGraph,
  nodeItems,
  relationsOptions,
  relationsSeriesContext,
  relationsTheme,
} from 'test/relations';
import { type PanelOptions } from 'types';

const theme = relationsTheme;

const baseOptions = relationsOptions;

const ctx = (options: PanelOptions = baseOptions()): RelationsSeriesContext =>
  relationsSeriesContext({ options, seriesType: 'chord' });

const data = nodeGraph;

describe('getChordLabel', () => {
  it('shows themed labels by default', () => {
    const label = getChordLabel(ctx());

    expect(label?.show).toBe(true);
    expect(label?.color).toBe(theme.colors.text.primary);
  });

  // `ChordPiece` passes `defaultText: node.dataIndex + ''`, so without a formatter the
  // labels are raw numeric indices. Its fallback — using the item's `name` as a
  // *formatter string* — would also misread a node named `{svc}` as a template.
  it('routes the label through the node name, not the data index', () => {
    expect(getChordLabel(ctx())?.formatter).toBe('{b}');
  });

  // The shared formatter reads `params.name`, so the index-labelling bug above stays
  // fixed while the stat is appended.
  it('swaps in the shared formatter when node values are switched on', () => {
    const formatter = getChordLabel(ctx(baseOptions({ relationsShowNodeValues: true })))?.formatter;

    expect(typeof formatter).toBe('function');
    expect(
      typeof formatter === 'function'
        ? formatter({ name: 'us-east', data: { id: 'us-east', name: 'us-east', stat: 420 } } as never)
        : undefined
    ).toBe('us-east\n420');
  });

  // `position: 'outside'` is ECharts' own chord default and is left alone.
  it('does not override the ECharts label position', () => {
    expect(getChordLabel(ctx())).not.toHaveProperty('position');
  });

  it('hides labels when switched off', () => {
    expect(getChordLabel(ctx(baseOptions({ relationsShowNodeLabels: false })))).toEqual({ show: false });
  });
});

describe('getChordLinkStyle', () => {
  /**
   * **The reported bug**: a chord nobody had configured drew ribbons with no fill.
   *
   * The family default is `gradient`, and `ChordEdge.applyEdgeFill` does implement the
   * keyword — but the ribbon it produces paints nothing in a browser, so the default
   * chord was empty outlines. It degrades to `source`, which is also ECharts' own chord
   * default, so the key is omitted entirely.
   *
   * The three ways of arriving at "nothing to say" are one case, because they are one
   * claim: the whole `lineStyle` is omitted whenever every key on it would have matched
   * an ECharts default. `LabelManager` and the series builder both treat an empty object
   * and an absent one identically, so omitting is what says it.
   */
  it('omits the whole key whenever nothing differs from the ECharts defaults', () => {
    // The family default, `gradient`, degraded to `source`…
    expect(getChordLinkStyle(baseOptions())).toBeUndefined();
    expect(getChordLinkStyle(baseOptions({ relationsLinkColor: 'gradient' }))).toBeUndefined();
    // …the same mode chosen explicitly…
    expect(getChordLinkStyle(baseOptions({ relationsLinkColor: 'source' }))).toBeUndefined();
    // …and an opacity that is already ECharts' own.
    expect(getChordLinkStyle(baseOptions({ relationsChordLinkOpacity: 0.2 }))).toBeUndefined();
  });

  it('emits an explicitly chosen mode', () => {
    expect(getChordLinkStyle(baseOptions({ relationsLinkColor: 'target' }))).toEqual({ color: 'target' });
  });

  // Paired with a non-default colour so the assertion is about `opacity` alone: on the
  // default colour every key is omitted and the whole `lineStyle` disappears.
  it('omits opacity at the ECharts default', () => {
    expect(
      getChordLinkStyle(baseOptions({ relationsLinkColor: 'target', relationsChordLinkOpacity: 0.2 }))
    ).not.toHaveProperty('opacity');
  });

  it('emits an overridden opacity', () => {
    expect(getChordLinkStyle(baseOptions({ relationsChordLinkOpacity: 0.75 }))).toMatchObject({ opacity: 0.75 });
  });
});

describe('getChordEmphasis', () => {
  // The family default is adjacency now, which is also ECharts' own chord default, so
  // the two finally agree out of the box.
  it('focuses adjacency by default', () => {
    expect(getChordEmphasis(baseOptions())).toEqual({ focus: 'adjacency' });
  });

  // Still always emitted: omitting it would leave ECharts' adjacency highlighting
  // active while the switch reads off, and the control would be lying.
  it('pins focus to none when the switch is off, against the ECharts default', () => {
    expect(getChordEmphasis(baseOptions({ relationsFocusAdjacency: false }))).toEqual({ focus: 'none' });
  });
});

describe('getChordSeries', () => {
  it('builds a chord series from the shared node/link model', () => {
    const series = getChordSeries(data(), ctx());

    expect(series.type).toBe('chord');
    expect(nodeItems(series).map((node) => node.id)).toEqual(['a', 'b']);
    expect(linkItems(series)).toEqual([{ markId: 'e1', source: 'a', target: 'b', value: 5 }]);
  });

  it('omits every ring key at its ECharts default', () => {
    const series = getChordSeries(
      data(),
      ctx(
        baseOptions({
          relationsChordStartAngle: 90,
          relationsChordClockwise: true,
          relationsChordPadAngle: 3,
          relationsChordMinAngle: 0,
        })
      )
    );

    expect(series).not.toHaveProperty('startAngle');
    expect(series).not.toHaveProperty('clockwise');
    expect(series).not.toHaveProperty('padAngle');
    expect(series).not.toHaveProperty('minAngle');
  });

  it('emits ring keys when overridden', () => {
    const series = getChordSeries(
      data(),
      ctx(
        baseOptions({
          relationsChordStartAngle: 0,
          relationsChordClockwise: false,
          relationsChordPadAngle: 8,
          relationsChordMinAngle: 2,
        })
      )
    );

    expect(series.startAngle).toBe(0);
    expect(series.clockwise).toBe(false);
    expect(series.padAngle).toBe(8);
    expect(series.minAngle).toBe(2);
  });

  // `series.chord` has no `nodeWidth`/`nodeGap` — they are sankey keys. Wiring them by
  // analogy would have produced two controls that silently do nothing.
  it('never emits the sankey-only node geometry keys', () => {
    const series = getChordSeries(
      data(),
      ctx(baseOptions({ relationsSankeyNodeWidth: 40, relationsSankeyNodeGap: 20 }))
    );

    expect(series).not.toHaveProperty('nodeWidth');
    expect(series).not.toHaveProperty('nodeGap');
  });

  // `chordLayout` takes `Math.max(declaredValue, edgeSum)`, so a declared value is an
  // arc-angle floor — the same trap as sankey.
  it('carries mainstat as stat rather than value', () => {
    const series = getChordSeries(data(), ctx());

    expect(nodeItems(series)[0].stat).toBe(1);
    expect(nodeItems(series)[0]).not.toHaveProperty('value');
  });

  it('drops per-edge thickness and strokedasharray but keeps color', () => {
    const styled = data({
      links: [{ id: 'e1', source: 'a', target: 'b', value: 5, width: 4, lineType: 'dashed' as const, color: 'red' }],
    });

    expect(linkItems(getChordSeries(styled, ctx()))[0].lineStyle).toEqual({ color: 'red' });
  });

  it('drops noderadius and fixed coordinates', () => {
    const pinned = data({ nodes: [{ id: 'a', name: 'A', value: 1, radius: 40, fixedX: 10, fixedY: 20 }] });
    const series = getChordSeries(pinned, ctx());

    expect(nodeItems(series)[0]).not.toHaveProperty('symbolSize');
    expect(nodeItems(series)[0]).not.toHaveProperty('x');
    expect(nodeItems(series)[0]).not.toHaveProperty('y');
  });

  // Neither key is emitted. `ChordSeries` declares no `draggable` and no `roam` — it
  // pins `coordinateSystem: 'none'`, so there is no view to move or scale and the two
  // switches were writing keys nothing reads. The panel hides them on chord instead.
  it('emits neither roam nor draggable, which chord does not implement', () => {
    const series = getChordSeries(data(), ctx(baseOptions({ relationsDraggable: true, relationsPan: true })));

    expect(series).not.toHaveProperty('roam');
    expect(series).not.toHaveProperty('draggable');
  });

  // A ring of small arcs is exactly where labels pile up, and `series.chord` has no
  // `avoidLabelOverlap` of its own — the shared label-layout stage is the answer.
  it('hides overlapping labels by default', () => {
    expect(typeof getChordSeries(data(), ctx()).labelLayout).toBe('function');
    expect(getChordSeries(data(), ctx(baseOptions({ relationsHideOverlappingLabels: false })))).not.toHaveProperty(
      'labelLayout'
    );
  });

  // The headline difference from sankey: no DAG restriction, so nothing is rewritten.
  describe('cycles', () => {
    it('passes a cyclic link set through untouched', () => {
      const cyclic = data({
        links: [
          { id: 'e1', source: 'a', target: 'b', value: 1 },
          { id: 'e2', source: 'b', target: 'a', value: 2 },
        ],
      });

      const series = getChordSeries(cyclic, ctx());

      expect(linkItems(series)).toEqual([
        { markId: 'e1', source: 'a', target: 'b', value: 1 },
        { markId: 'e2', source: 'b', target: 'a', value: 2 },
      ]);
    });

    it('keeps a self-loop, which a sankey would have to drop', () => {
      const selfLoop = data({ links: [{ id: 'e1', source: 'a', target: 'a', value: 3 }] });

      expect(linkItems(getChordSeries(selfLoop, ctx()))).toEqual([
        { markId: 'e1', source: 'a', target: 'a', value: 3 },
      ]);
    });
  });
});

// The Advanced-tier reset is not tested per-family any more. It was, twice, under the
// same `editor-mode normalization` describe name in this file and in `sankey.test.ts` —
// two copies of one claim, neither of which could see the dispatch that routes a
// `seriesType` to a tier. `options/editorMode.test.ts` now covers every family's tier
// and the dispatch itself, and `editor/relations/advancedTier.test.ts` checks that the
// tier and the registered Advanced controls name the same options.
