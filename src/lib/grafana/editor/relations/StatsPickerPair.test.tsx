import { type StandardEditorProps } from '@grafana/data';
import { render } from '@testing-library/react';
import React from 'react';
import { RELATIONS_MAX_CALCS, StatsPickerPair } from './StatsPickerPair';

/**
 * `StatsPicker` is stubbed so the test can report a selection the way the real widget
 * would, without driving Grafana's combobox — the thing under test is the clamp between
 * the picker and the panel options, not the widget.
 */
const pickerProps: { stats?: string[]; onChange?: (stats: string[]) => void } = {};

jest.mock('@grafana/ui', () => ({
  StatsPicker: (props: { stats: string[]; onChange: (stats: string[]) => void }) => {
    pickerProps.stats = props.stats;
    pickerProps.onChange = props.onChange;
    return null;
  },
}));

/** Render the editor and return the panel-facing `onChange` plus the picker's own. */
const renderPicker = (value?: string[]) => {
  const onChange = jest.fn();
  const props = {
    value,
    onChange,
    item: { id: 'reduceOptions.calcs', path: 'reduceOptions.calcs', name: 'Calculation', editor: () => null },
    context: { data: [], options: {} },
  } as unknown as StandardEditorProps<string[]>;

  render(<StatsPickerPair {...props} />);
  return { onChange, select: (stats: string[]) => pickerProps.onChange?.(stats) };
};

describe('StatsPickerPair', () => {
  it('shows the stored calcs, and an empty list when there are none', () => {
    renderPicker(['max', 'min']);
    expect(pickerProps.stats).toEqual(['max', 'min']);

    renderPicker(undefined);
    expect(pickerProps.stats).toEqual([]);
  });

  it('passes one and two selections straight through', () => {
    const { onChange, select } = renderPicker([]);

    select(['max']);
    expect(onChange).toHaveBeenLastCalledWith(['max']);

    select(['max', 'min']);
    expect(onChange).toHaveBeenLastCalledWith(['max', 'min']);
  });

  /**
   * The reported bug: the stock `stats-picker` has no maximum, so the control accepted
   * any number of reducers while a mark has exactly two stat slots and
   * `normalizeRelationsCalcs` dropped the rest silently.
   *
   * The *last* two are kept rather than the first, so adding a third reads as replacing
   * the secondary — dropping the extra would look like nothing happened at all.
   */
  it('keeps the last two when a third is added', () => {
    const { onChange, select } = renderPicker(['max', 'min']);

    select(['max', 'min', 'mean']);
    expect(onChange).toHaveBeenLastCalledWith(['min', 'mean']);
  });

  it('clamps however many are pasted in at once', () => {
    const { onChange, select } = renderPicker([]);

    select(['first', 'max', 'min', 'mean', 'sum']);
    expect(onChange).toHaveBeenLastCalledWith(['mean', 'sum']);
    expect(onChange.mock.lastCall?.[0]).toHaveLength(RELATIONS_MAX_CALCS);
  });

  it('lets the selection be cleared', () => {
    const { onChange, select } = renderPicker(['max']);

    select([]);
    expect(onChange).toHaveBeenLastCalledWith([]);
  });
});
