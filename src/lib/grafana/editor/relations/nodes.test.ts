import {
  type DataFrame,
  FieldType,
  PanelOptionsEditorBuilder,
  standardEditorsRegistry,
  toDataFrame,
} from '@grafana/data';
import { GRAPH_EDGES_WIDE, GRAPH_NODES_WIDE } from 'lib/echarts/converters/graphWide';
import { type PanelOptions } from 'types';
import { addRelationsNodeOptions } from './nodes';

/**
 * `standardEditorsRegistry` is filled by Grafana core app code a plugin cannot import
 * (`public/app/core/components/OptionsUI/registry.tsx`), so under jest it is empty and
 * every `builder.addX` throws looking its editor component up. Stubbing the ids this
 * file registers is the supported way in — the components are never rendered here; what
 * is under test is the `showIf` each option carries. Same problem, and same shape of
 * answer, as `test/fieldConfig.ts`.
 */
const noEditor = (): null => null;
standardEditorsRegistry.setInit(() =>
  ['boolean', 'select', 'number', 'slider'].map((id) => ({ id, name: id, editor: noEditor }))
);

/** The registered option at `path`, so a `showIf` can be asked its question directly. */
const optionAt = (path: string) => {
  const builder = new PanelOptionsEditorBuilder<PanelOptions>();
  addRelationsNodeOptions(builder);
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

describe('addRelationsNodeOptions', () => {
  it('registers the label, value, overlap, overflow, width and size controls', () => {
    const builder = new PanelOptionsEditorBuilder<PanelOptions>();
    addRelationsNodeOptions(builder);

    expect(builder.getItems().map((item) => item.path)).toEqual([
      'relationsShowNodeLabels',
      'relationsShowNodeValues',
      'relationsHideOverlappingLabels',
      'relationsLabelOverflow',
      'relationsLabelWidth',
      'relationsNodeSize',
    ]);
  });

  describe('"Show node values" visibility', () => {
    const showNodeValues = (opts: PanelOptions, data?: DataFrame[]) =>
      optionAt('relationsShowNodeValues').showIf?.(opts, data);

    it('is shown when the nodes carry stats', () => {
      expect(showNodeValues(options(), [edgesFrame(), nodesFrame([7])])).toBe(true);
    });

    /**
     * Hidden when there is nothing for it to show: on an edges-only response every node
     * is derived from an endpoint and carries no stat, whether the pre-pass declared it
     * as an all-null field or the reader invented it inside the panel. The switch would
     * be a control that visibly does nothing. See `hasNoNodeStats`.
     */
    it('is hidden when every node is derived', () => {
      expect(showNodeValues(options(), [edgesFrame()])).toBe(false);
      expect(showNodeValues(options(), [edgesFrame(), nodesFrame([null])])).toBe(false);
    });

    // The value rides on the label, so it cannot show when the label does not.
    it('is hidden when node labels are off, stats or no stats', () => {
      expect(showNodeValues(options({ relationsShowNodeLabels: false }), [edgesFrame(), nodesFrame([7])])).toBe(false);
    });

    // Shown whenever the question cannot be answered — hiding a working control is
    // worse than showing an inert one.
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

    // "Label width" is the one that also depends on an overflow mode being chosen —
    // ECharts ignores `overflow` without a width, and a width without one does nothing.
    it('hides the width once overflow handling is turned off', () => {
      // Both are Advanced-gated, so the mode has to be on for the gate to be the
      // overflow value rather than the tier.
      const advanced = (extra: Partial<PanelOptions>) => options({ editorMode: 'advanced', ...extra });

      expect(optionAt('relationsLabelWidth').showIf?.(advanced({}))).toBe(true);
      expect(optionAt('relationsLabelWidth').showIf?.(advanced({ relationsLabelOverflow: 'none' }))).toBe(false);
    });

    it('keeps the overflow controls out of the Default tier', () => {
      expect(optionAt('relationsLabelOverflow').showIf?.(options())).toBe(false);
      // …while the overlap switch is Default-tier, since it is the main lever.
      expect(optionAt('relationsHideOverlappingLabels').showIf?.(options())).toBe(true);
    });
  });
});
