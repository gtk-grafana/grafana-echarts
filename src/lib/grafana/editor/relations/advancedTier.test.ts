import { PanelOptionsEditorBuilder, standardEditorsRegistry } from '@grafana/data';
import { advancedOptionsCategoryName } from 'editor/constants';
import { ADVANCED_CHORD_DEFAULTS } from 'lib/echarts/options/chord';
import { ADVANCED_RELATIONS_DEFAULTS } from 'lib/echarts/options/graph';
import { ADVANCED_SANKEY_DEFAULTS } from 'lib/echarts/options/sankey';
import { addRelationsAnimationOption } from 'lib/grafana/editor/relations/animation';
import { addRelationsChordOptions } from 'lib/grafana/editor/relations/chord';
import { addRelationsFilterOptions } from 'lib/grafana/editor/relations/filters';
import { addRelationsForceOptions } from 'lib/grafana/editor/relations/force';
import { addRelationsInteractionOptions } from 'lib/grafana/editor/relations/interaction';
import { addRelationsLayoutOptions } from 'lib/grafana/editor/relations/layout';
import { addRelationsLinkOptions } from 'lib/grafana/editor/relations/links';
import { addRelationsNodeOptions } from 'lib/grafana/editor/relations/nodes';
import { addRelationsSankeyOptions } from 'lib/grafana/editor/relations/sankey';
import { type PanelOptions } from 'types';

/**
 * **The Advanced tier and its reset must name the same options.**
 *
 * An option gated behind Advanced is *hidden*, not cleared, when the user switches back
 * to Default — so `ADVANCED_*_DEFAULTS` exists to reset it before the render reads it
 * (see `applyEditorModeDefaults` and docs/options-modes.md). The two lists are written
 * by hand in different files, and nothing tied them together: a new Advanced control
 * that nobody added to the defaults renders from a value the user cannot see a control
 * for, and a defaults entry for a control that no longer exists resets nothing while
 * looking like coverage.
 *
 * That is not hypothetical here. `filters.ts` — two Advanced text inputs for the
 * endpoint label keys — was added by hand, and the tier had to be updated by hand to
 * match. This test is what makes the next one fail loudly instead.
 *
 * The tier membership is read from the **category** rather than from probing each
 * `showIf`: every Advanced control goes through `addAdvanced*`, which fixes the category
 * to "Advanced" and composes `isAdvancedEditorMode` into the gate, so the category is
 * the same fact stated once instead of a predicate that has to be interrogated with a
 * guessed-at options object.
 */

/**
 * `standardEditorsRegistry` is filled by Grafana core app code a plugin cannot import,
 * so under jest it is empty and every `builder.addX` throws looking its editor component
 * up. Stubbing the ids these files register is the supported way in — the components are
 * never rendered here. Same problem, and same shape of answer, as `test/fieldConfig.ts`.
 */
const noEditor = (): null => null;
standardEditorsRegistry.setInit(() =>
  ['boolean', 'select', 'radio', 'number', 'slider', 'text', 'color', 'stats-picker'].map((id) => ({
    id,
    name: id,
    editor: noEditor,
  }))
);

/**
 * Every relations option the panel registers, in `module.tsx`'s order. The stat picker
 * and the shared legend/tooltip block are left out: neither is Advanced-gated, and both
 * pull in registry entries this stub has no reason to fake.
 */
const registeredOptions = () => {
  const builder = new PanelOptionsEditorBuilder<PanelOptions>();
  addRelationsLayoutOptions(builder);
  addRelationsNodeOptions(builder);
  addRelationsSankeyOptions(builder);
  addRelationsChordOptions(builder);
  addRelationsInteractionOptions(builder);
  addRelationsForceOptions(builder);
  addRelationsLinkOptions(builder);
  addRelationsFilterOptions(builder);
  addRelationsAnimationOption(builder);
  return builder.getItems();
};

/** The merged tier, exactly as `applyEditorModeDefaults` builds it for this family. */
const RELATIONS_TIER: Partial<PanelOptions> = {
  ...ADVANCED_RELATIONS_DEFAULTS,
  ...ADVANCED_SANKEY_DEFAULTS,
  ...ADVANCED_CHORD_DEFAULTS,
};

/**
 * Tier keys with no control of their own, documented one by one.
 *
 * `relationsRoam` is the superseded single "Zoom and pan" switch. Its control is gone —
 * it is two switches now — but a dashboard saved before the split still carries the
 * value, and `resolveRelationsRoam` / `resolveRelationsZoom` still read it as a
 * fallback. So it must still be reset in Default mode, and it will never appear in the
 * editor again.
 */
const NO_CONTROL: Array<keyof PanelOptions> = ['relationsRoam'];

describe('relations Advanced tier', () => {
  const advancedPaths = () =>
    registeredOptions()
      .filter((item) => item.category?.[0] === advancedOptionsCategoryName)
      .map((item) => item.path)
      .sort();

  const tierKeys = () =>
    (Object.keys(RELATIONS_TIER) as Array<keyof PanelOptions>).filter((key) => !NO_CONTROL.includes(key)).sort();

  it('registers Advanced controls at all', () => {
    expect(advancedPaths().length).toBeGreaterThan(10);
  });

  // Both directions in one assertion, so a failure names the drifted key rather than
  // only its count.
  it('resets exactly the options it hides', () => {
    expect(advancedPaths()).toEqual(tierKeys());
  });

  // The allow-list is a list of exceptions, and an exception that has stopped being one
  // is worse than no allow-list: it would silently excuse a real omission.
  it.each(NO_CONTROL)('keeps %s in the tier although it has no control', (key) => {
    expect(RELATIONS_TIER).toHaveProperty(key);
    expect(advancedPaths()).not.toContain(key);
  });

  /**
   * A Default-tier control must **not** be reset — it is visible in both modes, so
   * clearing it would read as the editor forgetting what the user typed. The sankey's
   * own layout category is the case that matters: it sits outside "Advanced" precisely
   * so it survives.
   */
  it('leaves every Default-tier control out of the reset', () => {
    const defaultTier = registeredOptions()
      .filter((item) => item.category?.[0] !== advancedOptionsCategoryName)
      .map((item) => item.path);

    expect(defaultTier.filter((path) => path in RELATIONS_TIER)).toEqual([]);
    // Guard against the assertion passing because nothing is Default-tier.
    expect(defaultTier).toEqual(expect.arrayContaining(['relationsLayout', 'relationsSankeyOrient']));
  });
});
