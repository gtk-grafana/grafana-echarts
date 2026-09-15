import {
  getChordEmphasis,
  getChordLabel,
  getChordLinkStyle,
  getChordSeries,
} from 'lib/echarts/relations/options/chord';

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

  it('routes the label through the node name, not the data index', () => {
    expect(getChordLabel(ctx())?.formatter).toBe('{b}');
  });

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
  it('focuses adjacency by default', () => {
    expect(getChordEmphasis(baseOptions())).toEqual({ focus: 'adjacency' });
  });

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

  it('never emits the sankey-only node geometry keys', () => {
    const series = getChordSeries(
      data(),
      ctx(baseOptions({ relationsSankeyNodeWidth: 40, relationsSankeyNodeGap: 20 }))
    );

    expect(series).not.toHaveProperty('nodeWidth');
    expect(series).not.toHaveProperty('nodeGap');
  });

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

  it('emits neither roam nor draggable, which chord does not implement', () => {
    const series = getChordSeries(data(), ctx(baseOptions({ relationsDraggable: true, relationsPan: true })));

    expect(series).not.toHaveProperty('roam');
    expect(series).not.toHaveProperty('draggable');
  });

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
