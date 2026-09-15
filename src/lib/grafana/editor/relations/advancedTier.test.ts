import { PanelOptionsEditorBuilder, standardEditorsRegistry } from '@grafana/data';

import { addAnimationOption } from 'lib/grafana/editor/common/animation';
import { addRelationsChordOptions } from 'lib/grafana/editor/relations/chord';
import { addRelationsForceOptions } from 'lib/grafana/editor/relations/force';
import { addRelationsInteractionOptions } from 'lib/grafana/editor/relations/interaction';
import { addRelationsLabelOptions } from 'lib/grafana/editor/relations/labels';
import { addRelationsLayoutOptions } from 'lib/grafana/editor/relations/layout';
import { addRelationsLinkOptions } from 'lib/grafana/editor/relations/links';
import { addRelationsSankeyOptions } from 'lib/grafana/editor/relations/sankey';
import { addRelationsTimelineOptions } from 'lib/grafana/editor/relations/timeline';
import { type PanelOptions } from 'types';

import {
  ADVANCED_CHORD_DEFAULTS,
  ADVANCED_RELATIONS_DEFAULTS,
  ADVANCED_RELATIONS_SHARED_DEFAULTS,
  ADVANCED_SANKEY_DEFAULTS,
} from 'lib/echarts/relations/options/advancedDefaults';
/**
 * **The Advanced tier and its reset must name the same options.**
 *
 * An option gated behind Advanced is *hidden*, not cleared, when the user switches back
 * to Default — so `ADVANCED_*_DEFAULTS` exists to reset it before the render reads it
 * (see `applyEditorModeDefaults` and docs/options-modes.md). The two lists are written
 * by hand in different files, and nothing tied them together: a new Advanced control
 * that nobody added to the defaults renders from a value the user cannot see a control
 * for, and a defaults entry for a control that does not exist resets nothing while
 * looking like coverage.
 *
 * That is not hypothetical here. `filters.ts` — then two Advanced text inputs for the
 * endpoint label keys — was added by hand, and the tier had to be updated by hand to
 * match. (Those two are per-mark field config now, `addRelationsFilterConfig`, so they
 * have no tier at all and are absent from both lists.) This test is what makes the next
 * mismatch fail loudly instead.
 *
 * **Tier membership is probed from each `showIf`, not read off a category.** The family
 * groups by purpose — Labels, Layout, Interaction, Edges, Sankey, Chord — and an Advanced
 * control sits in the section it belongs to, so a category says nothing about the tier.
 * The gate is the only statement of it, so the gate is what this interrogates: an option
 * is Advanced iff there is some panel configuration where it shows in Advanced mode and
 * hides in Default mode.
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
  addRelationsTimelineOptions(builder);
  addRelationsLabelOptions(builder);
  addRelationsLayoutOptions(builder);
  addRelationsForceOptions(builder);
  addAnimationOption(builder);
  addRelationsInteractionOptions(builder);
  addRelationsLinkOptions(builder);
  addRelationsSankeyOptions(builder);
  addRelationsChordOptions(builder);
  return builder.getItems();
};

/** The merged tier, exactly as `applyEditorModeDefaults` builds it for this family. */
const RELATIONS_TIER: Partial<PanelOptions> = {
  ...ADVANCED_RELATIONS_DEFAULTS,
  ...ADVANCED_SANKEY_DEFAULTS,
  ...ADVANCED_CHORD_DEFAULTS,
  ...ADVANCED_RELATIONS_SHARED_DEFAULTS,
};

/**
 * Panel configurations to probe each gate against.
 *
 * A single fixture is not enough: the gates AND a variant (and sometimes a layout)
 * condition into the Advanced check, so a chord option reads as hidden on a graph
 * fixture whatever the mode. An option counts as Advanced if **any** of these
 * configurations reveals it in Advanced mode and hides it in Default mode, which is the
 * definition that does not depend on guessing the right fixture per option.
 */
const PROBES: Array<Partial<PanelOptions>> = [
  { seriesType: 'graph', relationsLayout: 'force' },
  { seriesType: 'graph', relationsLayout: 'circular' },
  { seriesType: 'graph', relationsLayout: 'none' },
  { seriesType: 'sankey' },
  { seriesType: 'chord' },
];

/**
 * The reset is keyed by top-level option key while an editor item carries a full path,
 * so `animation.enabled` has to be compared as `animation`. Only the shared animation
 * flag is nested today; every relations-owned option is a flat key.
 */
const resetKeyOf = (path: string) => path.split('.')[0];

const isAdvanced = (item: { showIf?: (options: PanelOptions, data?: undefined) => boolean | undefined }) => {
  if (item.showIf == null) {
    return false;
  }
  return PROBES.some(
    (probe) =>
      item.showIf!({ ...probe, editorMode: 'advanced' } as PanelOptions, undefined) === true &&
      item.showIf!({ ...probe, editorMode: 'default' } as PanelOptions, undefined) !== true
  );
};

describe('relations Advanced tier', () => {
  const advancedKeys = () =>
    registeredOptions()
      .filter(isAdvanced)
      .map((item) => resetKeyOf(item.path))
      .sort();

  const tierKeys = () => (Object.keys(RELATIONS_TIER) as Array<keyof PanelOptions>).sort();

  it('registers Advanced controls at all', () => {
    expect(advancedKeys().length).toBeGreaterThan(10);
  });

  // Both directions in one assertion, so a failure names the drifted key rather than
  // only its count.
  it('resets exactly the options it hides', () => {
    expect(advancedKeys()).toEqual(tierKeys());
  });

  /**
   * A Default-tier control must **not** be reset — it is visible in both modes, so
   * clearing it would read as the editor forgetting what the user typed.
   *
   * Asserted with no allow-list: every key in the reset has a control in the pane, so an
   * exception here would mean an option the editor resets and the reader cannot see.
   */
  it('leaves every Default-tier control out of the reset', () => {
    const defaultTier = registeredOptions()
      .filter((item) => !isAdvanced(item))
      .map((item) => resetKeyOf(item.path));

    expect(defaultTier.filter((key) => key in RELATIONS_TIER)).toEqual([]);
    // Guard against the assertion passing because nothing is Default-tier.
    expect(defaultTier).toEqual(
      expect.arrayContaining(['relationsLayout', 'relationsSankeyOrient', 'relationsZoom', 'relationsLabelOverflow'])
    );
  });
});
