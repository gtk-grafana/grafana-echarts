import { type RelationsChartContext } from 'lib/echarts/charts/types';
import { type NodeGraphData } from 'lib/echarts/relations/converters/model';
import { getGraphSeries } from 'lib/echarts/relations/options/graph';
import {
  getRelationsViewState,
  resolveRelationsPan,
  resolveRelationsRoam,
  resolveRelationsZoom,
} from 'lib/echarts/relations/options/view';
import { getPaletteColorByIndex } from 'lib/echarts/style';
import { nodeGraph, relationsContext, relationsOptions, relationsTheme } from 'test/relations';
import { type PanelOptions } from 'types';

const theme = relationsTheme;

const baseOptions = relationsOptions;

const ctx = (options: PanelOptions = baseOptions()): RelationsChartContext =>
  relationsContext({ options, seriesType: 'graph' });

const data = (extra: Partial<NodeGraphData> = {}): NodeGraphData =>
  nodeGraph({
    nodes: [
      { id: 'a', name: 'A', value: 1, color: getPaletteColorByIndex(0, theme) },
      { id: 'b', name: 'B', value: 2, color: getPaletteColorByIndex(1, theme) },
    ],
    ...extra,
  });

describe('resolveRelationsRoam / resolveRelationsZoom', () => {
  it('keeps both off by default', () => {
    expect(resolveRelationsRoam(baseOptions())).toBe(false);
    expect(resolveRelationsZoom(baseOptions())).toBe(false);
  });

  it('maps pan alone to move, and zoom alone to no roam at all', () => {
    expect(resolveRelationsRoam(baseOptions({ relationsPan: true }))).toBe('move');
    expect(resolveRelationsRoam(baseOptions({ relationsZoom: true }))).toBe(false);
    expect(resolveRelationsZoom(baseOptions({ relationsZoom: true }))).toBe(true);
  });

  it('treats an unset switch as off', () => {
    expect(resolveRelationsRoam(baseOptions())).toBe(false);
    expect(resolveRelationsZoom(baseOptions())).toBe(false);
    expect(resolveRelationsPan(baseOptions())).toBe(false);
  });
});

describe('getRelationsViewState', () => {
  it('restores the saved view when Remember view is on', () => {
    const saved = baseOptions({ relationsRememberView: true, relationsViewZoom: 2, relationsViewCenter: [10, 20] });

    expect(getRelationsViewState(saved)).toEqual({ zoom: 2, center: [10, 20] });
    expect(getGraphSeries(data(), ctx(saved))).toMatchObject({ zoom: 2, center: [10, 20] });
  });

  it('emits nothing when the switch is off, whatever was stored', () => {
    const stored = baseOptions({ relationsViewZoom: 2, relationsViewCenter: [10, 20] });

    expect(getRelationsViewState(stored)).toEqual({});
    expect(getGraphSeries(data(), ctx(stored))).not.toHaveProperty('zoom');
  });

  it('emits only what has been stored so far', () => {
    expect(getRelationsViewState(baseOptions({ relationsRememberView: true }))).toEqual({});
  });
});
