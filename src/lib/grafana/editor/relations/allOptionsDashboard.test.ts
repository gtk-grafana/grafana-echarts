import { readFileSync } from 'fs';
import { join } from 'path';

import { registeredRelationsOptions } from 'test/relationsPane';

import {
  ADVANCED_CHORD_DEFAULTS,
  ADVANCED_RELATIONS_DEFAULTS,
  ADVANCED_RELATIONS_SHARED_DEFAULTS,
  ADVANCED_SANKEY_DEFAULTS,
} from 'lib/echarts/relations/options/advancedDefaults';
/**
 * **The reference dashboard and its doc links must cover every option the panel has.**
 *
 * `provisioning/dashboards/relations/all-options.json` is one panel per panel option **that
 * visibly changes what the panel draws**, and every such option's row in
 * `src/modules/relations/parity.md` links to its panel. Both are
 * hand-maintained, which is exactly the shape of artefact that rots: add an option and the
 * dashboard silently stops being "every option" while still being titled that, and still
 * being cited as the demo for its neighbours.
 *
 * Not hypothetical. `docs/relations-canvas-coverage.md` claimed canvas coverage for a
 * sankey option whose baseline could not discriminate it, and nothing failed — which is how
 * a default change slipped through. A hand-written inventory can assert something untrue; a
 * test comparing it against the registry cannot.
 *
 * So this is what lets the dashboard be trusted as a reference rather than becoming a
 * second liability. `optionSurface.test.ts` owns the option *set* itself; this owns the
 * claim that the demo and the docs keep up with it.
 *
 * The split is asserted as a **partition**: every registered option is either demoed by a
 * panel or named in `NO_VISUAL` with a reason. A new option belongs to one or the other,
 * and the build says so until somebody decides which.
 */
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

/**
 * Option path -> the panel that demos it, in the dashboard's own order.
 *
 * Written out rather than derived: a panel sets one option away from its default, but it
 * also carries scaffolding (`seriesType`, a pinned layout, legend and tooltip defaults),
 * so "the option this panel is about" is not recoverable from the JSON without guessing.
 * Stating it here costs one line per option and makes the two assertions below exact.
 */
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
};

/**
 * Options with **no observable difference in a still render**, so a demo panel for them
 * would show nothing to compare against its neighbours — a panel that looks like every
 * other one and claims to be showing something. Each reason was checked against the
 * running panel, not assumed.
 *
 * They are covered by unit and integration tests instead; what this list buys is that a
 * *new* option cannot quietly join it. Adding one fails the partition assertion below
 * until somebody either writes its panel or states why it has none.
 */
const NO_VISUAL: Record<string, string> = {
  editorMode: 'changes the options pane, not the panel',
  relationsLayoutAnimation: 'motion only — the settled layout is identical',
  'animation.enabled': 'motion only — the settled render is identical',
  relationsPan: 'behaviour only — nothing is drawn differently until you drag',
  relationsRememberView: 'behaviour only — persists a view, draws nothing',
  relationsDraggable: 'behaviour only — nothing differs until you drag a node',
  relationsFocusAdjacency: 'hover only — the idle render is identical',
  tooltip: 'hover only — the idle render is identical',
};

/**
 * The Advanced tier, taken from the render-time reset rather than by probing each
 * `showIf` — `advancedTier.test.ts` already asserts those two name the same options, so
 * reading either is reading both, and the reset is a plain module with no builder to stub.
 */
const ADVANCED_PATHS = new Set(
  Object.keys({
    ...ADVANCED_RELATIONS_DEFAULTS,
    ...ADVANCED_SANKEY_DEFAULTS,
    ...ADVANCED_CHORD_DEFAULTS,
    ...ADVANCED_RELATIONS_SHARED_DEFAULTS,
  }).map((key) => (key === 'animation' ? 'animation.enabled' : key))
);

describe('the all-options reference dashboard', () => {
  /**
   * The partition. Every option the panel registers is either demoed or explicitly
   * excused; nothing may be in both lists or in neither.
   */
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

  it('has exactly one panel per demoed option, numbered 1..n', () => {
    const panels = dashboard().panels;

    expect(panels.map((panel) => panel.id)).toEqual(Object.values(OPTION_PANEL));
    expect(panels).toHaveLength(Object.keys(OPTION_PANEL).length);
  });

  // The id is the doc's link target, so it has to be legible on the panel itself.
  it('prefixes every panel title with its id', () => {
    for (const panel of dashboard().panels) {
      expect(panel.title.startsWith(`${panel.id}. `)).toBe(true);
    }
  });

  /**
   * An Advanced value on a panel left in Default editor mode is reset before the render
   * reads it (`applyEditorModeDefaults`), so the panel would draw the default while
   * claiming to show the option — wrong in the one way a reference must not be, and
   * invisible from the JSON.
   */
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

  /**
   * A reference panel with a bare title is not a reference: each has to say what the
   * option does, what the default is, and what to look at. Asserted as a list of
   * offenders so a failure names the thin panel rather than only its length.
   */
  it('describes every panel', () => {
    const thin = dashboard()
      .panels.filter((panel) => (panel.description ?? '').length < 100)
      .map((panel) => panel.title);

    expect(thin).toEqual([]);
  });
});

describe('parity.md option links', () => {
  /**
   * Every option's row links to its panel, which is the thing that makes the doc navigable
   * option-by-option instead of pointing at a dashboard and leaving the reader to hunt.
   */
  it('references and defines a link for every panel', () => {
    const doc = parityDoc();
    const missingRef = Object.values(OPTION_PANEL).filter((id) => !doc.includes(`[#${id} opts][live-opt-${id}]`));
    const missingDef = Object.values(OPTION_PANEL).filter((id) => !doc.includes(`\n[live-opt-${id}]: `));

    expect({ missingRef, missingDef }).toEqual({ missingRef: [], missingDef: [] });
  });

  it('points every link at the dashboard uid the JSON declares', () => {
    const uid = JSON.parse(readFileSync(repoFile('provisioning/dashboards/relations/all-options.json'), 'utf8')).uid;

    expect(uid).toBe('echarts-relations-all-options');
    expect(parityDoc()).toContain(`[live-opt-1]: http://localhost:3001/d/${uid}?viewPanel=1`);
  });
});
