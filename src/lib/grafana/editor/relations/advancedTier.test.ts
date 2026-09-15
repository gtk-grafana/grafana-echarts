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

const noEditor = (): null => null;
standardEditorsRegistry.setInit(() =>
  ['boolean', 'select', 'radio', 'number', 'slider', 'text', 'color', 'stats-picker'].map((id) => ({
    id,
    name: id,
    editor: noEditor,
  }))
);

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

const PROBES: Array<Partial<PanelOptions>> = [
  { seriesType: 'graph', relationsLayout: 'force' },
  { seriesType: 'graph', relationsLayout: 'circular' },
  { seriesType: 'graph', relationsLayout: 'none' },
  { seriesType: 'sankey' },
  { seriesType: 'chord' },
];

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

  it('resets exactly the options it hides', () => {
    expect(advancedKeys()).toEqual(tierKeys());
  });

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
