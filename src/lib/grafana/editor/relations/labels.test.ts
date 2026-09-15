import {
  type DataFrame,
  FieldType,
  PanelOptionsEditorBuilder,
  standardEditorsRegistry,
  toDataFrame,
} from '@grafana/data';

import { type PanelOptions } from 'types';
import { addRelationsLabelOptions } from './labels';

import { GRAPH_EDGES_WIDE, GRAPH_NODES_WIDE } from 'lib/echarts/relations/converters/contract';
const noEditor = (): null => null;
standardEditorsRegistry.setInit(() =>
  ['boolean', 'select', 'number', 'slider'].map((id) => ({ id, name: id, editor: noEditor }))
);

/** The registered option at `path`, so a `showIf` can be asked its question directly. */
const optionAt = (path: string) => {
  const builder = new PanelOptionsEditorBuilder<PanelOptions>();
  addRelationsLabelOptions(builder);
  const item = builder.getItems().find((entry) => entry.path === path);
  expect(item).toBeDefined();
  return item!;
};

const options = (extra: Partial<PanelOptions> = {}): PanelOptions => extra as PanelOptions;

const edgesFrame = (): DataFrame =>
  toDataFrame({
    meta: { type: GRAPH_EDGES_WIDE },
    fields: [{ name: 'e1', type: FieldType.number, labels: { source: 'a', target: 'b' }, values: [10] }],
  });

const nodesFrame = (values: Array<number | null>): DataFrame =>
  toDataFrame({
    meta: { type: GRAPH_NODES_WIDE },
    fields: [
      { name: 'a', type: FieldType.number, values },
      { name: 'b', type: FieldType.number, values },
    ],
  });

describe('addRelationsLabelOptions', () => {
  it('registers the five label controls, and nothing about geometry', () => {
    const builder = new PanelOptionsEditorBuilder<PanelOptions>();
    addRelationsLabelOptions(builder);

    expect(builder.getItems().map((item) => item.path)).toEqual([
      'relationsShowNodeLabels',
      'relationsShowNodeValues',
      'relationsHideOverlappingLabels',
      'relationsLabelOverflow',
      'relationsLabelWidth',
    ]);
  });

  /** All five options use one section. */
  it('puts every control in the Labels section', () => {
    const builder = new PanelOptionsEditorBuilder<PanelOptions>();
    addRelationsLabelOptions(builder);

    expect(builder.getItems().map((item) => item.category?.[0])).toEqual(Array(5).fill('Labels'));
  });

  it('offers no break-anywhere overflow mode', () => {
    const settings = optionAt('relationsLabelOverflow').settings as {
      options: Array<{ value: string }>;
    };

    expect(settings.options.map(({ value }) => value)).toEqual(['none', 'truncate', 'break']);
  });

  describe('"Show node values" visibility', () => {
    const showNodeValues = (opts: PanelOptions, data?: DataFrame[]) =>
      optionAt('relationsShowNodeValues').showIf?.(opts, data);

    it('is shown when the nodes carry stats', () => {
      expect(showNodeValues(options(), [edgesFrame(), nodesFrame([7])])).toBe(true);
    });

    it('is hidden when every node is derived', () => {
      expect(showNodeValues(options(), [edgesFrame()])).toBe(false);
      expect(showNodeValues(options(), [edgesFrame(), nodesFrame([null])])).toBe(false);
    });

    // The value rides on the label, so it cannot show when the label does not.
    it('is hidden when node labels are off, stats or no stats', () => {
      expect(showNodeValues(options({ relationsShowNodeLabels: false }), [edgesFrame(), nodesFrame([7])])).toBe(false);
    });

    it('is shown when there are no frames to judge from', () => {
      expect(showNodeValues(options(), undefined)).toBe(true);
      expect(showNodeValues(options(), [])).toBe(true);
    });
  });

  describe('label legibility controls', () => {
    it('hides all three when node labels are off', () => {
      const off = options({ relationsShowNodeLabels: false });

      expect(optionAt('relationsHideOverlappingLabels').showIf?.(off)).toBe(false);
      expect(optionAt('relationsLabelOverflow').showIf?.(off)).toBe(false);
      expect(optionAt('relationsLabelWidth').showIf?.(off)).toBe(false);
    });

    it('hides the width once overflow handling is turned off', () => {
      const advanced = (extra: Partial<PanelOptions>) => options({ editorMode: 'advanced', ...extra });

      expect(optionAt('relationsLabelWidth').showIf?.(advanced({}))).toBe(true);
      expect(optionAt('relationsLabelWidth').showIf?.(advanced({ relationsLabelOverflow: 'none' }))).toBe(false);
    });

    it('keeps overflow handling in the Default tier, and only its width in Advanced', () => {
      expect(optionAt('relationsLabelOverflow').showIf?.(options())).toBe(true);
      expect(optionAt('relationsHideOverlappingLabels').showIf?.(options())).toBe(true);
      expect(optionAt('relationsLabelWidth').showIf?.(options())).toBe(false);
    });
  });
});
