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
  type: string;
  collapsed?: boolean;
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
  relationsFocusAdjacency: 42,
};

const NO_VISUAL: Record<string, string> = {
  editorMode: 'changes the options pane, not the panel',
  relationsLayoutAnimation: 'motion only — the settled layout is identical',
  'animation.enabled': 'motion only — the settled render is identical',
  relationsRememberView: 'behaviour only — persists a view, draws nothing',
  tooltip: 'hover only — the idle render is identical',
};

const FIELD_CONFIG_PANEL: Record<string, number> = {
  'Color scheme (by value)': 34,
  Thresholds: 35,
  'Value mappings': 36,
};

/** Extra values that explain a supported choice or chart variant. */
const SUPPLEMENTAL_PANEL_IDS = [37, 38, 39, 40, 41, 43, 44];

const FAMILY_ROWS = [
  { id: 45, title: 'Sankey', seriesType: 'sankey' },
  { id: 46, title: 'Graph', seriesType: 'graph' },
  { id: 47, title: 'Chord', seriesType: 'chord' },
] as const;

/** Return every expected panel id in dashboard order. */
const ALL_PANEL_IDS = [
  ...Object.values(OPTION_PANEL),
  ...Object.values(FIELD_CONFIG_PANEL),
  ...SUPPLEMENTAL_PANEL_IDS,
].sort((left, right) => left - right);

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

  it('has every primary and supplemental demo, numbered 1..n', () => {
    const panels = dashboard().panels.filter((panel) => panel.type !== 'row');

    expect(panels.map((panel) => panel.id).sort((left, right) => left - right)).toEqual(ALL_PANEL_IDS);
    expect(panels).toHaveLength(ALL_PANEL_IDS.length);
    expect(ALL_PANEL_IDS).toEqual(ALL_PANEL_IDS.map((_, index) => index + 1));
  });

  it('groups every chart under an expanded family row', () => {
    const panels = dashboard().panels;
    const rowIndexes = panels.flatMap((panel, index) => (panel.type === 'row' ? [index] : []));

    expect(rowIndexes.map((index) => panels[index])).toMatchObject(
      FAMILY_ROWS.map(({ id, title }) => ({ id, title, type: 'row', collapsed: false }))
    );

    for (const [rowIndex, family] of FAMILY_ROWS.entries()) {
      const start = rowIndexes[rowIndex] + 1;
      const end = rowIndexes[rowIndex + 1] ?? panels.length;
      const seriesTypes = panels.slice(start, end).map((panel) => panel.options.seriesType ?? 'graph');

      expect(seriesTypes.length).toBeGreaterThan(0);
      expect(new Set(seriesTypes)).toEqual(new Set([family.seriesType]));
    }
  });

  it('uses unnumbered chart titles', () => {
    const numbered = dashboard()
      .panels.filter((panel) => panel.type !== 'row' && /^\d+\.\s/.test(panel.title))
      .map((panel) => panel.title);

    expect(numbered).toEqual([]);
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
      .filter((panel) => panel.type !== 'row')
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
