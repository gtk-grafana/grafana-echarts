import {
  type DataFrame,
  FieldType,
  PanelOptionsEditorBuilder,
  standardEditorsRegistry,
  toDataFrame,
} from '@grafana/data';

import { addRelationsTimelineOptions } from 'lib/grafana/editor/relations/timeline';
import { type PanelOptions } from 'types';
import { relationsOptions } from 'test/relations';

import { GRAPH_EDGES_WIDE } from 'lib/echarts/relations/converters/contract';

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

/** Check whether an option is visible for the given data. */
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
