import { createDataFrame, FieldType, getPanelDataSummary } from '@grafana/data';
import {
  RELATIONS_CHORD_MAX_NODES,
  RELATIONS_SANKEY_MAX_LEVELS,
  RELATIONS_SANKEY_MAX_NODES,
} from 'lib/echarts/charts/suggestionLimits';
import { type PanelOptions } from 'types';
import { RELATIONS_PRESET_BASE, relationsPresetsSupplier } from './presets';

const edgesFrame = (rows: number, times?: number[]) =>
  createDataFrame({
    name: 'edges',
    fields: [
      ...(times == null ? [] : [{ name: 'time', type: FieldType.time, values: times }]),
      { name: 'id', type: FieldType.string, values: Array.from({ length: rows }, (_, row) => `e${row}`) },
      { name: 'source', type: FieldType.string, values: Array.from({ length: rows }, (_, row) => `n${row}`) },
      { name: 'target', type: FieldType.string, values: Array.from({ length: rows }, (_, row) => `n${row + 1}`) },
      { name: 'mainstat', type: FieldType.number, values: Array.from({ length: rows }, (_, row) => row + 1) },
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

const edgePairsFrame = (pairs: Array<[string, string]>) =>
  createDataFrame({
    name: 'edges',
    fields: [
      { name: 'id', type: FieldType.string, values: pairs.map((_, row) => `e${row}`) },
      { name: 'source', type: FieldType.string, values: pairs.map(([source]) => source) },
      { name: 'target', type: FieldType.string, values: pairs.map(([, target]) => target) },
      { name: 'mainstat', type: FieldType.number, values: pairs.map((_, row) => row + 1) },
    ],
  });

const rangedSummary = () => getPanelDataSummary([nodesFrame(3), edgesFrame(2, [0, 1000])]);

describe('relationsPresetsSupplier', () => {
  it('returns all four presets in order for a small ranged graph', () => {
    const presets = relationsPresetsSupplier({ dataSummary: rangedSummary() });

    expect(presets?.map(({ name, description }) => ({ name, description }))).toEqual([
      { name: 'Service topology', description: 'Show service dependencies and their direction.' },
      { name: 'Weighted flow', description: 'Show how weighted flow moves through a process.' },
      { name: 'Mutual relations', description: 'Show dense or cyclic traffic between pairs.' },
      { name: 'Time network', description: 'Show how a network changes over a time range.' },
    ]);
  });

  it.each([
    ['instant data', getPanelDataSummary([edgesFrame(2, [0, 0])])],
    ['timeless data', getPanelDataSummary([edgesFrame(2)])],
  ])('omits Time network for %s', (_name, dataSummary) => {
    expect(relationsPresetsSupplier({ dataSummary })?.map(({ name }) => name)).toEqual([
      'Service topology',
      'Weighted flow',
      'Mutual relations',
    ]);
  });

  it('omits Mutual relations above the Chord node budget', () => {
    const dataSummary = getPanelDataSummary([nodesFrame(RELATIONS_CHORD_MAX_NODES + 1), edgesFrame(2, [0, 1000])]);

    expect(relationsPresetsSupplier({ dataSummary })?.map(({ name }) => name)).toEqual([
      'Service topology',
      'Weighted flow',
      'Time network',
    ]);
  });

  it('omits Weighted flow for cyclic data', () => {
    const dataSummary = getPanelDataSummary([
      edgePairsFrame([
        ['a', 'b'],
        ['b', 'c'],
        ['c', 'a'],
      ]),
    ]);

    expect(relationsPresetsSupplier({ dataSummary })?.map(({ name }) => name)).toEqual([
      'Service topology',
      'Mutual relations',
    ]);
  });

  it('omits Weighted flow above the Sankey node and level budgets', () => {
    const tooManyNodes = getPanelDataSummary([nodesFrame(RELATIONS_SANKEY_MAX_NODES + 1), edgesFrame(2)]);
    const deepPairs = Array.from({ length: RELATIONS_SANKEY_MAX_LEVELS }, (_, index) => [
      `n${index}`,
      `n${index + 1}`,
    ]) as Array<[string, string]>;
    const tooManyLevels = getPanelDataSummary([edgePairsFrame(deepPairs)]);

    expect(relationsPresetsSupplier({ dataSummary: tooManyNodes })?.map(({ name }) => name)).toEqual([
      'Service topology',
    ]);
    expect(relationsPresetsSupplier({ dataSummary: tooManyLevels })?.map(({ name }) => name)).toEqual([
      'Service topology',
      'Mutual relations',
    ]);
  });

  it('adapts graph presets to medium and large node counts', () => {
    const medium = relationsPresetsSupplier({
      dataSummary: getPanelDataSummary([nodesFrame(25), edgesFrame(2, [0, 1000])]),
    })!;
    const large = relationsPresetsSupplier({
      dataSummary: getPanelDataSummary([nodesFrame(60), edgesFrame(2, [0, 1000])]),
    })!;

    expect(medium.find(({ name }) => name === 'Service topology')?.options).toMatchObject({
      relationsNodeSize: 16,
      relationsShowNodeLabels: true,
      relationsRepulsion: 300,
      relationsEdgeLength: 150,
    });
    expect(medium.find(({ name }) => name === 'Time network')?.options).toMatchObject({
      relationsNodeSize: 16,
      relationsShowNodeLabels: true,
      relationsRepulsion: 400,
      relationsEdgeLength: 200,
    });
    expect(large.find(({ name }) => name === 'Service topology')?.options).toMatchObject({
      relationsNodeSize: 10,
      relationsShowNodeLabels: false,
      relationsRepulsion: 200,
      relationsEdgeLength: 100,
    });
    expect(large.find(({ name }) => name === 'Time network')?.options).toMatchObject({
      relationsNodeSize: 10,
      relationsShowNodeLabels: false,
      relationsRepulsion: 400,
      relationsEdgeLength: 200,
    });
  });

  it('resets every Relations visual option and applies each distinctive bundle', () => {
    const presets = relationsPresetsSupplier({ dataSummary: rangedSummary() })!;
    expect(
      presets.every(
        ({ options }) => Object.keys(options!).sort().join() === Object.keys(RELATIONS_PRESET_BASE).sort().join()
      )
    ).toBe(true);

    expect(presets[0].options).toMatchObject({
      seriesType: 'graph',
      relationsLayout: 'force',
      relationsPan: true,
      relationsZoom: true,
      relationsEdgeArrows: true,
      relationsFocusAdjacency: true,
      relationsShowNodeLabels: true,
      relationsShowEdgeValues: false,
      relationsTimeSlider: false,
    });
    expect(presets[1].options).toMatchObject({
      seriesType: 'sankey',
      relationsSankeyOrient: 'horizontal',
      relationsLinkColor: 'gradient',
      relationsFocusAdjacency: true,
      relationsShowNodeLabels: true,
      relationsShowEdgeValues: false,
      relationsTimeSlider: false,
    });
    expect(presets[2].options).toMatchObject({
      seriesType: 'chord',
      relationsLinkColor: 'gradient',
      relationsFocusAdjacency: true,
      relationsHideOverlappingLabels: true,
      relationsShowNodeLabels: true,
      relationsTimeSlider: false,
    });
    expect(presets[3].options).toMatchObject({
      seriesType: 'graph',
      relationsLayout: 'circular',
      relationsTimeSlider: true,
      relationsShowEdgeValues: true,
      relationsFocusAdjacency: true,
      relationsPan: true,
      relationsZoom: true,
    });
  });

  it('does not replace query or field configuration options', () => {
    const presets = relationsPresetsSupplier({ dataSummary: rangedSummary() })!;
    const excluded = ['reduceOptions', 'legend', 'tooltip', 'thresholds', 'mappings', 'links', 'overrides'];

    for (const preset of presets) {
      expect(excluded.every((key) => !Object.hasOwn(preset.options!, key))).toBe(true);
      expect(preset.fieldConfig).toBeUndefined();
      expect(preset.transformations).toBeUndefined();
    }
  });

  it('changes only preview clones', () => {
    const presets = relationsPresetsSupplier({ dataSummary: rangedSummary() })!;

    for (const preset of presets) {
      const persistedOptions = { ...preset.options, animation: { ...preset.options?.animation } };
      const preview: { options?: Partial<PanelOptions> } = {
        options: { ...preset.options, animation: { enabled: preset.options?.animation?.enabled ?? false } },
      };
      preset.cardOptions!.previewModifier!(preview);

      expect(preview.options).toMatchObject({
        relationsShowNodeLabels: false,
        legend: { showLegend: false },
      });
      expect(preset.options).toEqual(persistedOptions);
    }
  });
});
