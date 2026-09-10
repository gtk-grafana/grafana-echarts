import {
  type DataFrame,
  FieldType,
  PanelOptionsEditorBuilder,
  standardEditorsRegistry,
  toDataFrame,
} from '@grafana/data';
import { GRAPH_EDGES_WIDE } from 'lib/echarts/converters/graphWide';
import { addRelationsTimelineOptions } from 'lib/grafana/editor/relations/timeline';
import { type PanelOptions } from 'types';
import { relationsOptions } from 'test/relations';

/**
 * The "Time slider" switch's **visibility**, which is a data question rather than an
 * option one — `showIf` is handed the panel's frames, the same way "Show node values"
 * gates on `hasNoNodeStats`.
 *
 * Without the gate the switch appears on every instant panel in a dashboard, where
 * turning it on hides the reducer picker and produces nothing but an advisory.
 */

// See `advancedTier.test.ts`: the standard editor registry is filled by core app code a
// plugin cannot import, so `builder.addX` throws under jest unless the ids are stubbed.
const noEditor = (): null => null;
standardEditorsRegistry.setInit(() =>
  ['boolean', 'number', 'slider'].map((id) => ({ id, name: id, editor: noEditor }))
);

const T0 = 1700000000000;
const STEP = 300000;

const ranged = (): DataFrame =>
  toDataFrame({
    meta: { type: GRAPH_EDGES_WIDE },
    fields: [
      { name: 'Time', type: FieldType.time, values: [T0, T0 + STEP] },
      { name: 'a-->b', type: FieldType.number, values: [1, 2] },
    ],
  });

const instant = (): DataFrame =>
  toDataFrame({
    meta: { type: GRAPH_EDGES_WIDE },
    fields: [{ name: 'a-->b', type: FieldType.number, values: [1] }],
  });

/** Whether the option at `path` would render, given these options and these frames. */
const isShown = (path: string, options: PanelOptions, data?: DataFrame[]): boolean => {
  const builder = new PanelOptionsEditorBuilder<PanelOptions>();
  addRelationsTimelineOptions(builder);
  const item = builder.getItems().find((registered) => registered.path === path);
  expect(item).toBeDefined();
  return item?.showIf?.(options, data) !== false;
};

const shown = (options: Partial<PanelOptions> = {}, data?: DataFrame[]) =>
  isShown('relationsTimeSlider', relationsOptions(options), data);

describe('the Time slider switch', () => {
  it('is shown when the response has somewhere to scrub to', () => {
    expect(shown({}, [ranged()])).toBe(true);
  });

  it('is hidden on instant data', () => {
    expect(shown({}, [instant()])).toBe(false);
  });

  /**
   * The escape hatch, and the reason the gate is an `||`. The timeline comes and goes with
   * the data — a query edit, a narrowed dashboard range or a refresh returning one row —
   * and taking the switch away while it is set would leave the user with a hidden reducer
   * picker and no control to undo it.
   */
  it('stays visible on instant data once it is already on', () => {
    expect(shown({ relationsTimeSlider: true }, [instant()])).toBe(true);
    expect(shown({ relationsTimeSlider: true }, undefined)).toBe(true);
  });

  // Answers "no" when it cannot tell, which is safe precisely because of the case above.
  it('is hidden when there is no data to judge by', () => {
    expect(shown({}, undefined)).toBe(false);
    expect(shown({}, [])).toBe(false);
  });
});

describe('the Playback step input', () => {
  const stepShown = (options: Partial<PanelOptions>) =>
    isShown('relationsTimeStepDuration', relationsOptions({ editorMode: 'advanced', ...options }));

  // It configures the slider, so it cannot outlive the switch that draws one.
  it('is hidden while the slider is off', () => {
    expect(stepShown({})).toBe(false);
    expect(stepShown({ relationsTimeSlider: true })).toBe(true);
  });

  // Advanced-tier: `addAdvancedNumberInput` composes the editor-mode gate into the same
  // predicate, so the switch being on is necessary but not sufficient.
  it('is hidden in Default editor mode even with the slider on', () => {
    expect(isShown('relationsTimeStepDuration', relationsOptions({ relationsTimeSlider: true }))).toBe(false);
  });
});

/** Its sibling — how far a step moves, where the duration is how long it lasts. */
describe('the Playback step size slider', () => {
  const sizeShown = (options: Partial<PanelOptions>) =>
    isShown('relationsTimeStepSize', relationsOptions({ editorMode: 'advanced', ...options }));

  it('follows the slider switch, like the step duration', () => {
    expect(sizeShown({})).toBe(false);
    expect(sizeShown({ relationsTimeSlider: true })).toBe(true);
  });

  it('is hidden in Default editor mode', () => {
    expect(isShown('relationsTimeStepSize', relationsOptions({ relationsTimeSlider: true }))).toBe(false);
  });

  // The bounds are the control's job, not a validator's — see `addAdvancedSliderInput`.
  it('is a 1-100 percentage slider', () => {
    const builder = new PanelOptionsEditorBuilder<PanelOptions>();
    addRelationsTimelineOptions(builder);
    const item = builder.getItems().find((registered) => registered.path === 'relationsTimeStepSize');

    expect(item?.editor).toBeDefined();
    expect(item?.settings).toMatchObject({ min: 1, max: 100, step: 1 });
  });
});
