import { readFileSync } from 'fs';
import { join } from 'path';

import { registeredRelationsOptions } from 'test/relationsPane';

import {
  ADVANCED_CHORD_DEFAULTS,
  ADVANCED_RELATIONS_DEFAULTS,
  ADVANCED_RELATIONS_SHARED_DEFAULTS,
  ADVANCED_SANKEY_DEFAULTS,
} from 'lib/echarts/relations/options/advancedDefaults';
const repoFile = (...parts: string[]) => join(__dirname, '../../../../..', ...parts);

interface DemoPanel {
  id: number;
  title: string;
  description?: string;
  options: Record<string, unknown>;
}

const dashboard = (): { panels: DemoPanel[] } =>
  JSON.parse(readFileSync(repoFile('provisioning/dashboards/relations/all-options.json'), 'utf8'));

const parityDoc = () => readFileSync(repoFile('src/modules/relations/parity.md'), 'utf8');

const OPTION_PANEL: Record<string, number> = {
  seriesType: 1,
  'reduceOptions.calcs': 2,
  relationsTimeSlider: 3,
  relationsShowNodeLabels: 4,
  relationsShowNodeValues: 5,
  relationsHideOverlappingLabels: 6,
  relationsLabelOverflow: 7,
  relationsLabelWidth: 8,
  relationsShowEdgeValues: 9,
  relationsLayout: 10,
  relationsNodeSize: 11,
  relationsRepulsion: 12,
  relationsEdgeLength: 13,
  relationsGravity: 14,
  relationsZoom: 15,
  relationsLinkColor: 16,
  relationsEdgeArrows: 17,
  relationsCurveness: 18,
  relationsSankeyNodeAlign: 19,
  relationsSankeyOrient: 20,
  relationsSankeyNodeWidth: 21,
  relationsSankeyNodeGap: 22,
  relationsSankeyCurveness: 23,
  relationsSankeyLinkOpacity: 24,
  relationsSankeyLayoutIterations: 25,
  relationsChordStartAngle: 26,
  relationsChordClockwise: 27,
  relationsChordPadAngle: 28,
  relationsChordMinAngle: 29,
  relationsChordLinkOpacity: 30,
  legend: 31,
  relationsPan: 32,
  relationsDraggable: 33,
};

const NO_VISUAL: Record<string, string> = {
  editorMode: 'changes the options pane, not the panel',
  relationsLayoutAnimation: 'motion only — the settled layout is identical',
  'animation.enabled': 'motion only — the settled render is identical',
  relationsRememberView: 'behaviour only — persists a view, draws nothing',
  relationsFocusAdjacency: 'hover only — the idle render is identical',
  tooltip: 'hover only — the idle render is identical',
};

const FIELD_CONFIG_PANEL: Record<string, number> = {
  'Color scheme (by value)': 34,
  Thresholds: 35,
  'Value mappings': 36,
};

/** Return option panels before field-configuration panels. */
const ALL_PANEL_IDS = [...Object.values(OPTION_PANEL), ...Object.values(FIELD_CONFIG_PANEL)];

const ADVANCED_PATHS = new Set(
  Object.keys({
    ...ADVANCED_RELATIONS_DEFAULTS,
    ...ADVANCED_SANKEY_DEFAULTS,
    ...ADVANCED_CHORD_DEFAULTS,
    ...ADVANCED_RELATIONS_SHARED_DEFAULTS,
  }).map((key) => (key === 'animation' ? 'animation.enabled' : key))
);

describe('the all-options reference dashboard', () => {
  it('accounts for every registered option exactly once', () => {
    const demoed = Object.keys(OPTION_PANEL);
    const excused = Object.keys(NO_VISUAL);

    expect(demoed.filter((path) => excused.includes(path))).toEqual([]);
    expect([...demoed, ...excused].sort()).toEqual(registeredRelationsOptions().sort());
  });

  it('gives every excused option a reason', () => {
    for (const [path, reason] of Object.entries(NO_VISUAL)) {
      expect(`${path}: ${reason.length > 20}`).toBe(`${path}: true`);
    }
  });

  it('has exactly one panel per demoed option and field-config option, numbered 1..n', () => {
    const panels = dashboard().panels;

    expect(panels.map((panel) => panel.id)).toEqual(ALL_PANEL_IDS);
    expect(panels).toHaveLength(ALL_PANEL_IDS.length);
    expect(ALL_PANEL_IDS).toEqual(ALL_PANEL_IDS.map((_, index) => index + 1));
  });

  // The id is the doc's link target, so it has to be legible on the panel itself.
  it('prefixes every panel title with its id', () => {
    for (const panel of dashboard().panels) {
      expect(panel.title.startsWith(`${panel.id}. `)).toBe(true);
    }
  });

  it('puts every panel demoing an Advanced option into Advanced editor mode', () => {
    const byId = new Map(dashboard().panels.map((panel) => [panel.id, panel]));
    // Excused options have no panel, so only the demoed half of the tier is checkable.
    const demoedAdvanced = [...ADVANCED_PATHS].filter((path) => path in OPTION_PANEL);
    const wrong = demoedAdvanced
      .map((path) => byId.get(OPTION_PANEL[path])!)
      .filter((panel) => panel.options.editorMode !== 'advanced')
      .map((panel) => panel.title);

    expect(wrong).toEqual([]);
    // Guard against the filter passing because the tier set is empty.
    expect(demoedAdvanced.length).toBeGreaterThan(10);
  });

  it('describes every panel', () => {
    const thin = dashboard()
      .panels.filter((panel) => (panel.description ?? '').length < 100)
      .map((panel) => panel.title);

    expect(thin).toEqual([]);
  });
});

describe('parity.md option links', () => {
  it('references and defines a link for every panel', () => {
    const doc = parityDoc();
    const missingRef = ALL_PANEL_IDS.filter((id) => !doc.includes(`[#${id} opts][live-opt-${id}]`));
    const missingDef = ALL_PANEL_IDS.filter((id) => !doc.includes(`\n[live-opt-${id}]: `));

    expect({ missingRef, missingDef }).toEqual({ missingRef: [], missingDef: [] });
  });

  it('points every link at the dashboard uid the JSON declares', () => {
    const uid = JSON.parse(readFileSync(repoFile('provisioning/dashboards/relations/all-options.json'), 'utf8')).uid;

    expect(uid).toBe('echarts-relations-all-options');
    expect(parityDoc()).toContain(`[live-opt-1]: http://localhost:3001/d/${uid}?viewPanel=1`);
  });
});
