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
  /**
   * "Node size" is deliberately absent: it is how big a mark is and where it sits, which
   * is the Layout section's subject, not a label question. See `addRelationsLayoutOptions`.
   * "Show edge values" *is* in this section, but registered by `addRelationsLinkOptions`
   * rather than here, so it is absent from this file's own list.
   */
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

  /** All five land in one section — the point of the section existing. */
  it('puts every control in the Labels section', () => {
    const builder = new PanelOptionsEditorBuilder<PanelOptions>();
    addRelationsLabelOptions(builder);

    expect(builder.getItems().map((item) => item.category?.[0])).toEqual(Array(5).fill('Labels'));
  });

  /**
   * **"Wrap anywhere" (`breakAll`) is off the menu.** It breaks at any character, which
   * on the identifier-shaped names a topology carries splits mid-word. The value stays
   * valid in the type and the ECharts resolver so a panel already saved with it keeps
   * rendering — it is only unofferable now.
   */
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
      // The width is still Advanced-gated, so the mode has to be on for the gate under
      // test to be the overflow value rather than the tier.
      const advanced = (extra: Partial<PanelOptions>) => options({ editorMode: 'advanced', ...extra });

      expect(optionAt('relationsLabelWidth').showIf?.(advanced({}))).toBe(true);
      expect(optionAt('relationsLabelWidth').showIf?.(advanced({ relationsLabelOverflow: 'none' }))).toBe(false);
    });

    /**
     * **Label overflow is Default-tier.** On any real topology the labels do not fit, so
     * how an over-long name is handled is a first question rather than an expert one —
     * the same reasoning that keeps "Hide overlapping labels" out of the Advanced tier.
     * Only the *px* at which the chosen mode bites is Advanced.
     */
    it('keeps overflow handling in the Default tier, and only its width in Advanced', () => {
      expect(optionAt('relationsLabelOverflow').showIf?.(options())).toBe(true);
      expect(optionAt('relationsHideOverlappingLabels').showIf?.(options())).toBe(true);
      expect(optionAt('relationsLabelWidth').showIf?.(options())).toBe(false);
    });
  });
});
