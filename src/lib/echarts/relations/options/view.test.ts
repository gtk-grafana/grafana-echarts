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

/**
 * Nodes reach this layer already coloured — the reader resolves every mark's colour
 * through its own display processor and palettes whatever is left
 * (`converters/readNodes.ts`), so a fixture that omitted `color` would not be one the
 * panel can produce. Colour *resolution* is tested there; this file only checks that
 * the resolved colour is painted.
 */
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

  // Pan is the only thing routed through `roam`: zoom is the panel's buttons, so the
  // scroll wheel is never bound and the dashboard can still be scrolled past.
  it('maps pan alone to move, and zoom alone to no roam at all', () => {
    expect(resolveRelationsRoam(baseOptions({ relationsPan: true }))).toBe('move');
    expect(resolveRelationsRoam(baseOptions({ relationsZoom: true }))).toBe(false);
    expect(resolveRelationsZoom(baseOptions({ relationsZoom: true }))).toBe(true);
  });

  /**
   * **Unset means off**, and each resolver reads only its own key.
   *
   * Neither switch carries a `defaultValue`, so any fallback that resolved an unset
   * option to `true` would render a panel with pan or zoom live while its control
   * displayed off — the control contradicting the panel.
   */
  it('treats an unset switch as off', () => {
    expect(resolveRelationsRoam(baseOptions())).toBe(false);
    expect(resolveRelationsZoom(baseOptions())).toBe(false);
    expect(resolveRelationsPan(baseOptions())).toBe(false);
  });
});

describe('getRelationsViewState', () => {
  // `zoom`/`center` are where ECharts keeps a `View`'s roam state, and the roam action
  // syncs them back onto the series model — so emitting them *is* restoring the view.
  it('restores the saved view when Remember view is on', () => {
    const saved = baseOptions({ relationsRememberView: true, relationsViewZoom: 2, relationsViewCenter: [10, 20] });

    expect(getRelationsViewState(saved)).toEqual({ zoom: 2, center: [10, 20] });
    expect(getGraphSeries(data(), ctx(saved))).toMatchObject({ zoom: 2, center: [10, 20] });
  });

  // The switch gates the *read* as well as the write, so turning it off restores the
  // default view rather than leaving the panel stuck at a pan nobody can see a control
  // for. `ADVANCED_RELATIONS_DEFAULTS` clears the switch in Default editor mode, which
  // is what makes that reachable.
  it('emits nothing when the switch is off, whatever was stored', () => {
    const stored = baseOptions({ relationsViewZoom: 2, relationsViewCenter: [10, 20] });

    expect(getRelationsViewState(stored)).toEqual({});
    expect(getGraphSeries(data(), ctx(stored))).not.toHaveProperty('zoom');
  });

  it('emits only what has been stored so far', () => {
    expect(getRelationsViewState(baseOptions({ relationsRememberView: true }))).toEqual({});
  });
});
